import { Transform, type TransformCallback, type TransformOptions } from "node:stream";
import { CsvDuplicateHeaderError, CsvParseError } from "./errors";
import { NestedJsonConverter } from "./nested-json-converter";
import type { CsvParserOptions, CsvRecord, DuplicateHeaderStrategy, NestedObject, ProgressCallback } from "./types";

/**
 * Options for the streaming CSV parser.
 * Extends standard TransformOptions with CSV-specific options.
 */
export interface CsvStreamParserOptions extends CsvParserOptions, TransformOptions {
	/**
	 * Callback function called periodically to report parsing progress.
	 * Can be synchronous or asynchronous.
	 *
	 * @example
	 * ```typescript
	 * const parser = new CsvStreamParser({
	 *   progressCallback: (info) => {
	 *     console.log(`Parsed ${info.recordsEmitted} records`);
	 *   }
	 * });
	 * ```
	 */
	progressCallback?: ProgressCallback;

	/**
	 * How often to call the progress callback, in number of records.
	 * The callback is invoked every N records emitted.
	 * @default 100
	 */
	progressInterval?: number;

	/**
	 * Number of records to batch together before emitting.
	 * When set to a value greater than 1, the stream emits arrays of records
	 * instead of individual records.
	 *
	 * Note: When using batchSize > 1, each 'data' event receives an array.
	 * The static parseStream() method always returns a flat array regardless
	 * of this setting.
	 *
	 * @default 1
	 *
	 * @example
	 * ```typescript
	 * const parser = new CsvStreamParser({ batchSize: 100 });
	 * for await (const batch of stream.pipe(parser)) {
	 *   // batch is an array of up to 100 records
	 *   console.log(`Received ${batch.length} records`);
	 * }
	 * ```
	 */
	batchSize?: number;

	/**
	 * Maximum number of raw rows buffered for one continuation group.
	 * Prevents unbounded memory growth when identifier values are missing.
	 * @default 10000
	 */
	maxContinuationGroupSize?: number;
}

/**
 * A streaming CSV parser that processes CSV data chunk by chunk.
 * Emits parsed records as they become available, without buffering the entire file.
 *
 * This is ideal for processing very large CSV files that don't fit in memory.
 * The parser handles quoted fields that span multiple chunks correctly.
 *
 * By default, continuation rows (rows where the identifier column is empty) are
 * grouped with the previous record to match `CsvParser` behavior.
 *
 * @example
 * ```typescript
 * import { createReadStream } from 'node:fs';
 * import { CsvStreamParser } from '@cerios/csv-nested-json';
 *
 * const parser = new CsvStreamParser({ delimiter: ',' });
 *
 * createReadStream('large-file.csv')
 *   .pipe(parser)
 *   .on('data', (record) => {
 *     console.log('Parsed record:', record);
 *   })
 *   .on('end', () => {
 *     console.log('Done parsing');
 *   })
 *   .on('error', (err) => {
 *     console.error('Parse error:', err);
 *   });
 * ```
 *
 * @example
 * ```typescript
 * // Collect all records
 * const records: NestedObject[] = [];
 * const parser = new CsvStreamParser();
 *
 * for await (const record of readStream.pipe(parser)) {
 *   records.push(record);
 * }
 * ```
 */
export class CsvStreamParser extends Transform {
	private buffer = "";
	private headers: string[] = [];
	private headersProcessed = false;
	private rowsSkipped = 0;
	private dataRowIndex = 0;
	private options: CsvStreamParserOptions;
	private delimiter: string;
	private quote: string;
	private skipRows: number;
	private stripBom: boolean;
	private bomStripped = false;
	private nullSet: Set<string>;
	private duplicateStrategy: DuplicateHeaderStrategy;
	private duplicateIndices: Set<number> = new Set();
	private includedIndices: number[] = [];

	// Progress tracking
	private bytesProcessed = 0;
	private recordsEmitted = 0;
	private startTime = 0;
	private progressInterval: number;

	// Limit tracking
	private limit: number;
	private limitReached = false;

