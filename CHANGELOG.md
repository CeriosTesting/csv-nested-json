# @cerios/csv-nested-json

## 2.0.0

### Major Changes

- 9c68b80: Refocus the parser on faithful CSV → nested JSON conversion, make type coercion the default, and add
  a PapaParse-style error-accumulation mode.

  ### Breaking changes
  - **Auto-parse is now on by default.** `autoParseNumbers` and `autoParseBooleans` both default to
    `true`. Numeric and boolean strings are coerced automatically; pass `autoParseNumbers: false` /
    `autoParseBooleans: false` to keep raw strings. Leading-zero strings (e.g. `"007"`) and — with
    `preserveUnsafeIntegersAsString` — unsafe integers are still preserved as strings.
  - **Removed the transform-family options:** `valueTransformer`, `headerTransformer`, `rowFilter`, and
    `defaultValues`, along with the `ValueTransformer`, `HeaderTransformer`, and `RowFilter` exported
    types. Do the equivalent work after parsing (e.g. `result.map(...)` / `result.filter(...)`), or use
    the retained `columnMapping` to rename columns. `columnMapping` now maps the raw CSV header names
    directly (it no longer runs after a header transformer).
  - **`warnInertOptions` semantics.** `preserveUnsafeIntegersAsString` is now flagged as inert only when
    `autoParseNumbers` is explicitly set to `false` (since number parsing is on by default).

  ### Features
  - **Error accumulation via `*Safe` methods.** New `CsvParser.parseStringSafe`, `parseFileSyncSafe`,
    `parseFileSafe`, and `parseStreamSafe` return `{ data, errors }` instead of throwing on the first bad
    row. `data` holds the successfully parsed records; `errors` is a list of `CsvRowError`
    (`{ row, column?, code, message }`) with `code` of `"validation"` (column-count mismatch in
    `validationMode: "error"`) or `"grouping"` (continuation/array grouping problem). Configuration and
    I/O errors (invalid delimiter/quote, unsupported encoding, missing file) are not per-row and still
    throw. New exported types: `CsvParseResult`, `CsvRowError`, `CsvRowErrorCode`. Error accumulation
    covers the buffered parsers; `CsvStreamParser` is unchanged (still throws / emits `'error'`).

  ### Retained
  - `columnMapping`, `nullValues`, and `nullRepresentation` are kept and unchanged.

- 9c68b80: Close correctness/parity gaps, add commonly-expected options, and de-duplicate the two parsing paths.

  ### Breaking changes
  - **RFC 4180 quote handling.** A quote character is now only special at the **start of a field**. A
    quote in the middle of an unquoted field (e.g. `foo"bar,baz`) is treated as a literal character
    instead of opening a quoted region, so the delimiter is no longer swallowed. Properly quoted
    fields, escaped `""`, and quoted newlines are unchanged.
  - **`delimiter` and `quote` must be single characters** (and different from each other). A
    multi-character value now throws `CsvParseError` instead of silently mis-parsing.
  - **`CsvStreamParser` now validates column counts** like the buffered `CsvParser`: in
    `validationMode: 'error'` a row with too many columns throws `CsvValidationError` (previously the
    stream ignored it). In `'error'` mode, both parsers also now throw on rows with **fewer** values
    than headers; `'warn'`/`'ignore'` stay lenient and pad short rows with empty values.

  ### Bug fixes
  - **`CsvEncodingError` is now actually thrown.** It was exported and documented but never raised.
    Unknown encodings passed to `CsvParser`, `CsvFileReader`, or `CsvStreamParser` now throw it.

  ### Features
  - **`commentPrefix` option** — skip lines whose raw text starts with the given prefix. Comment lines
    are removed entirely (neither header nor data).
  - **`trimValues` option** — trim leading/trailing whitespace from unquoted field values and headers;
    whitespace inside quoted fields is preserved.
  - **`JsonToCsvStream`** — a streaming `Transform` that writes CSV incrementally for large arrays.
    Headers come from an explicit `columns` option or the first record.
  - **`JsonToCsv` `nullValue` option** — serialize an explicit `null` with a distinct token so it can
    be told apart from an empty cell on re-parse (default `''`, unchanged).

  ### Internal
  - The value-transformation and unflatten logic shared by the buffered converter and the streaming
    parser is now a single module (`record-transform.ts`), removing duplicated code that had allowed
    the two paths to drift (the source of the stream validation gap above).

