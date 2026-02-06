---
"@cerios/csv-nested-json": minor
---

Adds duplicate header handling with configurable strategies.

**New Features:**
- `duplicateHeaders` option in `CsvParserOptions` with strategies: `'error'`, `'rename'`, `'combine'`, `'first'`, `'last'`
- New `CsvDuplicateHeaderError` for strict validation
- New exported type: `DuplicateHeaderStrategy`

**⚠️ Migration Note:**
The default strategy is `'error'`, which will throw `CsvDuplicateHeaderError` if duplicate headers are detected. If your CSV files have duplicate headers and you want to preserve the previous behavior (last value wins), add:

```ts
CsvParser.parseString(csv, { duplicateHeaders: 'last' });
```

**Usage Examples:**

```ts
// Strict mode (default) - throws on duplicates
CsvParser.parseString(csv);

// Rename duplicates: id, id → id, id_1
CsvParser.parseString(csv, { duplicateHeaders: 'rename' });

// Combine values: 'red', 'blue' → 'red,blue'
CsvParser.parseString(csv, { duplicateHeaders: 'combine' });

// Keep first value only
CsvParser.parseString(csv, { duplicateHeaders: 'first' });

// Keep last value only (previous behavior)
CsvParser.parseString(csv, { duplicateHeaders: 'last' });
```
