# @cerios/csv-nested-json

## 1.2.1

### Patch Changes

- d5521f8: Add a new `preserveUnsafeIntegersAsString` option for number auto-parsing.

  When enabled together with `autoParseNumbers`, integer strings outside JavaScript's safe integer range are preserved as strings instead of being converted to imprecise numbers.

  This keeps existing behavior as the default and provides an opt-in path to prevent precision loss for large integer values in both regular and streaming parsers.

## 1.2.0

### Minor Changes

- c5c8f66: Adds duplicate header handling with configurable strategies.

  **New Features:**

  - `duplicateHeaders` option in `CsvParserOptions` with strategies: `'error'`, `'rename'`, `'combine'`, `'first'`, `'last'`
  - New `CsvDuplicateHeaderError` for strict validation
  - New exported type: `DuplicateHeaderStrategy`

  **⚠️ Migration Note:**
  The default strategy is `'error'`, which will throw `CsvDuplicateHeaderError` if duplicate headers are detected. If your CSV files have duplicate headers and you want to preserve the previous behavior (last value wins), add:

  ```ts
  CsvParser.parseString(csv, { duplicateHeaders: "last" });
  ```

  **Usage Examples:**

  ```ts
  // Strict mode (default) - throws on duplicates
  CsvParser.parseString(csv);

  // Rename duplicates: id, id → id, id_1
  CsvParser.parseString(csv, { duplicateHeaders: "rename" });

  // Combine values: 'red', 'blue' → 'red,blue'
  CsvParser.parseString(csv, { duplicateHeaders: "combine" });

  // Keep first value only
  CsvParser.parseString(csv, { duplicateHeaders: "first" });

  // Keep last value only (previous behavior)
  CsvParser.parseString(csv, { duplicateHeaders: "last" });
  ```

- c5c8f66: Add Promise-based `CsvStreamParser.parseStream()` static method for simpler streaming API usage

  - New static method `CsvStreamParser.parseStream(stream, options)` returns a Promise that resolves to an array of parsed records
  - Provides a simpler alternative to the pipe-based streaming API
  - Supports all existing parser options including column filtering, auto-parsing, and nested object conversion
  - Handles stream errors and properly rejects the Promise on failure

- c5c8f66: Add streaming parser enhancements for large file handling

  **Progress Callback for Large Files**

  - New `progressCallback` option to receive progress updates during parsing
  - New `progressInterval` option to control how often callbacks are triggered (default: every 100 records)
  - `ProgressInfo` includes: `bytesProcessed`, `recordsEmitted`, `headersProcessed`, `elapsedMs`
  - Supports both synchronous and asynchronous callbacks

  **Batch Processing for Streams**

  - New `batchSize` option to emit records in batches instead of one-by-one
  - When `batchSize > 1`, the streaming API emits arrays of records
  - `parseStream()` always returns a flat array regardless of batch size
  - Improves performance for high-throughput scenarios

  **Limit Option**

  - New `limit` option to stop parsing after N records
  - Applied after row filtering (filtered rows don't count toward limit)
  - Works with both streaming API and `parseStream()` method

  **Memory Leak Prevention**

  - Added proper `_destroy()` method for resource cleanup
  - Clears internal buffers, headers, and sets on destroy
  - Proper cleanup on stream errors in `parseStream()`

### Patch Changes

- c5c8f66: Add column selection/exclusion feature with three new options:

  - `includeColumns`: Array of column names to include (whitelist approach)
  - `excludeColumns`: Array of column names to exclude (blacklist approach)
  - `identifierColumn`: Specify which column identifies new records for continuation row grouping

  When both `includeColumns` and `excludeColumns` are specified, include is applied first, then exclude.

  Missing columns in `includeColumns` trigger console warnings. Non-existent columns in `excludeColumns` are silently ignored.

  The `identifierColumn` option allows specifying which column should be used to detect new records in NestedJsonConverter, rather than always using the first column.

- c5c8f66: Fix nested forced arrays producing incorrect nesting levels

  **Problem**
  When using forced array syntax (e.g., `items[].tags[]`) with continuation rows, nested arrays were being wrapped in extra array levels, producing `[[{...}]]` instead of the expected `[{...}]`.

  **Solution**
  Implemented hierarchy-aware merging for forced array fields:

  - Added `ForcedArrayHierarchy` type to track parent/child relationships between forced array paths
  - Added `RowContext` type to analyze which fields have values in each row
  - Added `MergeState` type to track the last item added to each forced array for proper appending
  - New `buildForcedArrayHierarchy()` method builds a tree structure from forced array paths
  - New `analyzeRowContext()` method determines field population per row
  - New `processGroupWithHierarchy()` replaces simple merge for forced array scenarios
  - New `contextAwareMerge()` decides whether to create new items or append to existing nested arrays

  **Behavior**

  - When a sibling field has a value → creates a new parent item
  - When only child array fields have values → appends to the nested array in the existing parent item
  - Supports multi-level nesting (e.g., `items[].tags[].values[]`)

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
