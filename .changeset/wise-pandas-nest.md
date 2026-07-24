---
"@cerios/csv-nested-json": minor
---

Add pagination and JSON→CSV output-control options.

### Features

- **`offset` parser option** — skip the first N output records before collecting results. Composes
  with `limit` (offset first, then limit caps the remainder) so the two together select a window,
  useful for pagination. Like `limit`, it counts grouped output records (continuation-row groups map
  to a single record and are never split) and is applied after `rowFilter`. Buffered and streaming
  parsers produce identical windows.
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
