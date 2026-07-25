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
 * Category of a recoverable per-row error collected by the `*Safe` parser methods.
 * - `'validation'`: A data row whose column count does not match the header.
 * - `'grouping'`: A continuation/array grouping problem (e.g. a repeated non-`[]`
 *   path within a group, or a continuation row with no base row).
 */
export type CsvRowErrorCode = "validation" | "grouping";

/**
 * A single recoverable error collected during a `*Safe` parse instead of being thrown.
 */
export interface CsvRowError {
	/** 1-based row number where the problem occurred. */
	row: number;
	/** 1-based column number, when known. */
	column?: number;
	/** Category of the error. */
	code: CsvRowErrorCode;
	/** Human-readable description. */
	message: string;
}

/**
 * Result returned by the `*Safe` parser methods: the successfully parsed records
 * plus any recoverable per-row errors that were collected rather than thrown.
 */
export interface CsvParseResult<T = NestedObject> {
	/** Records that parsed successfully. Rows/groups with errors are omitted. */
	data: T[];
	/** Recoverable per-row errors, in the order encountered. */
	errors: CsvRowError[];
}

/**
 * Sink for recoverable per-row errors. When threaded through the internal parse path (by the
 * `*Safe` parser methods), a per-row failure is reported here and the offending row/group is
 * skipped instead of throwing.
 *
 * @internal
 */
export type CsvErrorSink = (error: CsvRowError) => void;

/**
 * A nested value in a structure the parser produces or that {@link JsonToCsv} accepts.
 * The parser produces strings, numbers, booleans, `null` (via `nullRepresentation`), arrays, and
 * nested objects. `Date` is not produced by the parser but is a valid input to `JsonToCsv`, which
 * serializes it to an ISO string.
 */
export type NestedValue = string | number | boolean | null | Date | NestedObject | NestedValue[];

/**
 * A nested JSON object with string keys and nested values.
 */
export interface NestedObject {
	[key: string]: NestedValue;
}

/**
 * Representation for null values in output.
 * - `'null'`: Use JavaScript null
 * - `'undefined'`: Use JavaScript undefined
 * - `'empty-string'`: Use empty string ''
 * - `'omit'`: Omit the field entirely (default)
 */
export type NullRepresentation = "null" | "undefined" | "empty-string" | "omit";

/**
 * Strategy for handling duplicate column headers in CSV files.
 * - `'error'`: Throw a CsvDuplicateHeaderError (default)
 * - `'rename'`: Rename duplicates to 'name_1', 'name_2', etc.
 * - `'combine'`: Combine duplicate values into comma-separated string
 * - `'first'`: Keep only the first value for duplicate columns
 * - `'last'`: Keep only the last value for duplicate columns
 */
export type DuplicateHeaderStrategy = "error" | "rename" | "combine" | "first" | "last";

/**
 * Information about parsing progress, passed to progress callbacks.
 */
export interface ProgressInfo {
	/**
	 * Total number of bytes processed so far.
	 */
	bytesProcessed: number;

	/**
	 * Number of records emitted so far.
	 */
	recordsEmitted: number;

	/**
	 * Whether the header row has been processed.
	 */
	headersProcessed: boolean;

	/**
	 * Time elapsed since parsing started, in milliseconds.
	 */
	elapsedMs: number;
}

/**
 * Callback function for progress updates during streaming parsing.
 * Can be synchronous or asynchronous. Async callbacks are fire-and-forget
 * (parsing does not wait for them to complete).
 *
 * @param info - Current progress information
 *
 * @example
 * ```typescript
 * const callback: ProgressCallback = (info) => {
 *   console.log(`Parsed ${info.recordsEmitted} records in ${info.elapsedMs}ms`);
 * };
 * ```
 */
export type ProgressCallback = (info: ProgressInfo) => void | Promise<void>;

/**
 * Hierarchy structure for forced array fields.
 * Tracks parent/child relationships between forced array paths to enable
 * context-aware merging of continuation rows.
 *
 * @internal
 */
export interface ForcedArrayHierarchy {
	/**
	 * Map of forced array path → its parent forced array path (or null if root-level)
	 * Example: { "items": null, "items.tags": "items" }
	 */
	parentMap: Map<string, string | null>;

	/**
	 * Map of forced array path → all child forced array paths
	 * Example: { "items": Set(["items.tags"]), "items.tags": Set() }
	 */
	childrenMap: Map<string, Set<string>>;

