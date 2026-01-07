/**
 * Validation mode for handling rows with more values than headers.
 * - `'ignore'`: Silently ignore extra values
 * - `'warn'`: Log a warning to console (default)
 * - `'error'`: Throw a CsvValidationError
 */
export type ValidationMode = "ignore" | "warn" | "error";

/**
 * Behavior for handling forced array fields that have no values.
 * - `'empty-array'`: Create an empty array `[]`
 * - `'omit'`: Omit the field entirely (default)
 */
export type EmptyArrayBehavior = "empty-array" | "omit";

/**
 * Mode for converting arrays back to CSV format.
 * - `'rows'`: Output arrays as continuation rows (matches parser format)
 * - `'json'`: JSON-stringify arrays into a single cell
 */
export type ArrayMode = "rows" | "json";

/**
 * A flat CSV record with string keys and string values.
 * Represents a single row parsed from CSV before nesting conversion.
 */
export type CsvRecord = Record<string, string>;

/**
 * A nested object structure produced by the CSV parser.
 * Values can be primitives, arrays, dates, or nested objects.
 */
export type NestedValue = string | number | boolean | null | Date | NestedObject | NestedValue[];

/**
 * A nested JSON object with string keys and nested values.
 */
export interface NestedObject {
	[key: string]: NestedValue;
}

/**
 * Function type for transforming individual cell values.
 * Receives the current value (after auto-parsing if enabled) and the header name.
 *
 * @param value - The cell value (may be string, number, or boolean after auto-parsing)
 * @param header - The column header name
 * @returns The transformed value
 *
 * @example
 * ```typescript
 * // Convert specific columns to uppercase
 * const transformer: ValueTransformer = (value, header) => {
 *   if (header === 'name' && typeof value === 'string') {
 *     return value.toUpperCase();
 *   }
 *   return value;
 * };
 * ```
 */
export type ValueTransformer = (value: string | number | boolean, header: string) => unknown;

/**
 * Function type for transforming header names during parsing.
 * Receives the original header name and returns the transformed name.
 *
 * @param header - The original header name from the CSV
 * @returns The transformed header name
 *
 * @example
 * ```typescript
 * // Convert headers to camelCase
 * const transformer: HeaderTransformer = (header) => {
 *   return header.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
 * };
 * ```
 */
export type HeaderTransformer = (header: string) => string;

/**
 * Function type for filtering rows during parsing.
 * Receives the parsed record and returns true to include, false to exclude.
 *
 * @param record - The parsed record (flat, before nesting)
 * @param rowIndex - The 0-based index of the data row (excludes header and skipped rows)
 * @returns true to include the row, false to exclude it
 *
 * @example
 * ```typescript
 * // Only include rows where status is 'active'
 * const filter: RowFilter = (record) => record.status === 'active';
 * ```
 */
export type RowFilter = (record: CsvRecord, rowIndex: number) => boolean;

/**
 * Representation for null values in output.
 * - `'null'`: Use JavaScript null
 * - `'undefined'`: Use JavaScript undefined
 * - `'empty-string'`: Use empty string ''
 * - `'omit'`: Omit the field entirely (default)
 */
export type NullRepresentation = "null" | "undefined" | "empty-string" | "omit";

/**
 * Configuration options for CSV parsing and conversion.
 *
 * @example
 * ```typescript
 * const options: CsvParserOptions = {
 *   delimiter: ';',
 *   autoParseNumbers: true,
 *   autoParseBooleans: true,
 *   skipRows: 2,
 *   stripBom: true
 * };
 *
 * const result = CsvParser.parseString(csvContent, options);
 * ```
 */
export interface CsvParserOptions {
	/**
	 * How to handle rows with more values than headers.
	 * - `'ignore'`: Silently ignore extra values
	 * - `'warn'`: Log a warning to console (default)
	 * - `'error'`: Throw a CsvValidationError
	 */
	validationMode?: ValidationMode;

	/**
	 * Field delimiter character.
	 * @default ','
	 */
	delimiter?: string;

	/**
	 * Quote character for escaping fields containing delimiters or newlines.
	 * @default '"'
	 */
	quote?: string;

	/**
	 * File encoding when reading from file.
	 * @default 'utf-8'
	 */
	encoding?: BufferEncoding;

	/**
	 * Suffix indicator in column headers to force array type.
	 * Fields with this suffix will always be arrays, even with single values.
	 * @default '[]'
	 *
	 * @example
	 * ```typescript
	 * // Header: 'person.children[].name'
	 * // Result: { person: { children: [{ name: '...' }] } }
	 * ```
	 */
	arraySuffixIndicator?: string;

	/**
	 * How to handle forced array fields with no values.
	 * - `'empty-array'`: Create an empty array `[]`
	 * - `'omit'`: Omit the field entirely (default)
	 */
	emptyArrayBehavior?: EmptyArrayBehavior;

