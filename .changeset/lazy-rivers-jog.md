---
"@cerios/csv-nested-json": patch
---

Performance and internal cleanups (no API or behavior changes).

- **Faster nested-JSON conversion.** `NestedJsonConverter` now precomputes the per-header dot-path
  segments once and reuses them across every row (instead of re-splitting each key of each row), and
  fuses header normalization and value transformation into a single pass — previously two separate
  full-record allocations. Buffered parsing is measurably faster on large files (notably with
  `autoParseNumbers`/`autoParseBooleans`), with no change to output.
- **Deprecated the superseded `CsvReader.splitLines` and `CsvReader.parseLine`.** They are no longer
  used internally (the reader tokenizes rows and cells in a single pass) and are marked `@deprecated`;
  prefer `CsvParser` / `CsvReader.parse`. They still work and may be removed in a future major.
- Minor allocation cleanups in per-row hot loops.
