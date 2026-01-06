import { CsvValidationError } from "./errors";
import type { CsvParserOptions, CsvRecord } from "./types";

/**
 * Low-level CSV parsing utilities.
 * Handles parsing CSV content into flat record objects.
 *
 * @example
 * ```typescript
 * const records = CsvReader.parse('id,name\n1,Alice\n2,Bob');
 * // [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]
 * ```
 */
export class CsvReader {
	/**
	 * Parse CSV content into an array of flat record objects.
	 * Each record maps header names to cell values.
	 *
	 * @param content - The CSV content as a string
	 * @param options - Parser options
	 * @returns Array of flat record objects with string values
	 * @throws {CsvValidationError} If validationMode is 'error' and row has too many columns
	 *
	 * @example
	 * ```typescript
	 * // Basic parsing
	 * const records = CsvReader.parse('id,name\n1,Alice');
	 * // [{ id: '1', name: 'Alice' }]
	 *
	 * // With BOM stripping and skip rows
	 * const records = CsvReader.parse(content, {
	 *   stripBom: true,
	 *   skipRows: 2
	 * });
	 * ```
	 */
	static parse(content: string, options: CsvParserOptions = {}): CsvRecord[] {
		if (!content || content.trim() === "") {
			return [];
		}

		// Strip BOM if enabled (default: true)
		const stripBom = options.stripBom !== false;
		let processedContent = content;
		if (stripBom) {
			processedContent = this.stripBom(content);
		}

		const validationMode = options.validationMode || "warn";
		const delimiter = options.delimiter || ",";
		const quote = options.quote || '"';
		const skipRows = options.skipRows || 0;

		const lines = this.splitLines(processedContent);

		if (lines.length === 0) return [];

		// Skip initial rows if specified
		const dataStartIndex = skipRows;
		if (dataStartIndex >= lines.length) return [];

		// Parse header (first line after skipped rows)
		let headers = this.parseLine(lines[dataStartIndex], delimiter, quote);
		if (headers.length === 0) return [];

		// Apply header transformer if specified
		if (options.headerTransformer) {
			headers = headers.map(options.headerTransformer);
		}

		// Apply column mapping if specified
		if (options.columnMapping) {
			headers = headers.map(h => options.columnMapping?.[h] ?? h);
		}

		// Parse data rows
		const records: CsvRecord[] = [];
		let dataRowIndex = 0;
		for (let i = dataStartIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line === "") continue; // Skip empty lines

			const values = this.parseLine(lines[i], delimiter, quote);

			// Validate column count
			if (values.length > headers.length && validationMode !== "ignore") {
				const lineNumber = i + 1;
				const message = `Row ${lineNumber} has ${values.length} values but only ${headers.length} columns defined. Extra values will be ignored.`;

				if (validationMode === "error") {
					throw new CsvValidationError(message, lineNumber, headers.length, values.length);
				}
				if (validationMode === "warn") {
					// biome-ignore lint/suspicious/noConsole: User explicitly requested warning mode
					console.warn(`Warning: ${message}`);
				}
			}

			const record: CsvRecord = {};
			for (let j = 0; j < headers.length; j++) {
				let value = j < values.length ? values[j] : "";

				// Apply default value if cell is empty
				if (value === "" && options.defaultValues?.[headers[j]] !== undefined) {
					value = options.defaultValues[headers[j]];
				}

				record[headers[j]] = value;
			}

			// Apply row filter if specified
			if (options.rowFilter && !options.rowFilter(record, dataRowIndex)) {
				dataRowIndex++;
				continue;
			}
			dataRowIndex++;

			records.push(record);
		}

		return records;
	}

	/**
	 * Strip BOM (Byte Order Mark) from the beginning of content.
	 * Handles UTF-8 and UTF-16 BOMs.
	 *
	 * @param content - The content that may contain a BOM
	 * @returns Content with BOM removed
	 *
	 * @example
	 * ```typescript
	 * const clean = CsvReader.stripBom('\uFEFFid,name');
	 * // 'id,name'
	 * ```
	 */
	static stripBom(content: string): string {
		if (content.length === 0) return content;

		// Check for UTF-8 BOM or UTF-16 BE BOM (both are \uFEFF when decoded)
		if (content.charCodeAt(0) === 0xfeff) {
			return content.slice(1);
		}

		// Check for UTF-16 LE BOM (\uFFFE when decoded as UTF-8)
		if (content.charCodeAt(0) === 0xfffe) {
			return content.slice(1);
		}

		return content;
	}

	/**
	 * Split CSV content into lines, respecting quoted fields that may contain newlines.
	 *
	 * @param content - The CSV content
	 * @returns Array of lines (quoted newlines are preserved within lines)
	 *
	 * @example
	 * ```typescript
	 * const lines = CsvReader.splitLines('id,note\n1,"Line 1\nLine 2"');
	 * // ['id,note', '1,"Line 1\nLine 2"']
	 * ```
	 */
	static splitLines(content: string): string[] {
		const lines: string[] = [];
		let currentLine = "";
		let insideQuotes = false;

		for (let i = 0; i < content.length; i++) {
			const char = content[i];
			const nextChar = i + 1 < content.length ? content[i + 1] : "";

			if (char === '"') {
				insideQuotes = !insideQuotes;
				currentLine += char;
			} else if (char === "\r" && nextChar === "\n" && !insideQuotes) {
				// Windows line ending
				lines.push(currentLine);
				currentLine = "";
				i++; // Skip the \n
			} else if ((char === "\n" || char === "\r") && !insideQuotes) {
				// Unix/Mac line ending
				lines.push(currentLine);
				currentLine = "";
			} else {
				currentLine += char;
			}
		}

		// Don't forget the last line if it doesn't end with a newline
		if (currentLine) {
			lines.push(currentLine);
		}

		return lines;
	}

	/**
	 * Parse a single CSV line into an array of values, respecting quotes and delimiters.
	 *
	 * @param line - A single line of CSV data
	 * @param delimiter - The field delimiter (default: ',')
	 * @param quote - The quote character (default: '"')
	 * @returns Array of parsed values
	 *
	 * @example
	 * ```typescript
	 * const values = CsvReader.parseLine('1,"Hello, World",test');
	 * // ['1', 'Hello, World', 'test']
	 *
	 * // Escaped quotes
	 * const values = CsvReader.parseLine('1,"Say ""Hello""",test');
	 * // ['1', 'Say "Hello"', 'test']
	 * ```
	 */
	static parseLine(line: string, delimiter = ",", quote = '"'): string[] {
		const values: string[] = [];
		let currentValue = "";
		let insideQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const nextChar = i + 1 < line.length ? line[i + 1] : "";

			if (char === quote) {
				if (insideQuotes && nextChar === quote) {
					// Escaped quote
					currentValue += quote;
					i++; // Skip the next quote
				} else {
					// Toggle quote state
					insideQuotes = !insideQuotes;
				}
			} else if (char === delimiter && !insideQuotes) {
				// Field delimiter
				values.push(currentValue);
				currentValue = "";
			} else {
				currentValue += char;
			}
		}

		// Don't forget the last value
		values.push(currentValue);

		return values;
	}
}
