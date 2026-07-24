// Main parser API

export { CsvFileReader } from "./csv-file-reader";
export { CsvParser } from "./csv-parser";
// Low-level utilities (for advanced usage)
export { CsvReader } from "./csv-reader";
export type { CsvStreamParserOptions } from "./csv-stream-parser";
// Streaming parser for large files
export { CsvStreamParser } from "./csv-stream-parser";
// Error classes
export {
	CsvDuplicateHeaderError,
	CsvEncodingError,
	CsvFileNotFoundError,
	CsvParseError,
	CsvValidationError,
} from "./errors";
export type { JsonToCsvOptions } from "./json-to-csv";
// JSON to CSV conversion
export { JsonToCsv } from "./json-to-csv";
export type { JsonToCsvStreamOptions } from "./json-to-csv-stream";
// Streaming JSON to CSV writer
export { JsonToCsvStream } from "./json-to-csv-stream";
export { NestedJsonConverter } from "./nested-json-converter";

// Types
export type {
	ArrayMode,
	CsvParserOptions,
	CsvRecord,
	DuplicateHeaderStrategy,
	EmptyArrayBehavior,
	HeaderTransformer,
	NestedObject,
	NestedValue,
	NullRepresentation,
	ProgressCallback,
	ProgressInfo,
	RowFilter,
	ValidationMode,
	ValueTransformer,
} from "./types";
