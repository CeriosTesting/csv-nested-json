---
"@cerios/csv-nested-json": major
---

Close correctness/parity gaps, add commonly-expected options, and de-duplicate the two parsing paths.

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
