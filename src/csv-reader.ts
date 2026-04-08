import { CsvDuplicateHeaderError, CsvValidationError } from "./errors";
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

		const lines = this.splitLines(processedContent, quote);

		if (lines.length === 0) return [];

		// Skip initial rows if specified
		const dataStartIndex = skipRows;
		if (dataStartIndex >= lines.length) return [];

		// Parse header (first line after skipped rows)
		const originalHeaders = this.parseLine(lines[dataStartIndex], delimiter, quote);
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
				// Get the original column index for this filtered header
				const originalIndex = includedIndices[j];
				let value = originalIndex < values.length ? values[originalIndex] : "";

				// Apply default value if cell is empty
				if (value === "" && options.defaultValues?.[headers[j]] !== undefined) {
					value = options.defaultValues[headers[j]];
				}

				const header = headers[j];

				// Handle duplicate values based on strategy
				if (duplicateIndices.has(j)) {
					switch (dupStrategy) {
						case "first":
							// Only set if not already present
							if (!(header in record)) {
								record[header] = value;
							}
							break;
						case "combine":
							// Combine into comma-separated values (arrays handled by NestedJsonConverter)
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
						// biome-ignore lint/suspicious/noConsole: User explicitly requested warning mode
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