- 9c68b80: Require the `[]` suffix for arrays, fix latent parser bugs, remove `autoParseDates`, and tighten
  number auto-parsing.

  ### Breaking changes
  - **Arrays now require the `[]` header suffix.** Automatic array grouping was removed: values are no
    longer silently collapsed into an array when the same column repeats across continuation rows.
    Mark array columns explicitly (`tags[]`, `phones[].type`). If a non-`[]` column has a value in more
    than one row of the same continuation group, parsing now throws `CsvParseError` instead of
    producing an array. Continuation rows (empty identifier column) still group with the previous
    record — they append to `[]` arrays and fill in blank fields.

    ```ts
    // Before: arrays were auto-detected
    // id,tags
    // 1,a
    // ,b        -> { id: "1", tags: ["a", "b"] }

    // Now: the [] suffix is required
    // id,tags[]
    // 1,a
    // ,b        -> { id: "1", tags: ["a", "b"] }
    ```

  - **`JsonToCsv` (`arrayMode: "rows"`) now emits the array suffix in headers** (e.g. `tags[]`,
    `phones[].type`) so its output re-parses back into arrays. A new `arraySuffixIndicator` option
    (default `"[]"`) controls the emitted suffix. `arrayMode: "json"` output is unchanged.

  - **Removed the `autoParseDates` option.** `Date.parse` recognition was too loose and
    locale-dependent, and was the root cause of mangled dates during JSON→CSV conversion.
    Date-looking strings are now kept as plain strings. To produce `Date` objects, convert the
    relevant columns after parsing:

    ```ts
    const rows = CsvParser.parseString(csv).map(r => ({
    	...r,
    	created: typeof r.created === "string" ? new Date(r.created) : r.created,
    }));
    ```

  - **`autoParseNumbers` is now stricter.** Only plain decimal/float/scientific-notation
    values are converted. Values such as `0x1F`, `0b101`, `0o17`, `+5`, and
    whitespace-padded numbers (`" 42 "`) are now preserved as strings instead of being
    coerced to numbers. Leading-zero codes (e.g. `007`) continue to be preserved as strings.

  ### Bug fixes
  - **`limit` now works in the non-streaming parser.** `CsvParser.parseString` /
    `parseFileSync` / `parseFile` previously ignored `limit` and returned all records. It
    now caps the number of output records (without splitting a continuation-row group),
    matching `CsvStreamParser`.
  - **`JsonToCsv` now handles a custom `quote` character correctly.** Regex-special quote
    characters (`.`, `|`, `*`, etc.) were previously interpolated into a `RegExp` unescaped,
    producing corrupt output.
  - **`JsonToCsv` now serializes `Date` values correctly.** Dates are emitted as ISO strings
    (invalid dates as an empty field) instead of being `JSON.stringify`-ed into
    quote-wrapped values. `Date` columns are also no longer silently dropped from the output.
  - **`CsvStreamParser` no longer corrupts multibyte UTF-8 characters** that span chunk
    boundaries. Incoming `Buffer` chunks are decoded through a stateful `StringDecoder`.
  - **`ProgressInfo.bytesProcessed`** is now measured from the raw input bytes using the
    configured encoding.

  ### Documentation
  - Clarified that `nullValues` is opt-in: null detection runs only when the option is
    provided, and the provided list fully replaces the built-in set.

### Minor Changes

- 9c68b80: Close remaining parser edges: opt-in leading-space quoting, an inert-option warning, streaming
  fast-path parity, and documentation fixes.

  ### Features
  - **`trimLeadingSpace` parser option** (default `false`) — recognize a quote character as
    field-opening even when it is preceded by leading spaces (e.g. `1, "x,y"`), discarding those
    spaces. By default (per RFC 4180) a space before a quote is significant, so the quote stays literal
    and a delimiter inside the intended quoted field would split it. Enable this for producers that emit
    a space after the delimiter. Orthogonal to `trimValues`; whitespace inside a quoted field is always
    preserved. Buffered and streaming parsers behave identically, including for quoted newlines.
  - **Inert-option warning.** `CsvParser` and `CsvStreamParser` now emit a one-time `console.warn` when
    `preserveUnsafeIntegersAsString` is set without `autoParseNumbers`, since the option has no effect on
    its own. Advisory only — it never throws.

  ### Performance
  - **Streaming no-quote fast path.** `CsvStreamParser` now locates line breaks with `indexOf` (instead
    of a per-character scan) when the pending buffer contains no quote character, matching the buffered
    tokenizer's fast path. CRLF pairing and cross-chunk partial lines are preserved; output is unchanged.

  ### Documentation
  - Fixed a broken TypeScript import example in the README (`DuplicateHeaderOptions` →
    `DuplicateHeaderStrategy`).
  - Documented previously-undocumented but shipped options: the `offset` parser option and the
    `JsonToCsv` `encoding`, `columns`, `sortHeaders`, `quoteAll`, `writeBom`, and `trailingNewline`
    options.

