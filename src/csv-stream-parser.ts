import { Transform, type TransformCallback, type TransformOptions } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import { CsvDuplicateHeaderError, CsvEncodingError, CsvParseError, CsvValidationError } from "./errors";
import {
	type InternalCsvCellValue,
	type InternalCsvRecord,
	isEmptyCsvCellValue,
	QUOTED_EMPTY_CELL,
	toPublicCsvCellValue,
} from "./internal-empty-cell";
import { NestedJsonConverter } from "./nested-json-converter";
import { assertDelimiterAndQuote, isLeadingSpaceOnly, warnInertOptions } from "./option-validation";
import {
	needsValueTransformation,
	resolveNullSet,
	type TransformedRecord,
	transformRecordValues,
	unflattenRecord,
} from "./record-transform";
import type { CsvParserOptions, DuplicateHeaderStrategy, NestedObject, ProgressCallback } from "./types";

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
	private decoder: StringDecoder;
	private headers: string[] = [];
	private headersProcessed = false;
	private rowsSkipped = 0;
	private dataRowIndex = 0;
	private physicalLineNumber = 0;
	private options: CsvStreamParserOptions;
	// Options for the per-group converter, with stream-level `offset`/`limit` removed so they are
	// not re-applied inside each group's convert() call.
	private converterOptions: CsvStreamParserOptions;
	private delimiter: string;
	private quote: string;
	private trimLeadingSpace: boolean;
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

	// Offset tracking (records skipped before collecting output)
	private offset: number;
	private skippedForOffset = 0;

	// Batch processing
	private batchSize: number;
	private recordBatch: NestedObject[] = [];

	// Continuation grouping
	private groupedRecords: InternalCsvRecord[] = [];
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
	/**
	 * Validate the configured encoding and produce the options passed to the Transform base class.
	 * `encoding` is stripped because we decode chunks ourselves; leaving it in would make Readable
	 * throw a generic TypeError for an unknown value instead of our {@link CsvEncodingError}.
	 *
	 * @throws {CsvEncodingError} If the encoding is not a recognized Node.js buffer encoding.
	 */
	private static toTransformOptions(options: CsvStreamParserOptions): TransformOptions {
		const encoding = options.encoding || "utf-8";
		if (!Buffer.isEncoding(encoding)) {
			throw new CsvEncodingError(`Unsupported encoding: '${String(encoding)}'.`, encoding);
		}

		const { encoding: _ignored, ...rest } = options;
		return { ...rest, objectMode: true };
	}

	constructor(options: CsvStreamParserOptions = {}) {
		// Validate the encoding and strip it from the Transform options before calling super:
		// Readable's own `encoding` option would otherwise throw a generic TypeError for an unknown
		// value. Chunk decoding is handled below by our own StringDecoder.
		super(CsvStreamParser.toTransformOptions(options));
		this.options = options;
		this.converterOptions = { ...options, offset: undefined, limit: undefined };
		this.delimiter = options.delimiter || ",";
		this.quote = options.quote || '"';
		assertDelimiterAndQuote(this.delimiter, this.quote);
		warnInertOptions(options);
		this.trimLeadingSpace = options.trimLeadingSpace === true;
		this.skipRows = options.skipRows || 0;
		this.stripBom = options.stripBom !== false;
		// Decode incoming Buffer chunks with a stateful decoder so that multibyte
		// characters split across chunk boundaries are reassembled correctly.
		this.decoder = new StringDecoder(options.encoding || "utf-8");
		// Initialize null values set
		this.nullSet = resolveNullSet(options);
		// Initialize duplicate header handling
		this.duplicateStrategy = options.duplicateHeaders ?? "error";
		// Initialize progress tracking
		this.progressInterval = options.progressInterval ?? 100;
		// Initialize limit
		this.limit = options.limit ?? 0;
		// Initialize offset (records skipped before any output is collected)
		this.offset = options.offset && options.offset > 0 ? options.offset : 0;
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
			// Track bytes processed based on the raw input, before decoding.
			this.bytesProcessed += Buffer.isBuffer(chunk)
				? chunk.length
				: Buffer.byteLength(chunk, this.options.encoding || "utf-8");

			// Decode through the stateful decoder so multibyte characters spanning
			// chunk boundaries are not corrupted.
			let data = Buffer.isBuffer(chunk) ? this.decoder.write(chunk) : chunk;

			// Track start time on first chunk
			if (this.startTime === 0) {
				this.startTime = Date.now();
			}

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
			// Drain any bytes still held by the decoder (incomplete trailing sequence).
			const remaining = this.decoder.end();
			if (remaining) {
				this.buffer += remaining;
				this.processBuffer();
			}

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

		// Normal case: a correctly decoded UTF-8 or UTF-16 BOM is U+FEFF.
		if (content.charCodeAt(0) === 0xfeff) {
			return content.slice(1);
		}

		// Byte-swapped BOM: U+FFFE appears when a UTF-16BE file is decoded as UTF-16LE (Node has no
		// native utf-16be encoding). Strip it defensively so the leading noncharacter is not kept.
		if (content.charCodeAt(0) === 0xfffe) {
			return content.slice(1);
		}

		return content;
	}

	/**
	 * Process the buffer and extract complete lines.
	 */
	private processBuffer(): void {
		// Fast path: with no quote character anywhere in the pending buffer, no field can span a line
		// boundary, so line breaks can be located with indexOf instead of a per-character scan.
		// Comment/blank/validation handling all live in processLine, so delegating each complete line
		// keeps behavior identical to the slow path (parity with the buffered tokenizer's fast path).
		if (this.buffer.indexOf(this.quote) === -1) {
			this.processBufferNoQuote();
			return;
		}

		const commentPrefix = this.options.commentPrefix;
		const hasComments = commentPrefix !== undefined && commentPrefix !== "";
		let insideQuotes = false;
		// Track field boundaries so a quote is treated as special only at the start of a field
		// (RFC 4180). This keeps a literal mid-field quote from suppressing newline splitting.
		let atFieldStart = true;
		let fieldWasQuoted = false;
		let lineStart = 0;

		for (let i = 0; i < this.buffer.length; i++) {
			// Skip a complete comment line at line start without tokenizing it, so a stray quote in a
			// comment cannot swallow the following line.
			if (hasComments && i === lineStart && !insideQuotes && this.buffer.startsWith(commentPrefix, i)) {
				let j = i;
				while (j < this.buffer.length && this.buffer[j] !== "\n" && this.buffer[j] !== "\r") j++;
				if (j >= this.buffer.length) {
					// No terminator yet — leave the (possibly partial) comment line buffered.
					break;
				}
				if (this.buffer[j] === "\r" && this.buffer[j + 1] === "\n") j++;
				i = j;
				lineStart = i + 1;
				atFieldStart = true;
				fieldWasQuoted = false;
				continue;
			}

			const char = this.buffer[i];
			const nextChar = i + 1 < this.buffer.length ? this.buffer[i + 1] : "";

			if (char === this.quote) {
				if (insideQuotes) {
					if (nextChar === this.quote) {
						i++; // Escaped quote stays inside the quoted field
					} else {
						insideQuotes = false; // Closing quote
					}
				} else if (atFieldStart && !fieldWasQuoted) {
					insideQuotes = true; // Opening quote at field start
					fieldWasQuoted = true;
				}
				// A quote anywhere else is a literal character.
				atFieldStart = false;
			} else if (!insideQuotes && char === this.delimiter) {
				// New field begins after a delimiter.
				atFieldStart = true;
				fieldWasQuoted = false;
			} else if (!insideQuotes && (char === "\r" || char === "\n")) {
				// Line ending
				if (char === "\r" && nextChar === "\n") {
					const line = this.buffer.slice(lineStart, i);
					this.processLine(line);
					i++; // Skip the \n
					lineStart = i + 1;
				} else {
					const line = this.buffer.slice(lineStart, i);
					this.processLine(line);
					lineStart = i + 1;
				}
				// A new line starts a new record and a new first field.
				atFieldStart = true;
				fieldWasQuoted = false;
			} else if (!(this.trimLeadingSpace && atFieldStart && char === " ")) {
				// Any other character ends the field-start region. With trimLeadingSpace, a leading
				// space is skipped so a following quote can still open the field (kept in lockstep
				// with the tokenizer/parseLine open condition).
				atFieldStart = false;
			}
		}

		// Keep any incomplete line in the buffer
		this.buffer = this.buffer.slice(lineStart);
	}

	/**
	 * Line-splitting fast path for a buffer known to contain no quote characters. Locates line
	 * terminators via indexOf and delegates each complete line to {@link processLine}; the final
	 * partial line (if any) stays buffered for the next chunk.
	 */
	private processBufferNoQuote(): void {
		let lineStart = 0;

		for (;;) {
			const nl = this.buffer.indexOf("\n", lineStart);
			const cr = this.buffer.indexOf("\r", lineStart);

			let brk: number;
			if (nl === -1) brk = cr;
			else if (cr === -1) brk = nl;
			else brk = Math.min(nl, cr);

			if (brk === -1) break; // No complete line left; keep the remainder buffered.

			this.processLine(this.buffer.slice(lineStart, brk));

			// Consume a CRLF pair as a single terminator.
			if (this.buffer[brk] === "\r" && this.buffer[brk + 1] === "\n") {
				lineStart = brk + 2;
			} else {
				lineStart = brk + 1;
			}
		}

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

		// Comment lines are removed entirely (not header, not data) and are not counted.
		const commentPrefix = this.options.commentPrefix;
		if (commentPrefix !== undefined && commentPrefix !== "" && line.startsWith(commentPrefix)) {
			return;
		}

		// Count every physical line (blank/skipped/header/data) so validation error messages report
		// the same 1-based source line number as the buffered parser.
		this.physicalLineNumber++;

		// Skip empty lines
		if (line.trim() === "") {
			return;
		}

		// Skip initial rows if configured
		if (this.rowsSkipped < this.skipRows) {
			this.rowsSkipped++;
			return;
		}

		// First non-skipped line is the header
		if (!this.headersProcessed) {
			const values = this.parseLine(line, false);
			const originalHeaders = values;

			// Apply column filtering FIRST (based on original header names)
			const { filteredHeaders: filteredOriginalHeaders, includedIndices } = this.filterColumns(originalHeaders);
			this.includedIndices = includedIndices;

			// Apply column mapping if specified (based on the raw/filtered header names)
			let headers = filteredOriginalHeaders;
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

		const values = this.parseLine(line, true);

		// Validate column count (parity with the buffered parser). Extra values are ignored;
		// how that is surfaced depends on validationMode.
		const validationMode = this.options.validationMode || "warn";
		if (values.length > this.headers.length && validationMode !== "ignore") {
			const message = `Row ${this.physicalLineNumber} has ${values.length} values but only ${this.headers.length} columns defined. Extra values will be ignored.`;

			if (validationMode === "error") {
				throw new CsvValidationError(message, this.physicalLineNumber, this.headers.length, values.length);
			}
			if (validationMode === "warn") {
				console.warn(`Warning: ${message}`);
			}
		}

		// Too-few-columns is only enforced in strict 'error' mode (parity with the buffered parser).
		if (values.length < this.headers.length && validationMode === "error") {
			const message = `Row ${this.physicalLineNumber} has ${values.length} values but ${this.headers.length} columns are defined.`;
			throw new CsvValidationError(message, this.physicalLineNumber, this.headers.length, values.length);
		}

		// Create record from values
		const record = this.createRecord(values);
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
	private pushGroupedRecord(record: InternalCsvRecord): void {
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
	private bufferGroupedRecord(record: InternalCsvRecord): void {
		const identifierColumn = this.groupingIdentifierColumn;
		const identifierValue = identifierColumn ? record[identifierColumn] : undefined;
		const startsNewGroup = this.hasIdentifierValue(identifierValue);

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

	private hasIdentifierValue(value: InternalCsvCellValue | undefined): boolean {
		if (isEmptyCsvCellValue(value)) {
			return false;
		}

		return String(value).trim() !== "";
	}

	/**
	 * Flush buffered grouped records through NestedJsonConverter.
	 */
	private flushGroupedRecords(): void {
		if (this.groupedRecords.length === 0) return;

		const recordsToFlush = this.groupedRecords;
		this.groupedRecords = [];

		// The stream applies `offset` and `limit` itself across the whole record stream. They must
		// not leak into the per-group convert(), which would otherwise re-apply them to each single
		// group's records (offset would slice every group away; limit is a no-op only by luck).
		const groupedOutput = NestedJsonConverter.convert(recordsToFlush, this.converterOptions);
		for (const record of groupedOutput) {
			this.emitRecord(record);
			if (this.limitReached) return;
		}
	}

	/**
	 * Emit a single parsed output record while respecting batching, limits, and progress callbacks.
	 */
	private emitRecord(outputRecord: NestedObject): void {
		// Skip the first `offset` output records entirely: they must not be pushed, batched, or
		// counted toward `limit`/progress, so `limit` caps the records *after* the offset window
		// (parity with the buffered `groups.slice(offset, offset + limit)`).
		if (this.skippedForOffset < this.offset) {
			this.skippedForOffset++;
			return;
		}

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
	private parseLine(line: string, preserveQuotedEmpty: false): string[];
	private parseLine(line: string, preserveQuotedEmpty: true): InternalCsvCellValue[];
	private parseLine(line: string, preserveQuotedEmpty: boolean): InternalCsvCellValue[] {
		const trimValues = this.options.trimValues === true;

		// Fast path: a line with no quote character has no quoted fields, so a native split is
		// exact (no field was quoted, so finalizeParsedCellValue would be a no-op anyway).
		if (line.indexOf(this.quote) === -1) {
			const cells = line.split(this.delimiter);
			return trimValues ? cells.map(cell => cell.trim()) : cells;
		}

		const values: InternalCsvCellValue[] = [];
		let currentValue = "";
		let insideQuotes = false;
		let fieldWasQuoted = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const nextChar = i + 1 < line.length ? line[i + 1] : "";

			if (char === this.quote) {
				if (insideQuotes) {
					if (nextChar === this.quote) {
						// Escaped quote inside a quoted field
						currentValue += this.quote;
						i++;
					} else {
						// Closing quote
						insideQuotes = false;
					}
				} else if (
					!fieldWasQuoted &&
					(currentValue === "" || (this.trimLeadingSpace && isLeadingSpaceOnly(currentValue)))
				) {
					// Opening quote (only special at the start of a field, per RFC 4180). With
					// trimLeadingSpace, leading spaces before the quote are discarded so the quote
					// still opens the field.
					currentValue = "";
					insideQuotes = true;
					fieldWasQuoted = true;
				} else {
					// A quote in the middle of an unquoted field is a literal character
					currentValue += this.quote;
				}
			} else if (char === this.delimiter && !insideQuotes) {
				values.push(this.finalizeParsedCellValue(currentValue, fieldWasQuoted, preserveQuotedEmpty, trimValues));
				currentValue = "";
				fieldWasQuoted = false;
			} else {
				currentValue += char;
			}
		}

		values.push(this.finalizeParsedCellValue(currentValue, fieldWasQuoted, preserveQuotedEmpty, trimValues));
		return values;
	}

	private finalizeParsedCellValue(
		value: string,
		fieldWasQuoted: boolean,
		preserveQuotedEmpty: boolean,
		trimValues = false
	): InternalCsvCellValue {
		// Trim only unquoted fields so quoted whitespace is preserved verbatim.
		if (trimValues && !fieldWasQuoted) {
			value = value.trim();
		}

		if (preserveQuotedEmpty && fieldWasQuoted && value === "") {
			return QUOTED_EMPTY_CELL;
		}

		return value;
	}

	/**
	 * Create a record object from values array.
	 */
	private createRecord(values: InternalCsvCellValue[]): InternalCsvRecord {
		const record: InternalCsvRecord = {};
		for (let i = 0; i < this.headers.length; i++) {
			// Get the original column index for this filtered header
			const originalIndex = this.includedIndices[i];
			const value: InternalCsvCellValue = originalIndex < values.length ? values[originalIndex] : "";

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
					case "combine": {
						// Combine into comma-separated values
						const incoming = toPublicCsvCellValue(value);
						if (header in record) {
							const existing = toPublicCsvCellValue(record[header]);
							record[header] = existing ? `${existing},${incoming}` : incoming;
						} else {
							record[header] = incoming;
						}
						break;
					}
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
	 *
	 * Delegates to the shared {@link transformRecordValues} so the buffered and streaming paths
	 * stay in lockstep.
	 */
	private applyTransformations(record: InternalCsvRecord): TransformedRecord {
		if (!needsValueTransformation(this.options)) {
			return record;
		}

		return transformRecordValues(record, this.options, this.nullSet);
	}

	/**
	 * Unflatten a record with dot-notation keys into a nested object.
	 */
	private unflatten(record: TransformedRecord): NestedObject {
		return unflattenRecord(record, this.options);
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
