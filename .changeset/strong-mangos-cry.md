---
"@cerios/csv-nested-json": major
---

Require the `[]` suffix for arrays, fix latent parser bugs, remove `autoParseDates`, and tighten
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
  Date-looking strings are now kept as plain strings. To produce `Date` objects, use a
  `valueTransformer`:

  ```ts
  CsvParser.parseString(csv, {
  	valueTransformer: (value, header) => (header === "created" && typeof value === "string" ? new Date(value) : value),
  });
  ```

- **`autoParseNumbers` is now stricter.** Only plain decimal/float/scientific-notation
  values are converted. Values such as `0x1F`, `0b101`, `0o17`, `+5`, and
  whitespace-padded numbers (`" 42 "`) are now preserved as strings instead of being
  coerced to numbers. Leading-zero codes (e.g. `007`) continue to be preserved as strings.

### Bug fixes

- **`limit` now works in the non-streaming parser.** `CsvParser.parseString` /
  `parseFileSync` / `parseFile` previously ignored `limit` and returned all records. It
  now caps the number of output records (applied after `rowFilter`, without splitting a
  continuation-row group), matching `CsvStreamParser`.
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
