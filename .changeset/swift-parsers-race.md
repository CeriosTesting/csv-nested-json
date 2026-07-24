---
"@cerios/csv-nested-json": patch
---

Performance: faster parsing and conversion with no API or behavior changes.

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