	// Batch processing
	private batchSize: number;
	private recordBatch: NestedObject[] = [];

	// Continuation grouping
	private groupedRecords: CsvRecord[] = [];
	private groupingIdentifierColumn: string | null = null;
	private maxContinuationGroupSize: number;

	/**
	 * Creates a new streaming CSV parser.
	 *
	 * @param options - Parser options
	 *
	 * @example
	 * ```typescript
	 * const parser = new CsvStreamParser({
	 *   delimiter: ';',
	 *   quote: '"',
	 *   skipRows: 1,
	 *   autoParseNumbers: true
	 * });
	 * ```
	 */
	constructor(options: CsvStreamParserOptions = {}) {
		super({ ...options, objectMode: true });
		this.options = options;
		this.delimiter = options.delimiter || ",";
		this.quote = options.quote || '"';
		this.skipRows = options.skipRows || 0;
		this.stripBom = options.stripBom !== false;
		// Initialize null values set
		this.nullSet = new Set((options.nullValues ?? ["null", "NULL", "nil", "NIL"]).map(v => v.toLowerCase()));
		// Initialize duplicate header handling
		this.duplicateStrategy = options.duplicateHeaders ?? "error";
		// Initialize progress tracking
		this.progressInterval = options.progressInterval ?? 100;
		// Initialize limit
		this.limit = options.limit ?? 0;
		// Initialize batch processing
		this.batchSize = options.batchSize ?? 1;
		// Initialize continuation-group guard
		const maxContinuationGroupSize = options.maxContinuationGroupSize;
		if (maxContinuationGroupSize === undefined) {
			this.maxContinuationGroupSize = 10000;
		} else if (!Number.isInteger(maxContinuationGroupSize) || maxContinuationGroupSize < 1) {
			throw new CsvParseError("maxContinuationGroupSize must be a positive integer.");
		} else {
			this.maxContinuationGroupSize = maxContinuationGroupSize;
		}
	}

	/**
	 * Parse a readable stream and return all records as a Promise.
	 * This is a convenience method that collects all streamed records into an array.
	 *
	 * For true streaming with backpressure handling, use the pipe-based API instead.
	 *
	 * @typeParam T - The expected type of each record in the result array
	 * @param stream - Readable stream containing CSV data
	 * @param options - Parser options
	 * @returns Promise resolving to array of parsed records
	 *
	 * @example
	 * ```typescript
	 * import { createReadStream } from 'node:fs';
	 * import { CsvStreamParser } from '@cerios/csv-nested-json';
	 *
	 * const stream = createReadStream('data.csv');
	 * const records = await CsvStreamParser.parseStream(stream, {
	 *   delimiter: ',',
	 *   autoParseNumbers: true
	 * });
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // Parse with stream-specific options
	 * const records = await CsvStreamParser.parseStream(stream, {
	 *   batchSize: 100
	 * });
	 * ```
	 */
	static async parseStream<T = NestedObject>(
		stream: import("node:stream").Readable,
		options: CsvStreamParserOptions = {}
	): Promise<T[]> {
		const parser = new CsvStreamParser(options);
		const records: T[] = [];
		const batchSize = options.batchSize ?? 1;

		return new Promise((resolve, reject) => {
			stream
				.pipe(parser)
				.on("data", (record: T | T[]) => {
					// Flatten batches if batchSize > 1
					if (batchSize > 1 && Array.isArray(record)) {
						records.push(...record);
					} else {
						records.push(record as T);
					}
				})
				.on("end", () => {
					resolve(records);
				})
				.on("error", (error: Error) => {
					parser.destroy(); // Clean up on error
					reject(error);
				});

			// Handle source stream errors
			stream.on("error", (error: Error) => {
				parser.destroy(); // Clean up on error
				reject(error);
			});
		});
	}

