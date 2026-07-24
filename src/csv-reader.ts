import { CsvDuplicateHeaderError, CsvValidationError } from "./errors";
import {
	type InternalCsvCellValue,
	type InternalCsvRecord,
	isEmptyCsvCellValue,
	QUOTED_EMPTY_CELL,
	toPublicCsvCellValue,
} from "./internal-empty-cell";
import { assertDelimiterAndQuote, isLeadingSpaceOnly } from "./option-validation";
import type { CsvParserOptions, CsvRecord, DuplicateHeaderStrategy, ValidationMode } from "./types";

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
		return this.parseInternal(content, options, false) as CsvRecord[];
	}

	/**
	 * Parse CSV content with internal quoted-empty provenance tracking.
	 *
	 * @internal
	 */
	static parseWithQuotedEmptyProvenance(content: string, options: CsvParserOptions = {}): InternalCsvRecord[] {
		return this.parseInternal(content, options, true);
	}

	private static parseInternal(
		content: string,
		options: CsvParserOptions,
		preserveQuotedEmpty: boolean
	): InternalCsvRecord[] {
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
		assertDelimiterAndQuote(delimiter, quote);
		const skipRows = options.skipRows || 0;
		const commentPrefix = options.commentPrefix;
		const trimValues = options.trimValues === true;
		const trimLeadingSpace = options.trimLeadingSpace === true;

		// Single-pass tokenize: split into rows of cells in one scan, instead of building an
		// intermediate array of line strings (splitLines) and then re-scanning each line (parseLine).
		const rows = this.tokenize(
			processedContent,
			delimiter,
			quote,
			preserveQuotedEmpty,
			commentPrefix,
			trimValues,
			trimLeadingSpace
		);

		if (rows.length === 0) return [];

		// Skip initial rows if specified
		const dataStartIndex = skipRows;
		if (dataStartIndex >= rows.length) return [];

		// Header cells (first row after skipped rows). Headers are always plain strings, so a
		// quoted-empty header cell collapses to "" rather than the internal sentinel.
		const originalHeaders = rows[dataStartIndex].cells.map(cell => toPublicCsvCellValue(cell));
		if (originalHeaders.length === 0) return [];

		// Apply column filtering FIRST (based on original header names)
		const { filteredHeaders: filteredOriginalHeaders, includedIndices } = this.filterColumns(
			originalHeaders,
			options,
			validationMode
		);

		// Apply header transformer if specified
		let headers = filteredOriginalHeaders;
		if (options.headerTransformer) {
			headers = headers.map(options.headerTransformer);
		}

		// Apply column mapping if specified (based on transformed header names)
		if (options.columnMapping) {
			headers = headers.map(h => options.columnMapping?.[h] ?? h);
		}

		// Handle duplicate headers (after all transformations)
		const dupStrategy = options.duplicateHeaders ?? "error";
		const { processedHeaders, duplicateIndices } = this.detectAndProcessDuplicateHeaders(
			headers,
			dupStrategy,
			skipRows + 1
		);
		headers = processedHeaders;

		// Parse data rows
		const records: InternalCsvRecord[] = [];
		let dataRowIndex = 0;
		for (let i = dataStartIndex + 1; i < rows.length; i++) {
			if (rows[i].blank) continue; // Skip empty lines (raw line was whitespace-only)

			const values = rows[i].cells;

			// Validate column count
			if (values.length > headers.length && validationMode !== "ignore") {
				const lineNumber = i + 1;
				const message = `Row ${lineNumber} has ${values.length} values but only ${headers.length} columns defined. Extra values will be ignored.`;

				if (validationMode === "error") {
					throw new CsvValidationError(message, lineNumber, headers.length, values.length);
				}
				if (validationMode === "warn") {
					console.warn(`Warning: ${message}`);
				}
			}

			// Too-few-columns is only enforced in strict 'error' mode. Missing trailing cells are
			// commonly intentional (padded with empty), so 'warn'/'ignore' stay lenient.
			if (values.length < headers.length && validationMode === "error") {
				const lineNumber = i + 1;
				const message = `Row ${lineNumber} has ${values.length} values but ${headers.length} columns are defined.`;
				throw new CsvValidationError(message, lineNumber, headers.length, values.length);
			}

			const record = this.createRecord(values, headers, includedIndices, duplicateIndices, dupStrategy, options);

			// Apply row filter if specified
			const rowFilterRecord = preserveQuotedEmpty ? this.toPublicRecord(record) : (record as CsvRecord);
			if (options.rowFilter && !options.rowFilter(rowFilterRecord, dataRowIndex)) {
				dataRowIndex++;
				continue;
			}
			dataRowIndex++;

			records.push(record);
		}

		return records;
	}

	/**
	 * Tokenize CSV content into rows of cells in a single pass.
	 *
	 * Each returned entry carries the parsed `cells` and a `blank` flag indicating the raw line
	 * was whitespace-only (so it should be skipped as an empty line, matching the previous
	 * `splitLines`/`parseLine` behavior). Rows are emitted 1:1 with source lines (blank lines
	 * included) so that `skipRows` and error line numbers stay aligned. A trailing empty line
	 * produced by a final line terminator is dropped.
	 */
	private static tokenize(
		content: string,
		delimiter: string,
		quote: string,
		preserveQuotedEmpty: boolean,
		commentPrefix?: string,
		trimValues = false,
		trimLeadingSpace = false
	): { cells: InternalCsvCellValue[]; blank: boolean }[] {
		const hasComments = commentPrefix !== undefined && commentPrefix !== "";

		// Fast path: without any quote character, no field can contain a delimiter or span a line
		// boundary, so native splitting is exact and far faster than manual accumulation.
		if (content.indexOf(quote) === -1) {
			const lines = content.split(/\r\n|\n|\r/);
			if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

			const result: { cells: InternalCsvCellValue[]; blank: boolean }[] = [];
			for (const line of lines) {
				if (hasComments && line.startsWith(commentPrefix)) continue;
				let lineCells: InternalCsvCellValue[] = line.split(delimiter);
				if (trimValues) lineCells = (lineCells as string[]).map(cell => cell.trim());
				result.push({ cells: lineCells, blank: line.trim() === "" });
			}
			return result;
		}

		const rows: { cells: InternalCsvCellValue[]; blank: boolean }[] = [];
		let cells: InternalCsvCellValue[] = [];
		let currentValue = "";
		let insideQuotes = false;
		let fieldWasQuoted = false;
		let lineStart = 0;

		for (let i = 0; i < content.length; i++) {
			// Skip a full comment line without tokenizing it. Checked only at the start of a line so
			// the prefix must be the line's first character(s); this also prevents a stray quote in a
			// comment from swallowing the following line.
			if (hasComments && i === lineStart && !insideQuotes && content.startsWith(commentPrefix, i)) {
				let j = i;
				while (j < content.length && content[j] !== "\n" && content[j] !== "\r") j++;
				if (content[j] === "\r" && content[j + 1] === "\n") j++; // Consume the \n of a CRLF pair
				i = j;
				lineStart = i + 1;
				continue;
			}

			const char = content[i];

			if (char === quote) {
				if (insideQuotes) {
					if (content[i + 1] === quote) {
						// Escaped quote inside a quoted field
						currentValue += quote;
						i++;
					} else {
						// Closing quote
						insideQuotes = false;
					}
				} else if (!fieldWasQuoted && (currentValue === "" || (trimLeadingSpace && isLeadingSpaceOnly(currentValue)))) {
					// Opening quote (only special at the start of a field, per RFC 4180). With
					// trimLeadingSpace, leading spaces before the quote are discarded so the quote
					// still opens the field.
					currentValue = "";
					insideQuotes = true;
					fieldWasQuoted = true;
				} else {
					// A quote in the middle of an unquoted field is a literal character
					currentValue += quote;
				}
			} else if (char === delimiter && !insideQuotes) {
				cells.push(this.finalizeParsedCellValue(currentValue, fieldWasQuoted, preserveQuotedEmpty, trimValues));
				currentValue = "";
				fieldWasQuoted = false;
			} else if ((char === "\n" || char === "\r") && !insideQuotes) {
				const lineEnd = i;
				if (char === "\r" && content[i + 1] === "\n") i++; // Consume the \n of a CRLF pair
				cells.push(this.finalizeParsedCellValue(currentValue, fieldWasQuoted, preserveQuotedEmpty, trimValues));
				rows.push({ cells, blank: content.slice(lineStart, lineEnd).trim() === "" });
				cells = [];
				currentValue = "";
				fieldWasQuoted = false;
				lineStart = i + 1;
			} else {
				currentValue += char;
			}
		}

		// Emit the final line only when the content did not end on a line terminator.
		if (lineStart < content.length || cells.length > 0 || currentValue !== "") {
			cells.push(this.finalizeParsedCellValue(currentValue, fieldWasQuoted, preserveQuotedEmpty, trimValues));
			rows.push({ cells, blank: content.slice(lineStart).trim() === "" });
		}

		return rows;
	}

	private static createRecord(
		values: InternalCsvCellValue[],
		headers: string[],
		includedIndices: number[],
		duplicateIndices: Set<number>,
		dupStrategy: DuplicateHeaderStrategy,
		options: CsvParserOptions
	): InternalCsvRecord {
		const record: InternalCsvRecord = {};

		for (let j = 0; j < headers.length; j++) {
			const originalIndex = includedIndices[j];
			let value: InternalCsvCellValue = originalIndex < values.length ? values[originalIndex] : "";

			if (isEmptyCsvCellValue(value) && options.defaultValues?.[headers[j]] !== undefined) {
				value = options.defaultValues[headers[j]];
			}

			const header = headers[j];

			if (duplicateIndices.has(j)) {
				switch (dupStrategy) {
					case "first":
						if (!(header in record)) {
							record[header] = value;
						}
						break;
					case "combine": {
						const existing = header in record ? toPublicCsvCellValue(record[header]) : "";
						const incoming = toPublicCsvCellValue(value);
						record[header] = existing ? `${existing},${incoming}` : incoming;
						break;
					}
					default:
						record[header] = value;
						break;
				}
			} else {
				record[header] = value;
			}
		}

		return record;
	}

	private static toPublicRecord(record: InternalCsvRecord): CsvRecord {
		const publicRecord: CsvRecord = {};

		for (const header of Object.keys(record)) {
			publicRecord[header] = toPublicCsvCellValue(record[header]);
		}

		return publicRecord;
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
	 * Split CSV content into lines, respecting quoted fields that may contain newlines.
	 *
	 * @deprecated No longer used internally — {@link CsvReader.parse} tokenizes rows and cells in a
	 *   single pass. Retained for backward compatibility; prefer {@link CsvParser} or
	 *   {@link CsvReader.parse}. May be removed in a future major.
	 *
	 * @param content - The CSV content
	 * @param quote - The quote character (default: '"')
	 * @returns Array of lines (quoted newlines are preserved within lines)
	 *
	 * @example
	 * ```typescript
	 * const lines = CsvReader.splitLines('id,note\n1,"Line 1\nLine 2"');
	 * // ['id,note', '1,"Line 1\nLine 2"']
	 * ```
	 */
	static splitLines(content: string, quote = '"'): string[] {
		// Fast path: without a quote character no field can span a line boundary, so a native
		// split on line terminators is exact. The manual scan below drops the single empty
		// segment produced by a trailing terminator, so replicate that by popping it here.
		if (content.indexOf(quote) === -1) {
			if (content === "") return [];
			const parts = content.split(/\r\n|\n|\r/);
			if (parts[parts.length - 1] === "") parts.pop();
			return parts;
		}

		const lines: string[] = [];
		let currentLine = "";
		let insideQuotes = false;

		for (let i = 0; i < content.length; i++) {
			const char = content[i];
			const nextChar = i + 1 < content.length ? content[i + 1] : "";

			if (char === quote) {
				if (insideQuotes && nextChar === quote) {
					// Escaped quote
					currentLine += quote + quote;
					i++; // Skip the second quote
				} else {
					insideQuotes = !insideQuotes;
					currentLine += char;
				}
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
	 * @deprecated No longer used internally — {@link CsvReader.parse} tokenizes rows and cells in a
	 *   single pass. Retained for backward compatibility; prefer {@link CsvParser} or
	 *   {@link CsvReader.parse}. May be removed in a future major.
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
	static parseLine(line: string, delimiter?: string, quote?: string): string[];
	static parseLine(
		line: string,
		delimiter: string,
		quote: string,
		preserveQuotedEmpty: boolean
	): InternalCsvCellValue[];
	static parseLine(line: string, delimiter = ",", quote = '"', preserveQuotedEmpty = false): InternalCsvCellValue[] {
		// Fast path: a line with no quote character has no quoted fields, so a native split is
		// exact (no field was quoted, so finalizeParsedCellValue would be a no-op anyway).
		if (line.indexOf(quote) === -1) {
			return line.split(delimiter);
		}

		const values: InternalCsvCellValue[] = [];
		let currentValue = "";
		let insideQuotes = false;
		let fieldWasQuoted = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const nextChar = i + 1 < line.length ? line[i + 1] : "";

			if (char === quote) {
				if (insideQuotes) {
					if (nextChar === quote) {
						// Escaped quote inside a quoted field
						currentValue += quote;
						i++; // Skip the next quote
					} else {
						// Closing quote
						insideQuotes = false;
					}
				} else if (currentValue === "" && !fieldWasQuoted) {
					// Opening quote (only special at the start of a field, per RFC 4180)
					insideQuotes = true;
					fieldWasQuoted = true;
				} else {
					// A quote in the middle of an unquoted field is a literal character
					currentValue += quote;
				}
			} else if (char === delimiter && !insideQuotes) {
				// Field delimiter
				values.push(this.finalizeParsedCellValue(currentValue, fieldWasQuoted, preserveQuotedEmpty));
				currentValue = "";
				fieldWasQuoted = false;
			} else {
				currentValue += char;
			}
		}

		// Don't forget the last value
		values.push(this.finalizeParsedCellValue(currentValue, fieldWasQuoted, preserveQuotedEmpty));

		return values;
	}

	private static finalizeParsedCellValue(
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
	 * Detect duplicate headers and process them according to the strategy.
	 * Returns the processed headers and a set of indices that are duplicates.
	 *
	 * @param headers - The parsed header names
	 * @param strategy - The duplicate handling strategy
	 * @param headerRow - The 1-based row number for error reporting
	 * @returns Object with processed headers and duplicate indices
	 * @throws {CsvDuplicateHeaderError} If strategy is 'error' and duplicates found
	 */
	private static detectAndProcessDuplicateHeaders(
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
				// Use the original header name (from first occurrence) for error messages
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
				// Rename duplicates: keep first as-is, append _1, _2, etc. to subsequent
				const processedHeaders = [...headers];
				for (const indices of headerMap.values()) {
					if (indices.length > 1) {
						// Skip the first occurrence (index 0), rename the rest
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
	 * Returns the filtered headers and an array mapping filtered indices to original indices.
	 *
	 * @param headers - The parsed header names (after transformations)
	 * @param options - Parser options containing includeColumns/excludeColumns
	 * @param validationMode - How to handle warnings about missing columns
	 * @returns Object with filtered headers and index mapping array
	 */
	private static filterColumns(
		headers: string[],
		options: CsvParserOptions,
		validationMode: ValidationMode
	): { filteredHeaders: string[]; includedIndices: number[] } {
		const { includeColumns, excludeColumns } = options;

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
					if (validationMode === "warn") {
						console.warn(`Warning: ${message}`);
					}
					// Note: we don't throw for 'error' mode here, just warn - it's not a fatal issue
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
