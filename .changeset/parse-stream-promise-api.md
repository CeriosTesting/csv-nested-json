---
"@cerios/csv-nested-json": minor
---

Add Promise-based `CsvStreamParser.parseStream()` static method for simpler streaming API usage

- New static method `CsvStreamParser.parseStream(stream, options)` returns a Promise that resolves to an array of parsed records
- Provides a simpler alternative to the pipe-based streaming API
- Supports all existing parser options including column filtering, auto-parsing, and nested object conversion
- Handles stream errors and properly rejects the Promise on failure