	/**
	 * Transform implementation - processes incoming chunks.
	 * @internal
	 */
	_transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback): void {
		// Early exit if limit reached
		if (this.limitReached) {
			callback();
			return;
		}

		try {
			let data = typeof chunk === "string" ? chunk : chunk.toString(this.options.encoding || "utf-8");

			// Track start time on first chunk
			if (this.startTime === 0) {
				this.startTime = Date.now();
			}

			// Track bytes processed
			this.bytesProcessed += Buffer.byteLength(data, "utf-8");

			// Strip BOM from the first chunk if enabled
			if (this.stripBom && !this.bomStripped) {
				data = this.stripBomFromString(data);
				this.bomStripped = true;
			}

			this.buffer += data;
			this.processBuffer();
			callback();
		} catch (error) {
			callback(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Flush implementation - processes any remaining data.
	 * @internal
	 */
	_flush(callback: TransformCallback): void {
		try {
			// Process any remaining data in the buffer
			if (this.buffer.trim() && !this.limitReached) {
				this.processLine(this.buffer);
			}

			// Flush remaining continuation group before flushing batches.
			if (this.shouldGroupContinuationRows() && !this.limitReached) {
				this.flushGroupedRecords();
			}

			// Flush any remaining batch
			if (this.batchSize > 1 && this.recordBatch.length > 0 && !this.limitReached) {
				this.push(this.recordBatch);
				this.recordBatch = [];
			}

			callback();
		} catch (error) {
			callback(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Destroy implementation - cleans up resources.
	 * @internal
	 */
	_destroy(error: Error | null, callback: (error: Error | null) => void): void {
		// Clear internal state to release memory
		this.buffer = "";
		this.headers = [];
		this.recordBatch = [];
		this.groupedRecords = [];
		this.groupingIdentifierColumn = null;
		this.duplicateIndices.clear();
		this.includedIndices = [];
		this.nullSet.clear();

		callback(error);
	}

	/**
	 * Strip BOM from the beginning of a string.
	 */
	private stripBomFromString(content: string): string {
		if (content.length === 0) return content;

		// UTF-8 BOM or UTF-16 BE BOM
		if (content.charCodeAt(0) === 0xfeff) {
			return content.slice(1);
		}

		// UTF-16 LE BOM
		if (content.charCodeAt(0) === 0xfffe) {
			return content.slice(1);
		}

		return content;
	}

	/**
	 * Process the buffer and extract complete lines.
	 */
	private processBuffer(): void {
		let insideQuotes = false;
		let lineStart = 0;

		for (let i = 0; i < this.buffer.length; i++) {
			const char = this.buffer[i];
			const nextChar = i + 1 < this.buffer.length ? this.buffer[i + 1] : "";

			if (char === this.quote) {
				insideQuotes = !insideQuotes;
			} else if (!insideQuotes) {
				// Check for line endings
				if (char === "\r" && nextChar === "\n") {
					// CRLF
					const line = this.buffer.slice(lineStart, i);
					this.processLine(line);
					i++; // Skip the \n
					lineStart = i + 1;
				} else if (char === "\n" || char === "\r") {
					// LF or CR
					const line = this.buffer.slice(lineStart, i);
					this.processLine(line);
					lineStart = i + 1;
				}
			}
		}

		// Keep any incomplete line in the buffer
		this.buffer = this.buffer.slice(lineStart);
	}

	/**
	 * Process a single line of CSV data.
	 */
	private processLine(line: string): void {
		// Early exit if limit reached
		if (this.limitReached) {
			return;
		}

		// Skip empty lines
		if (line.trim() === "") {
			return;
		}

		// Skip initial rows if configured
		if (this.rowsSkipped < this.skipRows) {
			this.rowsSkipped++;
			return;
		}

		const values = this.parseLine(line);

		// First non-skipped line is the header
		if (!this.headersProcessed) {
			const originalHeaders = values;

			// Apply column filtering FIRST (based on original header names)
			const { filteredHeaders: filteredOriginalHeaders, includedIndices } = this.filterColumns(originalHeaders);
			this.includedIndices = includedIndices;

			// Apply header transformer if specified
			let headers = filteredOriginalHeaders;
			if (this.options.headerTransformer) {
				headers = headers.map(this.options.headerTransformer);
			}

			// Apply column mapping if specified (based on transformed header names)
			if (this.options.columnMapping) {
				headers = headers.map(h => this.options.columnMapping?.[h] ?? h);
			}

			// Handle duplicate headers (after all transformations)
			const { processedHeaders, duplicateIndices } = this.detectAndProcessDuplicateHeaders(
				headers,
				this.duplicateStrategy,
				this.skipRows + 1
			);
			this.headers = processedHeaders;
			this.duplicateIndices = duplicateIndices;
			this.groupingIdentifierColumn = this.resolveGroupingIdentifierColumn();

			this.headersProcessed = true;
			return;
		}

		// Create record from values
		const record = this.createRecord(values);

		// Apply row filter if specified
		if (this.options.rowFilter && !this.options.rowFilter(record, this.dataRowIndex)) {
			this.dataRowIndex++;
			return;
		}
		this.dataRowIndex++;

		if (this.shouldGroupContinuationRows()) {
			this.bufferGroupedRecord(record);
			return;
		}

		// Apply transformations if needed
		const transformed = this.applyTransformations(record);

		// Fallback path (not expected in current configuration): emit nested object.
		const outputRecord = this.unflatten(transformed);
		this.emitRecord(outputRecord as NestedObject);
	}

	/**
	 * Whether continuation grouping should be applied for this parser instance.
	 */
	private shouldGroupContinuationRows(): boolean {
		return true;
	}

	/**
	 * Determine the column used for continuation grouping.
	 */
	private resolveGroupingIdentifierColumn(): string {
		const configuredIdentifier = this.options.identifierColumn;
		if (configuredIdentifier) {
			if (this.headers.includes(configuredIdentifier)) {
				return configuredIdentifier;
			}

			const availableColumns = this.headers.length > 0 ? this.headers.join(", ") : "(none)";

			throw new CsvParseError(
				`identifierColumn '${configuredIdentifier}' not found in headers. Available columns: ${availableColumns}`
			);
		}

		if (this.headers.length === 0) {
			throw new CsvParseError(
				"No columns available after filtering. Cannot resolve identifier column for continuation row grouping."
			);
		}

		return this.headers[0];
	}

	/**
	 * Add a record to the active continuation group with memory guardrails.
	 */
	private pushGroupedRecord(record: CsvRecord): void {
		if (this.groupedRecords.length >= this.maxContinuationGroupSize) {
			const identifierColumn = this.groupingIdentifierColumn ?? this.options.identifierColumn ?? "(unknown)";
			throw new CsvParseError(
				`Continuation group exceeded maxContinuationGroupSize (${this.maxContinuationGroupSize}) while grouping by '${identifierColumn}'.`
			);
		}

		this.groupedRecords.push(record);
	}

	/**
	 * Buffer records and flush groups when a new identifier value is encountered.
	 */
	private bufferGroupedRecord(record: CsvRecord): void {
		const identifierColumn = this.groupingIdentifierColumn;
		const identifierValue = identifierColumn ? record[identifierColumn] : undefined;
		const startsNewGroup =
			identifierValue !== undefined && identifierValue !== null && String(identifierValue).trim() !== "";

		if (this.groupedRecords.length === 0) {
			if (!startsNewGroup) {
				const rowNumber = this.skipRows + this.dataRowIndex + 1;
				throw new CsvParseError(
					`Row ${rowNumber} is a continuation row, but no base row exists. Column '${identifierColumn ?? "(unknown)"}' must have a value to start a group.`
				);
			}

			this.pushGroupedRecord(record);
			return;
		}

		if (startsNewGroup) {
			this.flushGroupedRecords();
			if (this.limitReached) return;
		}

		this.pushGroupedRecord(record);
	}

	/**
	 * Flush buffered grouped records through NestedJsonConverter.
	 */
	private flushGroupedRecords(): void {
		if (this.groupedRecords.length === 0) return;

		const recordsToFlush = this.groupedRecords;
		this.groupedRecords = [];

		const groupedOutput = NestedJsonConverter.convert(recordsToFlush, this.options);
		for (const record of groupedOutput) {
			this.emitRecord(record);
			if (this.limitReached) return;
		}
	}

	/**
	 * Emit a single parsed output record while respecting batching, limits, and progress callbacks.
	 */
	private emitRecord(outputRecord: NestedObject): void {
		// Handle batching
		if (this.batchSize > 1) {
			this.recordBatch.push(outputRecord as NestedObject);
			if (this.recordBatch.length >= this.batchSize) {
				this.push(this.recordBatch);
				this.recordBatch = [];
			}
		} else {
			this.push(outputRecord);
		}

		// Track records emitted (count individual records, not batches)
		this.recordsEmitted++;

		// Check limit (applied after row filtering)
		if (this.limit > 0 && this.recordsEmitted >= this.limit) {
			this.limitReached = true;
			// Flush any remaining batch before ending
			if (this.batchSize > 1 && this.recordBatch.length > 0) {
				this.push(this.recordBatch);
				this.recordBatch = [];
			}
			this.push(null); // Signal end of stream
			return;
		}

		// Call progress callback if configured
		if (this.options.progressCallback && this.recordsEmitted % this.progressInterval === 0) {
			const result = this.options.progressCallback({
				bytesProcessed: this.bytesProcessed,
				recordsEmitted: this.recordsEmitted,
				headersProcessed: this.headersProcessed,
				elapsedMs: Date.now() - this.startTime,
			});
			// Handle async callback
			if (result instanceof Promise) {
				result.catch(() => {}); // Ignore errors in callback
			}
		}
	}

	/**
	 * Parse a single line into values.
	 */
	private parseLine(line: string): string[] {
		const values: string[] = [];
		let currentValue = "";
		let insideQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const nextChar = i + 1 < line.length ? line[i + 1] : "";

			if (char === this.quote) {
				if (insideQuotes && nextChar === this.quote) {
					// Escaped quote
					currentValue += this.quote;
					i++;
				} else {
					insideQuotes = !insideQuotes;
				}
			} else if (char === this.delimiter && !insideQuotes) {
				values.push(currentValue);
				currentValue = "";
			} else {
				currentValue += char;
			}
		}

		values.push(currentValue);
		return values;
	}

	/**
	 * Create a record object from values array.
	 */
	private createRecord(values: string[]): Record<string, string> {
		const record: Record<string, string> = {};
		for (let i = 0; i < this.headers.length; i++) {
			// Get the original column index for this filtered header
			const originalIndex = this.includedIndices[i];
			let value = originalIndex < values.length ? values[originalIndex] : "";

			// Apply default value if cell is empty
			if (value === "" && this.options.defaultValues?.[this.headers[i]] !== undefined) {
				value = this.options.defaultValues[this.headers[i]];
			}

			const header = this.headers[i];

			// Handle duplicate values based on strategy
			if (this.duplicateIndices.has(i)) {
				switch (this.duplicateStrategy) {
					case "first":
						// Only set if not already present
						if (!(header in record)) {
							record[header] = value;
						}
						break;
					case "combine":
						// Combine into comma-separated values
						if (header in record) {
							record[header] = record[header] ? `${record[header]},${value}` : value;
						} else {
							record[header] = value;
						}
						break;
					default:
						// Just overwrite (default behavior)
						record[header] = value;
						break;
				}
			} else {
				record[header] = value;
			}
		}
		return record;
	}

	/**
	 * Apply value transformations to a record.
	 */
	private applyTransformations(
		record: Record<string, string>
	): Record<string, string | number | boolean | Date | null | undefined> {
		const {
			autoParseNumbers,
			preserveUnsafeIntegersAsString,
			autoParseBooleans,
			autoParseDates,
			valueTransformer,
			nullValues,
			nullRepresentation,
		} = this.options;

		if (!autoParseNumbers && !autoParseBooleans && !autoParseDates && !valueTransformer && nullValues === undefined) {
			return record;
		}

		const transformed: Record<string, string | number | boolean | Date | null | undefined> = {};

		for (const [header, value] of Object.entries(record)) {
			let transformedValue: string | number | boolean | Date | null | undefined = value;

			// Handle empty values
			if (value === "") {
				// Check if empty string is in nullValues
				if (nullValues !== undefined && this.nullSet.has("")) {
					transformedValue = this.applyNullRepresentation(nullRepresentation);
					if (nullRepresentation === "omit") {
						continue; // Skip this field
					}
				}
				transformed[header] = transformedValue;
				continue;
			}

			// Step 0: Check for null values
			if (nullValues !== undefined && this.nullSet.has(value.toLowerCase())) {
				const nullVal = this.applyNullRepresentation(nullRepresentation);
				if (nullRepresentation === "omit") {
					continue; // Skip this field
				}
				transformed[header] = nullVal;
				continue;
			}

			// Auto-parse numbers
			if (autoParseNumbers) {
				const parsed = this.tryParseNumber(value, preserveUnsafeIntegersAsString);
				if (parsed !== null) {
					transformedValue = parsed;
				}
			}

			// Auto-parse booleans
			if (autoParseBooleans && typeof transformedValue === "string") {
				const parsed = this.tryParseBoolean(value);
				if (parsed !== null) {
					transformedValue = parsed;
				}
			}

			// Auto-parse dates
			if (autoParseDates && typeof transformedValue === "string") {
				const parsed = this.tryParseDate(value);
				if (parsed !== null) {
					transformedValue = parsed;
				}
			}

			// Custom transformer
			if (valueTransformer) {
				transformedValue = valueTransformer(transformedValue as string | number | boolean, header) as
					| string
					| number
					| boolean
					| Date;
			}

			transformed[header] = transformedValue;
		}

		return transformed;
	}

	/**
	 * Apply null representation based on option.
	 */
	private applyNullRepresentation(
		representation: CsvStreamParserOptions["nullRepresentation"]
	): null | undefined | string {
		switch (representation) {
			case "null":
				return null;
			case "undefined":
				return undefined;
			case "empty-string":
				return "";
			default:
				return undefined;
		}
	}

	/**
	 * Try to parse a string as a number.
	 */
	private tryParseNumber(value: string, preserveUnsafeIntegersAsString?: boolean): number | string | null {
		if (value.trim() === "") return null;
		if (/^0\d+$/.test(value)) return null;

		const parsed = Number(value);
		if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
			if (preserveUnsafeIntegersAsString && /^-?\d+$/.test(value) && !Number.isSafeInteger(parsed)) {
				return value;
			}
			return parsed;
		}
		return null;
	}

	/**
	 * Try to parse a string as a boolean.
	 */
	private tryParseBoolean(value: string): boolean | null {
		const lower = value.toLowerCase().trim();
		if (lower === "true") return true;
		if (lower === "false") return false;
		return null;
	}

	/**
	 * Try to parse a string as a Date.
	 * Uses JavaScript's Date.parse() for recognition.
	 */
	private tryParseDate(value: string): Date | null {
		// Don't parse empty strings or pure numbers
		if (value.trim() === "" || /^-?\d+(\.\d+)?$/.test(value)) return null;

		// Try to parse as date
		const timestamp = Date.parse(value);
		if (!Number.isNaN(timestamp)) {
			return new Date(timestamp);
		}

		return null;
	}

	/**
	 * Unflatten a record with dot-notation keys into a nested object.
	 */
	private unflatten(record: Record<string, string | number | boolean | Date | null | undefined>): NestedObject {
		const result: NestedObject = {};

		for (const [key, value] of Object.entries(record)) {
			// Skip empty strings and undefined, but preserve null as a valid value
			if (value === "" || value === undefined) continue;

			// Remove array suffix if present
			const arraySuffix = this.options.arraySuffixIndicator ?? "[]";
			const normalizedKey = key
				.split(".")
				.map(part => (part.endsWith(arraySuffix) ? part.slice(0, -arraySuffix.length) : part))
				.join(".");

			const parts = normalizedKey.split(".");
			let current: NestedObject = result;

			for (let i = 0; i < parts.length - 1; i++) {
				const part = parts[i];
				if (!current[part]) {
					current[part] = {};
				}
				current = current[part] as NestedObject;
			}

			current[parts[parts.length - 1]] = value;
		}

		return result;
	}

	/**
	 * Detect duplicate headers and process them according to the strategy.
	 */
	private detectAndProcessDuplicateHeaders(
		headers: string[],
		strategy: DuplicateHeaderStrategy,
		headerRow: number
	): { processedHeaders: string[]; duplicateIndices: Set<number> } {
		// Build a map of header -> list of indices
		const headerMap = new Map<string, number[]>();
		for (let i = 0; i < headers.length; i++) {
			const key = headers[i];
			const indices = headerMap.get(key) || [];
			indices.push(i);
			headerMap.set(key, indices);
		}

		// Find which headers have duplicates
		const duplicateHeaders: string[] = [];
		const duplicateIndices = new Set<number>();

		for (const [_key, indices] of headerMap.entries()) {
			if (indices.length > 1) {
				duplicateHeaders.push(headers[indices[0]]);
				for (const idx of indices) {
					duplicateIndices.add(idx);
				}
			}
		}

		// If no duplicates, return original headers
		if (duplicateHeaders.length === 0) {
			return { processedHeaders: headers, duplicateIndices };
		}

		// Apply strategy
		switch (strategy) {
			case "error":
				throw new CsvDuplicateHeaderError(duplicateHeaders, headerRow);

			case "rename": {
				const processedHeaders = [...headers];
				for (const indices of headerMap.values()) {
					if (indices.length > 1) {
						for (let i = 1; i < indices.length; i++) {
							const originalIdx = indices[i];
							processedHeaders[originalIdx] = `${headers[originalIdx]}_${i}`;
						}
					}
				}
				return { processedHeaders, duplicateIndices };
			}

			case "combine":
			case "first":
			case "last":
				// These strategies don't modify headers, just affect value assignment
				return { processedHeaders: headers, duplicateIndices };

			default:
				return { processedHeaders: headers, duplicateIndices };
		}
	}

	/**
	 * Filter columns based on includeColumns and excludeColumns options.
	 */
	private filterColumns(headers: string[]): { filteredHeaders: string[]; includedIndices: number[] } {
		const { includeColumns, excludeColumns, validationMode } = this.options;

		// If no filtering specified, include all
		if ((!includeColumns || includeColumns.length === 0) && (!excludeColumns || excludeColumns.length === 0)) {
			return {
				filteredHeaders: headers,
				includedIndices: headers.map((_, i) => i),
			};
		}

		const headerSet = new Set(headers);
		let indicesToInclude: number[];

		// Step 1: Apply includeColumns first (if specified)
		if (includeColumns && includeColumns.length > 0) {
			const includeSet = new Set(includeColumns);

			// Warn about columns that don't exist
			for (const col of includeColumns) {
				if (!headerSet.has(col) && validationMode !== "ignore") {
					const message = `Column '${col}' specified in includeColumns does not exist in the CSV headers.`;
					if (validationMode === "warn" || validationMode === undefined) {
						// biome-ignore lint/suspicious/noConsole: User explicitly requested warning mode
						console.warn(`Warning: ${message}`);
					}
				}
			}

			indicesToInclude = headers.map((h, i) => (includeSet.has(h) ? i : -1)).filter(i => i !== -1);
		} else {
			// Start with all columns
			indicesToInclude = headers.map((_, i) => i);
		}

		// Step 2: Apply excludeColumns (filter from the result)
		if (excludeColumns && excludeColumns.length > 0) {
			const excludeSet = new Set(excludeColumns);
			indicesToInclude = indicesToInclude.filter(i => !excludeSet.has(headers[i]));
		}

		const filteredHeaders = indicesToInclude.map(i => headers[i]);

		return { filteredHeaders, includedIndices: indicesToInclude };
	}
}
