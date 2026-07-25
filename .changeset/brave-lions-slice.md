---
"@cerios/csv-nested-json": major
---

Refocus the parser on faithful CSV → nested JSON conversion, make type coercion the default, and add
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
