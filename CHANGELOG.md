# @cerios/csv-nested-json

## 1.1.0

### Minor Changes

- 955c62d: Introduces CsvStreamParser for memory-efficient parsing of large files with true streaming support, allowing record-by-record processing without loading entire files into memory.

  Adds JsonToCsv class for bidirectional conversion, enabling transformation of nested JSON back to CSV format with support for both continuation rows and JSON-stringified arrays.

  Expands transformation capabilities with auto-parsing for numbers, booleans, and dates, custom value and header transformers, row filtering during parsing, column mapping, default values, and configurable null handling.

  Enhances documentation with comprehensive examples, feature descriptions, and API references for all new functionality including custom error classes and type exports.

  Improves developer experience by adding BOM stripping, row skipping for metadata headers, forced array field detection with `[]` suffix, and detailed error messages with context.

  Updates configuration to disable automatic commits in changesets and adjusts lint rules to warn on explicit any usage.

## 1.0.0

### Major Changes

- 04c39dd: Initial version of the csv to nested json parser
