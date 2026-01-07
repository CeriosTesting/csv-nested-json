import { Transform, type TransformCallback, type TransformOptions } from "node:stream";
import type { CsvParserOptions, NestedObject } from "./types";

/**
 * Options for the streaming CSV parser.
 * Extends standard TransformOptions with CSV-specific options.
 */
export interface CsvStreamParserOptions extends CsvParserOptions, TransformOptions {
	/**
	 * Whether to emit nested objects (true) or flat records (false).
	 * When true, records are converted using NestedJsonConverter logic.
	 * When false, raw flat records are emitted.
	 * @default true
	 */
	nested?: boolean;
}

/**
 * A streaming CSV parser that processes CSV data chunk by chunk.
 * Emits parsed records as they become available, without buffering the entire file.
 *
 * This is ideal for processing very large CSV files that don't fit in memory.
 * The parser handles quoted fields that span multiple chunks correctly.
 *
 * Note: For true nested JSON conversion with continuation rows (rows that extend
 * previous records), consider using the standard CsvParser methods, as continuation
 * row handling requires buffering related rows together.
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
	}

	/**
	 * Transform implementation - processes incoming chunks.
	 * @internal
	 */
	_transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback): void {
		try {
			let data = typeof chunk === "string" ? chunk : chunk.toString(this.options.encoding || "utf-8");

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
			if (this.buffer.trim()) {
				this.processLine(this.buffer);
			}
			callback();
		} catch (error) {
			callback(error instanceof Error ? error : new Error(String(error)));
		}
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
			this.headers = values;

			// Apply header transformer if specified
			if (this.options.headerTransformer) {
				this.headers = this.headers.map(this.options.headerTransformer);
			}

			// Apply column mapping if specified
			if (this.options.columnMapping) {
				this.headers = this.headers.map(h => this.options.columnMapping?.[h] ?? h);
			}

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

		// Apply transformations if needed
		const transformed = this.applyTransformations(record);

		// Convert to nested if enabled (default)
		const nested = this.options.nested !== false;
		if (nested) {
			const nestedRecord = this.unflatten(transformed);
			this.push(nestedRecord);
		} else {
			this.push(transformed);
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
			let value = i < values.length ? values[i] : "";

			// Apply default value if cell is empty
			if (value === "" && this.options.defaultValues?.[this.headers[i]] !== undefined) {
				value = this.options.defaultValues[this.headers[i]];
			}

			record[this.headers[i]] = value;
		}
		return record;
	}

	/**
	 * Apply value transformations to a record.
	 */
	private applyTransformations(
		record: Record<string, string>
	): Record<string, string | number | boolean | Date | null | undefined> {
		const { autoParseNumbers, autoParseBooleans, autoParseDates, valueTransformer, nullValues, nullRepresentation } =
			this.options;

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
				const parsed = this.tryParseNumber(value);
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
			case "omit":
			default:
				return undefined;
		}
	}

	/**
	 * Try to parse a string as a number.
	 */
	private tryParseNumber(value: string): number | null {
		if (value.trim() === "") return null;
		if (/^0\d+$/.test(value)) return null;

		const parsed = Number(value);
		if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
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
}
