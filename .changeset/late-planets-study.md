---
"@cerios/csv-nested-json": patch
---

Add empty-value preservation controls for nested output in both `CsvParser` and `CsvStreamParser`.

- Add `preserveEmptyColumnAsEmptyString` to preserve unquoted empty cells (for example `,,`).
- Add `preserveEmptyString` to preserve explicitly quoted empty cells (for example `""` with the configured quote character), enabled by default.
- Keep empty-value behavior aligned between sync and streaming parsing paths.
- Apply empty-value precedence consistently: `defaultValues`, then `nullValues` + `nullRepresentation`, then preserve options, then omit.
- Treat quoted-empty identifier values as continuation rows and prevent continuation rows from overriding the active grouping identifier.