	/**
	 * Number of rows to skip before the header row.
	 * Useful for files with metadata or comments at the top.
	 * @default 0
	 *
	 * @example
	 * ```typescript
	 * // Skip 2 rows of metadata before the header
	 * CsvParser.parseString(csv, { skipRows: 2 });
	 * ```
	 */
	skipRows?: number;

	/**
	 * Automatically strip BOM (Byte Order Mark) from the beginning of content.
	 * Handles UTF-8 BOM (\uFEFF) and UTF-16 BOMs.
	 * @default true
	 */
	stripBom?: boolean;

	/**
	 * Automatically convert numeric strings to numbers.
	 * Applies to values that can be parsed as valid numbers.
	 * @default false
	 *
	 * @example
	 * ```typescript
	 * // '42' becomes 42, '3.14' becomes 3.14
	 * CsvParser.parseString(csv, { autoParseNumbers: true });
	 * ```
	 */
	autoParseNumbers?: boolean;

	/**
	 * Automatically convert 'true'/'false' strings to booleans.
	 * Case-insensitive matching.
	 * @default false
	 *
	 * @example
	 * ```typescript
	 * // 'true' becomes true, 'FALSE' becomes false
	 * CsvParser.parseString(csv, { autoParseBooleans: true });
	 * ```
	 */
	autoParseBooleans?: boolean;

	/**
	 * Custom function to transform values after parsing.
	 * Called after autoParseNumbers and autoParseBooleans (if enabled).
	 *
	 * @example
	 * ```typescript
	 * CsvParser.parseString(csv, {
	 *   valueTransformer: (value, header) => {
	 *     if (header === 'date') return new Date(value as string);
	 *     return value;
	 *   }
	 * });
	 * ```
	 */
	valueTransformer?: ValueTransformer;

	/**
	 * Mode for converting arrays to CSV (used by JsonToCsv).
	 * - `'rows'`: Output arrays as continuation rows (default, matches parser)
	 * - `'json'`: JSON-stringify arrays into a single cell
	 * @default 'rows'
	 */
	arrayMode?: ArrayMode;

	/**
	 * Transform header names before processing.
	 * Applied to each header after reading from CSV.
	 *
	 * @example
	 * ```typescript
	 * // Convert headers to lowercase
	 * CsvParser.parseString(csv, {
	 *   headerTransformer: (header) => header.toLowerCase()
	 * });
	 * ```
	 */
	headerTransformer?: HeaderTransformer;

	/**
	 * Map column names to new names.
	 * Applied after headerTransformer (if specified).
	 * Keys are original names, values are new names.
	 *
	 * @example
	 * ```typescript
	 * CsvParser.parseString(csv, {
	 *   columnMapping: {
	 *     'First Name': 'firstName',
	 *     'Last Name': 'lastName'
	 *   }
	 * });
	 * ```
	 */
	columnMapping?: Record<string, string>;

	/**
	 * Filter rows during parsing.
	 * Return true to include the row, false to exclude it.
	 * Applied after parsing but before nesting conversion.
	 *
	 * @example
	 * ```typescript
	 * CsvParser.parseString(csv, {
	 *   rowFilter: (record) => record.status !== 'deleted'
	 * });
	 * ```
	 */
	rowFilter?: RowFilter;

	/**
	 * Default values for columns.
	 * Applied when a cell is empty.
	 * Keys are column names (after transformation/mapping).
	 *
	 * @example
	 * ```typescript
	 * CsvParser.parseString(csv, {
	 *   defaultValues: {
	 *     status: 'pending',
	 *     count: '0'
	 *   }
	 * });
	 * ```
	 */
	defaultValues?: Record<string, string>;

	/**
	 * Automatically parse date strings to Date objects.
	 * Uses JavaScript's Date.parse() for recognition.
	 * @default false
	 *
	 * @example
	 * ```typescript
	 * // '2024-01-15' becomes Date object
	 * CsvParser.parseString(csv, { autoParseDates: true });
	 * ```
	 */
	autoParseDates?: boolean;

	/**
	 * Values to treat as null.
	 * Case-insensitive matching.
	 * @default ['null', 'NULL', 'nil', 'NIL', '']
	 *
	 * @example
	 * ```typescript
	 * CsvParser.parseString(csv, {
	 *   nullValues: ['null', 'N/A', '-', '']
	 * });
	 * ```
	 */
	nullValues?: string[];

	/**
	 * How to represent null values in the output.
	 * - `'null'`: Use JavaScript null
	 * - `'undefined'`: Use JavaScript undefined
	 * - `'empty-string'`: Use empty string ''
	 * - `'omit'`: Omit the field entirely (default)
	 * @default 'omit'
	 */
	nullRepresentation?: NullRepresentation;
}
