---
"@cerios/csv-nested-json": patch
---

Add column selection/exclusion feature with three new options:

- `includeColumns`: Array of column names to include (whitelist approach)
- `excludeColumns`: Array of column names to exclude (blacklist approach)
- `identifierColumn`: Specify which column identifies new records for continuation row grouping

When both `includeColumns` and `excludeColumns` are specified, include is applied first, then exclude.

Missing columns in `includeColumns` trigger console warnings. Non-existent columns in `excludeColumns` are silently ignored.

The `identifierColumn` option allows specifying which column should be used to detect new records in NestedJsonConverter, rather than always using the first column.
