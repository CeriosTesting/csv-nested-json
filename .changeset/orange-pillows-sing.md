---
"@cerios/csv-nested-json": patch
---

Enforce strict `identifierColumn` validation in both batch and streaming parsing paths.

When `identifierColumn` is configured but not present in the processed headers, parsing now throws `CsvParseError` instead of silently continuing with ambiguous grouping behavior.