	/**
	 * Map of forced array path → non-array sibling fields at that level
	 * These are fields that, when populated, indicate a new array item should be created
	 * Example: { "items": Set(["name", "id"]) } where name/id are siblings to tags under items
	 */
	siblingFieldsMap: Map<string, Set<string>>;

	/**
	 * List of forced array paths sorted by depth (ascending)
	 * Example: ["items", "items.tags"]
	 */
	sortedByDepth: string[];
}

/**
 * Context for a single row during merge operations.
 * Tracks which fields have values and determines merge behavior.
 *
 * @internal
 */
export interface RowContext {
	/**
	 * Set of normalized paths that have non-empty values in this row
	 */
	populatedPaths: Set<string>;

	/**
	 * For each forced array path, whether its non-array sibling fields have values
	 * When true, a new array item should be created at that level
	 */
	hasSiblingValues: Map<string, boolean>;
}

/**
 * State maintained during merge operations.
 * Tracks the last item added to each forced array for appending nested values.
 *
 * @internal
 */
export interface MergeState {
	/**
	 * For each forced array path, reference to the last item in that array.
	 * Used to append nested array values to the correct parent item.
	 */
	lastItemByPath: Map<string, NestedObject>;
}

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
	 * Skip lines whose raw text starts with this prefix (checked at the beginning of each line,
	 * before quoting is considered). Comment lines are removed entirely — they are not treated as
	 * the header or as data rows.
	 *
	 * @remarks
	 * Because comment lines are removed from the input, error line numbers reference the position
	 * among the remaining (non-comment) lines.
	 *
	 * @example
	 * ```typescript
	 * CsvParser.parseString(csv, { commentPrefix: '#' });
	 * ```
	 */
	commentPrefix?: string;

	/**
	 * Trim leading/trailing whitespace from unquoted field values (and headers). Whitespace inside
	 * quoted fields is always preserved.
	 * @default false
	 *
	 * @example
	 * ```typescript
	 * // 'a, b , c' -> ['a', 'b', 'c']
	 * CsvParser.parseString(csv, { trimValues: true });
	 * ```
	 */
	trimValues?: boolean;

	/**
	 * Recognize a quote character as field-opening even when it is preceded by leading spaces
	 * (e.g. `, "quoted, value"`). The leading spaces before the opening quote are discarded.
	 *
	 * @remarks
	 * By default (per RFC 4180) a space before a quote is a significant character, so the quote is
	 * treated as a literal and a delimiter inside the intended quoted field would split it. Enable
	 * this for CSV producers that emit a space after the delimiter. This is orthogonal to
	 * {@link CsvParserOptions.trimValues}, which trims the body of unquoted fields; `trimLeadingSpace`
	 * only affects whether a following quote opens the field. Whitespace inside a quoted field is
	 * always preserved.
	 *
	 * @default false
	 *
	 * @example
	 * ```typescript
	 * // '1, "x,y"' -> { note: 'x,y' } instead of splitting on the inner comma
	 * CsvParser.parseString(csv, { trimLeadingSpace: true });
	 * ```
	 */
	trimLeadingSpace?: boolean;

	/**
	 * Automatically strip BOM (Byte Order Mark) from the beginning of content.
	 * Handles UTF-8 BOM (\uFEFF) and UTF-16 BOMs.
	 * @default true
	 */
	stripBom?: boolean;

	/**
	 * Automatically convert numeric strings to numbers.
	 * Only plain decimal/float/scientific-notation values are converted; hex/octal/binary
	 * literals, `+`-prefixed and whitespace-padded values, and leading-zero codes stay strings.
	 * @default true
	 *
	 * @example
	 * ```typescript
	 * // '42' becomes 42, '3.14' becomes 3.14; pass false to keep raw strings
	 * CsvParser.parseString(csv, { autoParseNumbers: false });
	 * ```
	 */
	autoParseNumbers?: boolean;

	/**
	 * Preserve integer values outside JavaScript safe integer range as strings.
	 * Helps prevent precision loss when autoParseNumbers is enabled.
	 * @default false
	 *
	 * @remarks
	 * Only applies to whole numbers where `Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER`.
	 */
	preserveUnsafeIntegersAsString?: boolean;

	/**
	 * Automatically convert 'true'/'false' strings to booleans.
	 * Case-insensitive matching.
	 * @default true
	 *
	 * @example
	 * ```typescript
	 * // 'true' becomes true, 'FALSE' becomes false; pass false to keep raw strings
	 * CsvParser.parseString(csv, { autoParseBooleans: false });
	 * ```
	 */
	autoParseBooleans?: boolean;

	/**
	 * Mode for converting arrays to CSV (used by JsonToCsv).
	 * - `'rows'`: Output arrays as continuation rows (default, matches parser)
	 * - `'json'`: JSON-stringify arrays into a single cell
	 * @default 'rows'
	 */
	arrayMode?: ArrayMode;

	/**
	 * Map column names to new names.
	 * Keys are the raw CSV header names, values are the new names.
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
	 * Values to treat as null.
	 * Case-insensitive matching.
	 *
	 * @remarks
	 * Null detection is opt-in: it runs only when this option is provided. When omitted,
	 * values such as `'null'` are left untouched as plain strings. When you do pass this
	 * option, it fully replaces the built-in set (`['null', 'NULL', 'nil', 'NIL']`);
	 * include an empty string `''` to also treat empty cells as null.
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

	/**
	 * Preserve unquoted empty cells as empty strings in nested output.
	 *
	 * @remarks
	 * This option only applies to unquoted empty columns such as `,,`.
	 * Explicit quoted empty strings are controlled by `preserveEmptyString`.
	 *
	 * @default false
	 */
	preserveEmptyColumnAsEmptyString?: boolean;

	/**
	 * Preserve explicitly quoted empty strings as empty strings in nested output.
	 *
	 * @remarks
	 * This option applies to values such as `""` (or the configured quote character equivalent).
	 *
	 * @default true
	 */
	preserveEmptyString?: boolean;

	/**
	 * Maximum number of records to parse.
	 * Parsing stops after this limit is reached.
	 * Useful for previewing large files or pagination.
	 *
	 * @example
	 * ```typescript
	 * // Only parse first 100 records
	 * CsvParser.parseString(csv, { limit: 100 });
	 * ```
	 */
	limit?: number;

	/**
	 * Number of output records to skip before collecting results.
	 * Applied before {@link CsvParserOptions.limit}, so `offset` + `limit` together select a
	 * window of records (useful for pagination). Like `limit`, this counts grouped output
	 * records (continuation-row groups map to a single record and are never split).
	 *
	 * @default 0
	 *
	 * @example
	 * ```typescript
	 * // Skip the first 100 records, then take the next 50
	 * CsvParser.parseString(csv, { offset: 100, limit: 50 });
	 * ```
	 */
	offset?: number;

	/**
	 * List of column names to include in the output.
	 * Only these columns will be present in parsed records.
	 * Cannot be used together with excludeColumns.
	 *
	 * @example
	 * ```typescript
	 * CsvParser.parseString(csv, {
	 *   includeColumns: ['id', 'name', 'email']
	 * });
	 * ```
	 */
	includeColumns?: string[];

	/**
	 * List of column names to exclude from the output.
	 * All columns except these will be present in parsed records.
	 * Cannot be used together with includeColumns.
	 *
	 * @example
	 * ```typescript
	 * CsvParser.parseString(csv, {
	 *   excludeColumns: ['password', 'secret']
	 * });
	 * ```
	 */
	excludeColumns?: string[];

	/**
	 * Strategy for handling duplicate column headers.
	 * - `'error'`: Throw a CsvDuplicateHeaderError (default)
	 * - `'rename'`: Rename duplicates to 'name_1', 'name_2', etc.
	 * - `'combine'`: Combine duplicate values into comma-separated string
	 * - `'first'`: Keep only the first value for duplicate columns
	 * - `'last'`: Keep only the last value for duplicate columns
	 * @default 'error'
	 *
	 * @example
	 * ```typescript
	 * CsvParser.parseString(csv, {
	 *   duplicateHeaders: 'rename'
	 * });
	 * ```
	 */
	duplicateHeaders?: DuplicateHeaderStrategy;

	/**
	 * Column to use as the identifier for grouping continuation rows.
	 * By default, the first column is used to identify new records.
	 * When this column has an empty value, the row is treated as a continuation
	 * of the previous record.
	 *
	 * @example
	 * ```typescript
	 * // Use 'productId' instead of first column to group rows
	 * CsvParser.parseString(csv, {
	 *   identifierColumn: 'productId'
	 * });
	 * ```
	 */
	identifierColumn?: string;
}
