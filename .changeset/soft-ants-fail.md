---
"@cerios/csv-nested-json": minor
---

Align CsvStreamParser options with CsvParser by removing the stream-only nested option.

CsvStreamParser now always emits nested grouped output, matching CsvParser continuation-row semantics. This removes divergence between streaming and non-stream parsing and avoids incorrect row-by-row interpretation of continuation rows.

This is treated as a bug-fix alignment so both APIs produce consistent grouped results for nested CSV structures, while keeping stream-specific options such as batchSize and progress callbacks.

Grouping is now strict: a continuation row cannot start a group. If the first row in a group has an empty identifier value, parsing throws `CsvParseError` instead of silently creating an ambiguous record.

`CsvStreamParser` now includes a `maxContinuationGroupSize` safeguard (default `10000`) to prevent unbounded memory usage when identifier values are missing for long stretches.
