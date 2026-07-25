---
"@cerios/csv-nested-json": minor
---

Close remaining parser edges: opt-in leading-space quoting, an inert-option warning, streaming
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