- 9c68b80: Add pagination and JSON→CSV output-control options.

  ### Features
  - **`offset` parser option** — skip the first N output records before collecting results. Composes
    with `limit` (offset first, then limit caps the remainder) so the two together select a window,
    useful for pagination. Like `limit`, it counts grouped output records (continuation-row groups map
    to a single record and are never split). Buffered and streaming parsers produce identical windows.
  - **`JsonToCsv` `columns` option** — provide an explicit header list/order. Columns can be reordered,
    subset, or pinned; keys not listed are dropped and listed keys missing from a record become empty
    cells. May include the array suffix (e.g. `tags[]`) so `arrayMode: 'rows'` output re-parses into
    arrays. This brings the buffered writer to parity with `JsonToCsvStream`, whose `columns` option now
    lives on the shared `JsonToCsvOptions`.
  - **`JsonToCsv` `sortHeaders` option** (default `true`) — when `false`, auto-collected headers keep
    first-seen insertion order instead of the depth/alphabetical sort, so a parse→stringify round-trip
    no longer silently reorders columns.
  - **`JsonToCsv` `quoteAll` option** — force every field (including empty cells) to be wrapped in the
    quote character.
  - **`JsonToCsv` `writeBom` option** — prepend a UTF-8 BOM so spreadsheet apps (notably Excel) detect
    UTF-8. Supported by both `JsonToCsv.stringify`/`writeFile*` and `JsonToCsvStream`.
  - **`JsonToCsv` `trailingNewline` option** — append a final line ending after the last row (default
    `false`, unchanged). Supported by the buffered and streaming writers.

  ### Bug fixes
  - **`CsvStreamParser` now applies `offset`/`limit` correctly.** These are stream-level options; they
    are no longer leaked into the internal per-continuation-group conversion, where an `offset` would
    previously have discarded every record.

### Patch Changes

- 9c68b80: Performance and internal cleanups (no API or behavior changes).

  - **Faster nested-JSON conversion.** `NestedJsonConverter` now precomputes the per-header dot-path
    segments once and reuses them across every row (instead of re-splitting each key of each row), and
    fuses header normalization and value transformation into a single pass — previously two separate
    full-record allocations. Buffered parsing is measurably faster on large files (notably with
    `autoParseNumbers`/`autoParseBooleans`), with no change to output.
  - **Deprecated the superseded `CsvReader.splitLines` and `CsvReader.parseLine`.** They are no longer
    used internally (the reader tokenizes rows and cells in a single pass) and are marked `@deprecated`;
    prefer `CsvParser` / `CsvReader.parse`. They still work and may be removed in a future major.
  - Minor allocation cleanups in per-row hot loops.

- 9c68b80: Performance: faster parsing and conversion with no API or behavior changes.

  - **Single-pass CSV tokenizer.** The buffered reader (`CsvParser`) previously scanned the input
    twice — once to split lines, then again to split each line into fields. It now tokenizes rows and
    cells in a single pass, roughly halving the character-scanning work. Buffered parsing is ~25-40%
    faster on large files in local benchmarks. Blank-line handling, `skipRows`, quoted newlines,
    CRLF/CR/LF, escaped quotes, and error line numbers are all unchanged.
  - **Quote-free fast paths.** Lines and content without any quote character are split with native
    `String.split` instead of a manual character loop (buffered and streaming parsers).
  - **Fewer redundant allocations in conversion.** `NestedJsonConverter` now computes the header
    key-normalization mapping once and reuses it across all records instead of splitting/rejoining
    every key of every row.
  - **`JsonToCsv` micro-optimizations.** The header→array-path lookup in continuation-row generation
    is precomputed once per call instead of per row, and header sorting no longer re-splits every
    header inside the comparator.

## 1.3.1

### Patch Changes

- 5930846: Add empty-value preservation controls for nested output in both `CsvParser` and `CsvStreamParser`.

  - Add `preserveEmptyColumnAsEmptyString` to preserve unquoted empty cells (for example `,,`).
  - Add `preserveEmptyString` to preserve explicitly quoted empty cells (for example `""` with the configured quote character), enabled by default.
  - Keep empty-value behavior aligned between sync and streaming parsing paths.
  - Apply empty-value precedence consistently: `defaultValues`, then `nullValues` + `nullRepresentation`, then preserve options, then omit.
  - Treat quoted-empty identifier values as continuation rows and prevent continuation rows from overriding the active grouping identifier.

## 1.3.0

### Minor Changes

- 82a3a8e: Align CsvStreamParser options with CsvParser by removing the stream-only nested option.

  CsvStreamParser now always emits nested grouped output, matching CsvParser continuation-row semantics. This removes divergence between streaming and non-stream parsing and avoids incorrect row-by-row interpretation of continuation rows.

  This is treated as a bug-fix alignment so both APIs produce consistent grouped results for nested CSV structures, while keeping stream-specific options such as batchSize and progress callbacks.

  Grouping is now strict: a continuation row cannot start a group. If the first row in a group has an empty identifier value, parsing throws `CsvParseError` instead of silently creating an ambiguous record.

  `CsvStreamParser` now includes a `maxContinuationGroupSize` safeguard (default `10000`) to prevent unbounded memory usage when identifier values are missing for long stretches.

### Patch Changes

- 82a3a8e: Enforce strict `identifierColumn` validation in both batch and streaming parsing paths.

  When `identifierColumn` is configured but not present in the processed headers, parsing now throws `CsvParseError` instead of silently continuing with ambiguous grouping behavior.

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
