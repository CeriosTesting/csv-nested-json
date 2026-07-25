# @cerios/csv-nested-json

A powerful TypeScript CSV parser that transforms flat CSV data into nested JSON objects with support for dot notation, explicit array fields, and complex hierarchical structures.

## 🚀 Features

- **Zero Dependencies** - No external CSV parsing libraries
- **Nested Objects** - Use dot notation in headers (e.g., `address.city`)
- **Explicit Array Fields** - Opt into arrays with the `[]` header suffix (e.g., `tags[]`); values are never grouped into arrays implicitly
- **Multi-Level Nesting** - Support for deeply nested structures
- **Multiple Input Methods** - Parse from files (sync/async), strings, or streams
- **True Streaming Parser** - Memory-efficient parsing for very large files
- **Bidirectional Conversion** - Convert CSV to JSON and JSON back to CSV
- **Column Selection** - Include or exclude specific columns during parsing
- **Duplicate Header Handling** - Smart strategies for duplicate column names
- **Limit Records** - Stop parsing after N records for previews or pagination
- **Progress Monitoring** - Track parsing progress with callbacks for large files
- **Batch Processing** - Process records in configurable batches for memory efficiency
- **Automatic Type Coercion** - Numbers and booleans are parsed by default (opt out per flag)
- **Error Accumulation** - `*Safe` methods collect per-row errors instead of throwing on the first
- **Column Mapping** - Rename columns to new keys
- **Null Handling** - Map configurable tokens to `null`/`undefined`/empty/omitted
- **RFC 4180 Aligned** - Handles quoted fields, escaped quotes, field-start quoting, and various line endings
- **Flexible Delimiters** - Any single character: comma, semicolon, tab, pipe, and more
- **Custom Encodings** - Handle different file encodings (UTF-8, Latin1, etc.)
- **BOM Handling** - Automatic Byte Order Mark detection and removal
- **TypeScript & JavaScript** - Full type definitions included
- **CommonJS & ESM** - Works in both module systems
- **Validation Modes** - Flexible error handling for malformed data
- **Custom Error Classes** - Detailed error information for debugging

## 📦 Installation

```bash
npm install @cerios/csv-nested-json
```

> **Upgrading from v1?** See the [Migration Guide](MIGRATION.md) — v2 makes type
> coercion the default and requires the `[]` suffix for arrays, among other
> breaking changes.

## 🎯 Quick Start

```typescript
import { CsvParser } from "@cerios/csv-nested-json";

// Parse CSV file
const result = CsvParser.parseFileSync("data.csv");
console.log(result);

// Output:
// [
//   {
//     id: "1",
//     name: "John Doe",
//     address: {
//       street: "123 Main St",
//       city: "New York",
//       zip: "10001"
//     }
//   }
// ]
```

## 📖 API Reference

| Method                          | Description                                                     |
| ------------------------------- | --------------------------------------------------------------- |
| `CsvParser.parseFileSync()`     | Parse CSV file synchronously                                    |
| `CsvParser.parseFile()`         | Parse CSV file asynchronously                                   |
| `CsvParser.parseString()`       | Parse CSV string content                                        |
| `CsvParser.parseStream()`       | Parse CSV from readable stream (buffers full content in memory) |
| `CsvParser.parseStringSafe()`   | Parse a string, collecting per-row errors as `{ data, errors }` |
| `CsvParser.parseFileSyncSafe()` | Parse a file (sync), collecting per-row errors                  |
| `CsvParser.parseFileSafe()`     | Parse a file (async), collecting per-row errors                 |
| `CsvParser.parseStreamSafe()`   | Parse a stream (buffered), collecting per-row errors            |
| `CsvStreamParser`               | True streaming parser for very large files                      |
| `CsvReader.parse()`             | Low-level CSV parser that returns flat records                  |
| `CsvFileReader.readFile*()`     | Low-level file/stream text reader                               |
| `NestedJsonConverter.convert()` | Low-level flat-record to nested JSON converter                  |
| `JsonToCsv.stringify()`         | Convert JSON objects to CSV string                              |
| `JsonToCsv.writeFileSync()`     | Write JSON objects to CSV file (sync)                           |
| `JsonToCsv.writeFile()`         | Write JSON objects to CSV file (async)                          |
| `JsonToCsvStream`               | Streaming JSON-to-CSV writer for large arrays                   |

## 🔧 Basic Usage

### 1. Parse File (Synchronous)

```typescript
import { CsvParser } from "@cerios/csv-nested-json";

const result = CsvParser.parseFileSync("./data.csv");
```

**When to use:** Small to medium files (<10MB), synchronous workflows, simple scripts.

### 2. Parse File (Asynchronous)

```typescript
import { CsvParser } from "@cerios/csv-nested-json";

const result = await CsvParser.parseFile("./data.csv");
```

**When to use:** Medium to large files, async/await workflows, web servers, non-blocking operations.

### 3. Parse String

```typescript
import { CsvParser } from "@cerios/csv-nested-json";

const csvString = `id,name,age
1,Alice,30
2,Bob,25`;

const result = CsvParser.parseString(csvString);
```

**When to use:** API responses, in-memory CSV data, testing, dynamic CSV generation.

### 4. Parse Stream

```typescript
import { CsvParser } from "@cerios/csv-nested-json";
import { createReadStream } from "node:fs";

const stream = createReadStream("./large-file.csv");
const result = await CsvParser.parseStream(stream);
```

**When to use:** CSV input already comes from a readable stream and buffering the full result in memory is acceptable.

**Note:** `CsvParser.parseStream()` buffers the entire stream before converting. For true incremental parsing, use `CsvStreamParser`.

### 5. True Streaming Parser (Memory Efficient)

For very large files where you want streaming processing without loading everything into memory (continuation rows are grouped by default):

```typescript
import { CsvStreamParser } from "@cerios/csv-nested-json";
import { createReadStream } from "node:fs";

const parser = new CsvStreamParser({
	autoParseNumbers: true,
	autoParseBooleans: true,
});

// Using async iteration
const stream = createReadStream("./very-large-file.csv");
for await (const record of stream.pipe(parser)) {
	console.log("Parsed record:", record);
	// Process each record as it's parsed
}

// Or using events
createReadStream("./very-large-file.csv")
	.pipe(new CsvStreamParser())
	.on("data", record => {
		console.log("Record:", record);
	})
	.on("end", () => {
		console.log("Done!");
	})
	.on("error", err => {
		console.error("Error:", err);
	});
```

**When to use:** Files too large to fit in memory, real-time processing, ETL pipelines.

### Progress Monitoring

Track parsing progress for large files:

```typescript
import { CsvStreamParser, ProgressInfo } from "@cerios/csv-nested-json";
import { createReadStream } from "node:fs";

const parser = new CsvStreamParser({
	progressCallback: (progress: ProgressInfo) => {
		console.log(`Processed ${progress.recordsEmitted} records`);
		console.log(`Bytes: ${progress.bytesProcessed}`);
		console.log(`Elapsed: ${progress.elapsedMs}ms`);
	},
	progressInterval: 1000, // Call every 1000 records (default: 100)
});

for await (const record of createReadStream("./large.csv").pipe(parser)) {
	// Process record
}
```

The `ProgressInfo` object contains:

- `bytesProcessed`: Total bytes read so far
- `recordsEmitted`: Number of records emitted
- `headersProcessed`: Whether headers have been parsed
- `elapsedMs`: Milliseconds since parsing started

### Batch Processing

Process records in batches for memory-efficient streaming:

```typescript
import { CsvStreamParser } from "@cerios/csv-nested-json";
import { createReadStream } from "node:fs";

const parser = new CsvStreamParser({
	batchSize: 100, // Emit arrays of 100 records
});

for await (const batch of createReadStream("./large.csv").pipe(parser)) {
	// batch is an array of up to 100 records
	await processBatch(batch);
}

// Note: parseStream() always returns a flat array regardless of batchSize
const allRecords = await CsvStreamParser.parseStream(
	createReadStream("./data.csv"),
	{ batchSize: 100 } // Batching used internally, result is flattened
);
```

### 6. Convert JSON to CSV

```typescript
import { JsonToCsv } from "@cerios/csv-nested-json";

const data = [
	{
		id: "1",
		name: "Alice",
		address: { city: "NYC", zip: "10001" },
	},
	{
		id: "2",
		name: "Bob",
		address: { city: "LA", zip: "90001" },
	},
];

// Convert to CSV string
const csvString = JsonToCsv.stringify(data);
console.log(csvString);
// Output:
// id,name,address.city,address.zip
// 1,Alice,NYC,10001
// 2,Bob,LA,90001

// Write directly to file
JsonToCsv.writeFileSync("./output.csv", data);

// Or async
await JsonToCsv.writeFile("./output.csv", data);
```

## 🎯 Advanced Examples

### Simple Flat CSV

**Input CSV:**

```csv
id,name,email
1,John Doe,john@example.com
2,Jane Smith,jane@example.com
```

**Output JSON:**

```json
[
	{
		"id": "1",
		"name": "John Doe",
		"email": "john@example.com"
	},
	{
		"id": "2",
		"name": "Jane Smith",
		"email": "jane@example.com"
	}
]
```

### Nested Objects with Dot Notation

**Input CSV:**

```csv
id,name,address.street,address.city,address.zip
1,John Doe,123 Main St,New York,10001
```

**Code:**

```typescript
const result = CsvParser.parseFileSync("./nested-data.csv");
```

**Output JSON:**

```json
[
	{
		"id": "1",
		"name": "John Doe",
		"address": {
			"street": "123 Main St",
			"city": "New York",
			"zip": "10001"
		}
	}
]
```

### Arrays from Grouped Rows

Arrays are always explicit: mark the array column with the `[]` suffix. Rows without a value in
the first column are continuation rows that append to the previous record's `[]` arrays.

**Input CSV:**

```csv
id,name,phones[].type,phones[].number
1,Alice,mobile,555-0001
,,home,555-0002
,,work,555-0003
```

**Code:**

```typescript
const result = CsvParser.parseFileSync("./grouped-data.csv");
```

**Output JSON:**

```json
[
	{
		"id": "1",
		"name": "Alice",
		"phones": [
			{ "type": "mobile", "number": "555-0001" },
			{ "type": "home", "number": "555-0002" },
			{ "type": "work", "number": "555-0003" }
		]
	}
]
```

> **Note:** Without the `[]` suffix, a repeated column value inside a single group is treated as a
> mistake and throws `CsvParseError` — values are never silently collapsed into an array.

### Deeply Nested Structures

**Input CSV:**

```csv
id,user.name,user.profile.age,user.profile.address.city,user.profile.address.zip
1,Alice,30,New York,10001
```

**Code:**

```typescript
const result = CsvParser.parseString(csvContent);
```

**Output JSON:**

```json
[
	{
		"id": "1",
		"user": {
			"name": "Alice",
			"profile": {
				"age": "30",
				"address": {
					"city": "New York",
					"zip": "10001"
				}
			}
		}
	}
]
```

### Forced Array Fields with `[]` Suffix

Use the `[]` suffix in headers to force a field to always be an array, even with a single value:

**Input CSV:**

```csv
id,name,tags[]
1,Alice,javascript
2,Bob,python
```

**Code:**

```typescript
const result = CsvParser.parseString(csvContent);
```

**Output JSON:**

```json
[
	{ "id": "1", "name": "Alice", "tags": ["javascript"] },
	{ "id": "2", "name": "Bob", "tags": ["python"] }
]
```

### Automatic Type Coercion (Numbers and Booleans)

Number and boolean parsing are **on by default**. Pass `false` to keep raw strings.

```typescript
const csvContent = `id,name,age,price,active,verified
1,Alice,30,19.99,true,FALSE
2,Bob,25,29.99,false,TRUE`;

// Coercion happens automatically — no options needed:
const result = CsvParser.parseString(csvContent);

// Result:
// [
//   { id: 1, name: "Alice", age: 30, price: 19.99, active: true, verified: false },
//   { id: 2, name: "Bob", age: 25, price: 29.99, active: false, verified: true }
// ]

// Disable to keep every value as a string:
const raw = CsvParser.parseString(csvContent, {
	autoParseNumbers: false,
	autoParseBooleans: false,
});
```

**Note:** Strings with leading zeros (like `"007"`) are preserved as strings to avoid data loss.

### Parsing Dates

There is no built-in date option: `Date.parse` recognition is too loose and locale-dependent, so
date-looking strings are kept as plain strings. Convert them yourself after parsing:

```typescript
const csvContent = `id,name,createdAt
1,Alice,2024-01-15`;

const parsed = CsvParser.parseString(csvContent);
const withDates = parsed.map(r => ({ ...r, createdAt: new Date(r.createdAt as string) }));

// [{ id: 1, name: "Alice", createdAt: Date("2024-01-15") }]
```

### Error Accumulation (`*Safe` methods)

Every buffered entry point has a `*Safe` counterpart that returns `{ data, errors }` instead of
throwing on the first bad row. `data` holds the records that parsed successfully; `errors` lists each
row/group that failed. This is ideal for validating an uploaded file in a single pass.

```typescript
const { data, errors } = CsvParser.parseStringSafe("a,b\n1,2\n1,2,3\n4,5", {
	validationMode: "error",
});

// data:   [{ a: 1, b: 2 }, { a: 4, b: 5 }]
// errors: [{ row: 3, column: 3, code: "validation", message: "..." }]
```

Recoverable errors are per-row: `code: "validation"` (a row's column count does not match the
header, in `validationMode: "error"`) and `code: "grouping"` (a continuation/array grouping problem,
such as a repeated non-`[]` path within a group). Configuration and I/O problems (invalid
delimiter/quote, unsupported encoding, missing file) are **not** per-row and still throw.

Available as `parseStringSafe`, `parseFileSyncSafe`, `parseFileSafe`, and `parseStreamSafe`
(the streaming `CsvStreamParser` is unaffected and still throws / emits `'error'`).

### Column Mapping

```typescript
const csvContent = `user_id,first_name,last_name
1,John,Doe`;

const result = CsvParser.parseString(csvContent, {
	columnMapping: {
		user_id: "id",
		first_name: "firstName",
		last_name: "lastName",
	},
});

// Result:
// [{ id: "1", firstName: "John", lastName: "Doe" }]
```

### Column Selection

Include or exclude specific columns during parsing:

```typescript
const csvContent = `id,name,email,password,role
1,Alice,alice@example.com,secret123,admin
2,Bob,bob@example.com,password456,user`;

// Include only specific columns
const result1 = CsvParser.parseString(csvContent, {
	includeColumns: ["id", "name", "email"],
});
// Result: [{ id: "1", name: "Alice", email: "alice@example.com" }, ...]

// Exclude sensitive columns
const result2 = CsvParser.parseString(csvContent, {
	excludeColumns: ["password"],
});
// Result: [{ id: "1", name: "Alice", email: "alice@example.com", role: "admin" }, ...]
```

### Duplicate Header Handling

Handle CSV files with duplicate column names:

```typescript
const csvContent = `id,name,value,value,value
1,Test,A,B,C`;

// Keep first occurrence
const result1 = CsvParser.parseString(csvContent, {
	duplicateHeaders: "first",
});
// Result: [{ id: "1", name: "Test", value: "A" }]

// Keep last occurrence
const result2 = CsvParser.parseString(csvContent, {
	duplicateHeaders: "last",
});
// Result: [{ id: "1", name: "Test", value: "C" }]

// Combine into comma-separated string
const result3 = CsvParser.parseString(csvContent, {
	duplicateHeaders: "combine",
});
// Result: [{ id: "1", name: "Test", value: "A,B,C" }]

// Rename duplicates with suffix
const result4 = CsvParser.parseString(csvContent, {
	duplicateHeaders: "rename",
});
// Result: [{ id: "1", name: "Test", value: "A", value_1: "B", value_2: "C" }]

// Throw error on duplicates (default)
const result5 = CsvParser.parseString(csvContent, {
	duplicateHeaders: "error",
});
// Throws CsvDuplicateHeaderError
```

### Limit Records

Limit the number of records parsed (useful for previews or pagination):

```typescript
const csvContent = `id,name
1,Alice
2,Bob
3,Charlie
4,Diana
5,Eve`;

const result = CsvParser.parseString(csvContent, {
	limit: 3,
});
// Result: [{ id: "1", ... }, { id: "2", ... }, { id: "3", ... }]
// Parsing stops after 3 records - efficient for large files
```

### Skip Rows (Metadata Headers)

```typescript
const csvContent = `Report generated on 2024-01-15
Source: Production Database
id,name,email
1,Alice,alice@example.com
2,Bob,bob@example.com`;

const result = CsvParser.parseString(csvContent, {
	skipRows: 2, // Skip the first 2 metadata rows
});

// Result:
// [
//   { id: "1", name: "Alice", email: "alice@example.com" },
//   { id: "2", name: "Bob", email: "bob@example.com" }
// ]
```

### Empty Value Preservation

By default, unquoted empty values are omitted and explicitly quoted empty values are preserved. You can control each case independently.

```typescript
const csvContent = `id,emptyColumn,emptyQuoted
1,,""`;

// Preserve only unquoted empties: ,, -> ''
const preserveColumns = CsvParser.parseString(csvContent, {
	preserveEmptyColumnAsEmptyString: true,
	preserveEmptyString: false,
});
// [{ id: "1", emptyColumn: "" }]

// Preserve only quoted empties: "" -> ''
const preserveQuoted = CsvParser.parseString(csvContent, {
	preserveEmptyString: true,
});
// [{ id: "1", emptyQuoted: "" }]

// Preserve both
const preserveBoth = CsvParser.parseString(csvContent, {
	preserveEmptyColumnAsEmptyString: true,
	preserveEmptyString: true,
});
// [{ id: "1", emptyColumn: "", emptyQuoted: "" }]
```

When multiple options apply, precedence is:

1. `nullValues` + `nullRepresentation`
2. `preserveEmptyColumnAsEmptyString` / `preserveEmptyString`
3. Omit

### Null Value Handling

```typescript
const csvContent = `id,name,nickname
1,Alice,N/A
2,Bob,null
3,Charlie,Bobby`;

const result = CsvParser.parseString(csvContent, {
	nullValues: ["null", "NULL", "N/A", "n/a", ""],
	nullRepresentation: "null", // or 'undefined', 'empty-string', 'omit'
});

// Result with nullRepresentation: 'null':
// [
//   { id: "1", name: "Alice", nickname: null },
//   { id: "2", name: "Bob", nickname: null },
//   { id: "3", name: "Charlie", nickname: "Bobby" }
// ]

// Result with nullRepresentation: 'omit' (default):
// [
//   { id: "1", name: "Alice" },
//   { id: "2", name: "Bob" },
//   { id: "3", name: "Charlie", nickname: "Bobby" }
// ]
```

Null conversion is opt-in. Values are only treated as null when `nullValues` is provided.

### BOM Handling

The parser automatically strips UTF-8 and UTF-16 BOM by default:

```typescript
// BOM is automatically handled
const result = CsvParser.parseFileSync("./windows-excel-export.csv");

// Disable BOM stripping if needed
const result2 = CsvParser.parseString(csvContent, {
	stripBom: false,
});
```

### Complex Multi-Group Example

**Input CSV:**

```csv
id,username,profile.firstName,profile.lastName,addresses[].type,addresses[].city
1,johndoe,John,Doe,home,New York
,,,,work,Boston
2,janedoe,Jane,Doe,home,Chicago
```

**Code:**

```typescript
const result = CsvParser.parseFileSync("./complex-data.csv");
```

**Output JSON:**

```json
[
	{
		"id": "1",
		"username": "johndoe",
		"profile": {
			"firstName": "John",
			"lastName": "Doe"
		},
		"addresses": [
			{ "type": "home", "city": "New York" },
			{ "type": "work", "city": "Boston" }
		]
	},
	{
		"id": "2",
		"username": "janedoe",
		"profile": {
			"firstName": "Jane",
			"lastName": "Doe"
		},
		"addresses": [{ "type": "home", "city": "Chicago" }]
	}
]
```

**Note:** A `[]` array field is normalized across records: a record with a single value for that path is represented as a single-item array.

### Custom Delimiters

**Semicolon-separated values:**

```typescript
const csvSemicolon = `id;name;city
1;Alice;NYC
2;Bob;LA`;

const result = CsvParser.parseString(csvSemicolon, {
	delimiter: ";",
});
```

**Tab-separated values:**

```typescript
const csvTab = `id\tname\tcity
1\tAlice\tNYC`;

const result = CsvParser.parseString(csvTab, {
	delimiter: "\t",
});
```

**Pipe-separated values:**

```typescript
const csvPipe = `id|name|city
1|Alice|NYC`;

const result = CsvParser.parseString(csvPipe, {
	delimiter: "|",
});
```

### Custom Quote Character

```typescript
const csvSingleQuote = `id,name,message
1,Alice,'Hello, World'
2,Bob,'It''s working'`;

const result = CsvParser.parseString(csvSingleQuote, {
	quote: "'",
});
```

### Custom Encoding

```typescript
// Latin1 encoding
const result = await CsvParser.parseFile("./data-latin1.csv", {
	encoding: "latin1",
});

// UTF-16LE encoding
const result2 = await CsvParser.parseFile("./data-utf16.csv", {
	encoding: "utf16le",
});
```

### Validation Modes

```typescript
// Ignore extra columns silently
const result1 = CsvParser.parseString(csvData, {
	validationMode: "ignore",
});

// Warn about extra columns (default)
const result2 = CsvParser.parseString(csvData, {
	validationMode: "warn",
});

// Throw error on extra columns
try {
	const result3 = CsvParser.parseString(csvData, {
		validationMode: "error",
	});
} catch (error) {
	console.error("Validation error:", error.message);
}
```

### Parse CSV from API Response

```typescript
async function parseApiCsv() {
	const response = await fetch("https://api.example.com/data.csv");
	const csvString = await response.text();

	const data = CsvParser.parseString(csvString, {
		validationMode: "ignore",
	});

	return data;
}
```

### Parse Large File with Streams

```typescript
import { createReadStream } from "node:fs";

async function parseLargeFile(filePath: string) {
	const stream = createReadStream(filePath, {
		highWaterMark: 64 * 1024, // 64KB chunks
	});

	const data = await CsvParser.parseStream(stream, {
		validationMode: "warn",
		encoding: "utf-8",
	});

	return data;
}
```

### European CSV Format

European CSV files typically use semicolon delimiters and comma as decimal separator:

```typescript
const europeanCsv = `id;name;price;location.city;location.country
1;Product A;12,50;Paris;France
2;Product B;8,99;Berlin;Germany`;

const result = CsvParser.parseString(europeanCsv, {
	delimiter: ";",
	validationMode: "error",
});

// Result:
// [
//   {
//     id: "1",
//     name: "Product A",
//     price: "12,50",
//     location: { city: "Paris", country: "France" }
//   },
//   ...
// ]
```

### Parse Multiple Files Concurrently

```typescript
const files = ["data1.csv", "data2.csv", "data3.csv"];

const results = await Promise.all(files.map(file => CsvParser.parseFile(file)));
```

## 🧪 Options Reference

> The authoritative option definitions live in [`src/types.ts`](src/types.ts). The interface below
> is a convenience summary and may lag behind the source.

### CsvParserOptions

```typescript
interface CsvParserOptions {
	// Validation
	validationMode?: "ignore" | "warn" | "error"; // Default: 'warn'

	// Parsing
	delimiter?: string; // Default: ','
	quote?: string; // Default: '"'

	// File I/O
	encoding?: BufferEncoding; // Default: 'utf-8'

	// Row handling
	skipRows?: number; // Default: 0
	stripBom?: boolean; // Default: true
	commentPrefix?: string; // Skip lines starting with this prefix
	trimValues?: boolean; // Trim unquoted field values (Default: false)
	trimLeadingSpace?: boolean; // Recognize a quote after leading spaces (Default: false)
	limit?: number; // Max records to parse
	offset?: number; // Skip N output records before collecting (applied before limit)

	// Column selection
	includeColumns?: string[]; // Include only these columns (matched against original CSV headers)
	excludeColumns?: string[]; // Exclude columns after includeColumns is applied

	// Duplicate header handling
	duplicateHeaders?: DuplicateHeaderStrategy; // Default: 'error'

	// Type coercion (both default: true — pass false to keep raw strings)
	autoParseNumbers?: boolean; // Default: true
	preserveUnsafeIntegersAsString?: boolean; // Default: false
	autoParseBooleans?: boolean; // Default: true

	// Column renaming
	columnMapping?: Record<string, string>; // Rename columns (keyed by raw CSV header)

	// Array handling
	arraySuffixIndicator?: string; // Default: '[]'
	emptyArrayBehavior?: "empty-array" | "omit"; // Default: 'omit'

	// Null handling
	nullValues?: string[]; // Values to treat as null
	nullRepresentation?: "null" | "undefined" | "empty-string" | "omit"; // Default: 'omit'

	// Empty value preservation
	preserveEmptyColumnAsEmptyString?: boolean; // Preserve unquoted empties: ,,
	preserveEmptyString?: boolean; // Preserve quoted empties: ""

	// Row grouping
	identifierColumn?: string; // Column for grouping continuation rows
}

// Streaming-specific options (CsvStreamParser)
interface CsvStreamParserOptions extends CsvParserOptions {
	batchSize?: number; // Emit records in batches
	maxContinuationGroupSize?: number; // Max raw rows buffered per continuation group (default: 10000)
	progressCallback?: ProgressCallback; // Progress tracking callback
	progressInterval?: number; // Records between callbacks (default: 100)
}
```

### Option Details

#### `validationMode`

Controls how the parser handles rows with more values than headers:

- `'ignore'`: Silently ignore extra values
- `'warn'` (default): Log a warning to console
- `'error'`: Throw a `CsvValidationError`

In `'error'` mode, rows with **fewer** values than headers also throw (strict validation). In
`'warn'`/`'ignore'` mode, short rows stay lenient and missing trailing cells are padded with empty
values. `CsvStreamParser` applies the same validation behavior as the buffered `CsvParser`.

#### `delimiter`

Field delimiter character. Common values:

- `','` (default) - Comma-separated values
- `';'` - Semicolon-separated values (common in Europe)
- `'\t'` - Tab-separated values
- `'|'` - Pipe-separated values

#### `quote`

Quote character for escaping fields containing delimiters or newlines:

- `'"'` (default) - Double quotes
- `"'"` - Single quotes

#### `encoding`

File encoding when reading from files or streams:

- `'utf-8'` (default)
- `'utf-16le'`
- `'latin1'`
- `'ascii'`

#### `skipRows`

Number of rows to skip before the header row. Useful for files with metadata at the top.

#### `stripBom`

Automatically remove BOM (Byte Order Mark) from the beginning of content. Default: `true`

#### `commentPrefix`

Skip lines whose raw text starts with this prefix (checked at the start of each line). Comment lines
are removed entirely — they are neither the header nor data rows. Because they are removed, error line
numbers reference the position among the remaining (non-comment) lines.

```typescript
CsvParser.parseString(csv, { commentPrefix: "#" });
```

#### `trimValues`

Trim leading/trailing whitespace from **unquoted** field values (and headers). Whitespace inside
quoted fields is always preserved. Default: `false`

```typescript
// 'a, b , c' -> ['a', 'b', 'c']; '"  x  "' stays '  x  '
CsvParser.parseString(csv, { trimValues: true });
```

#### `trimLeadingSpace`

Recognize a quote character as field-opening even when it is preceded by leading spaces (the spaces
are discarded). Default: `false`. By default (per RFC 4180) a space before a quote is significant, so
the quote is treated as a literal and a delimiter inside the intended quoted field would split it.
Enable this for producers that emit a space after the delimiter. Orthogonal to `trimValues`;
whitespace **inside** a quoted field is always preserved. Both parsers behave identically.

```typescript
// '1, "x,y"' -> { note: 'x,y' } instead of splitting on the inner comma
CsvParser.parseString(csv, { trimLeadingSpace: true });
```

#### `autoParseNumbers`

Automatically convert numeric strings to numbers. **On by default** — pass `autoParseNumbers: false`
to keep numeric strings as-is. Strings with leading zeros (like `"007"`) are preserved.

Note: JavaScript numbers lose integer precision above `Number.MAX_SAFE_INTEGER` (`9007199254740991`).
If you want to prevent precision loss for large integers, enable `preserveUnsafeIntegersAsString`.

#### `preserveUnsafeIntegersAsString`

When used with `autoParseNumbers`, keeps integers outside JavaScript's safe integer range as strings.

```typescript
const result = CsvParser.parseString(csv, {
	autoParseNumbers: true,
	preserveUnsafeIntegersAsString: true,
});

// "9007199254740993" stays a string to avoid precision loss
```

#### `autoParseBooleans`

Automatically convert `'true'`/`'false'` strings to booleans (case-insensitive). **On by default** —
pass `autoParseBooleans: false` to keep them as strings.

#### `columnMapping`

Map/rename column headers. Keyed by the raw CSV header name.

```typescript
columnMapping: { 'user_id': 'id', 'first_name': 'firstName' }
```

#### `limit`

Maximum number of records to parse. Parsing stops after this limit is reached, which is efficient for large files when you only need a preview or first N records.

```typescript
limit: 100; // Stop after 100 records
```

#### `offset`

Number of output records to skip before collecting results. Applied **before** `limit`, so `offset`
and `limit` together select a window of records (useful for pagination). Like `limit`, it counts
grouped output records (continuation-row groups map to a single record and are never split). Both
parsers apply it identically.

```typescript
// Skip the first 100 records, then take the next 50
CsvParser.parseString(csv, { offset: 100, limit: 50 });
```

#### `includeColumns`

Array of column names to include. Only these columns will be in the output.

```typescript
includeColumns: ["id", "name", "email"]; // Only include these columns
```

`includeColumns` and `excludeColumns` can be combined. Inclusion is applied first, then exclusion.
Column filtering matches original CSV header names before `columnMapping` is applied.

#### `excludeColumns`

Array of column names to exclude. All other columns will be included.

```typescript
excludeColumns: ["password", "secret"]; // Exclude sensitive columns
```

#### `duplicateHeaders`

Strategy for handling duplicate column names in CSV headers. Default: `'error'`

```typescript
duplicateHeaders: "rename"; // 'error' | 'rename' | 'combine' | 'first' | 'last'
```

- `'error'` (default): Throw `CsvDuplicateHeaderError` on duplicates
- `'rename'`: Rename duplicates with suffix (e.g., `value`, `value_1`, `value_2`)
- `'combine'`: Combine values into comma-separated string
- `'first'`: Keep only the first occurrence of duplicate headers
- `'last'`: Keep only the last occurrence

#### `identifierColumn`

Column to use as the identifier for grouping continuation rows. By default, the first column is used to identify new records. When this column has an empty value, the row is treated as a continuation of the previous record.

The first data row in a group must contain an identifier value. If the first row is a continuation row (empty identifier), parsing throws `CsvParseError` to avoid ambiguous grouping.

If `columnMapping` is used, set `identifierColumn` to the mapped header name (not the original CSV header).

```typescript
// Use 'productId' instead of first column to group rows
identifierColumn: "productId";
```

#### `maxContinuationGroupSize` (streaming only)

Maximum number of raw rows buffered for a single continuation group in `CsvStreamParser`. This protects against unbounded memory growth when identifier values are missing for long stretches.

- Default: `10000`
- When exceeded, parsing throws `CsvParseError`

```typescript
maxContinuationGroupSize: 5000;
```

#### `arraySuffixIndicator`

Suffix in headers to force array type. Default: `'[]'`

#### `emptyArrayBehavior`

How to handle forced array fields with no values:

- `'omit'` (default): Don't include the field
- `'empty-array'`: Include as `[]`

#### `nullValues`

Strings to interpret as null values. Null detection is disabled unless this option is provided.

#### `nullRepresentation`

How to represent null values in output:

- `'omit'` (default): Remove the field
- `'null'`: Use JavaScript `null`
- `'undefined'`: Use JavaScript `undefined`
- `'empty-string'`: Use empty string `''`

#### `preserveEmptyColumnAsEmptyString`

Preserve unquoted empty columns (for example `,,`) as `''` in nested output.

- Default: `false`

#### `preserveEmptyString`

Preserve explicitly quoted empty strings (for example `""` with the default quote character) as `''` in nested output.

- Default: `true`

Both options work for `CsvParser` and `CsvStreamParser`. Set `preserveEmptyString: false` if you want quoted empties omitted.

### Complete Example with All Options

```typescript
const result = await CsvParser.parseFile("./data.csv", {
	// Validation
	validationMode: "error",

	// Parsing
	delimiter: ",",
	quote: '"',
	encoding: "utf-8",

	// Row handling
	skipRows: 2,
	stripBom: true,
	limit: 1000,

	// Column selection
	excludeColumns: ["password", "secret"],

	// Duplicate header handling
	duplicateHeaders: "rename",

	// Type coercion (both default to true; shown here for clarity)
	autoParseNumbers: true,
	autoParseBooleans: true,

	// Column renaming
	columnMapping: { user_id: "id" },

	// Row grouping
	identifierColumn: "id",

	// Array handling
	arraySuffixIndicator: "[]",
	emptyArrayBehavior: "empty-array",

	// Null handling
	nullValues: ["null", "N/A", "-"],
	nullRepresentation: "null",

	// Empty value preservation
	preserveEmptyColumnAsEmptyString: true,
	preserveEmptyString: true,
});
```

## 📚 API Reference

### CsvParser Class

#### `parseFileSync<T>(filePath: string, options?: CsvParserOptions): T[]`

Parses a CSV file synchronously and returns an array of nested JSON objects.

#### `parseFile<T>(filePath: string, options?: CsvParserOptions): Promise<T[]>`

Parses a CSV file asynchronously.

#### `parseString<T>(csvContent: string, options?: CsvParserOptions): T[]`

Parses CSV string content.

#### `parseStream<T>(stream: Readable, options?: CsvParserOptions): Promise<T[]>`

Parses CSV from a readable stream and returns all records. This method buffers the full stream in memory before conversion.

#### `parseStringSafe<T>(csvContent, options?): CsvParseResult<T>`

Like `parseString`, but returns `{ data, errors }` — collecting recoverable per-row errors instead of
throwing on the first. Configuration/I/O errors still throw.

#### `parseFileSyncSafe<T>(filePath, options?): CsvParseResult<T>`

`parseFileSync` with error accumulation.

#### `parseFileSafe<T>(filePath, options?): Promise<CsvParseResult<T>>`

`parseFile` with error accumulation.

#### `parseStreamSafe<T>(stream, options?): Promise<CsvParseResult<T>>`

`parseStream` with error accumulation.

```typescript
interface CsvRowError {
	row: number; // 1-based row where the problem occurred
	column?: number; // 1-based column, when known
	code: "validation" | "grouping";
	message: string;
}

interface CsvParseResult<T> {
	data: T[]; // records that parsed successfully
	errors: CsvRowError[]; // recoverable per-row errors, in order
}
```

### CsvStreamParser Class

A Transform stream that parses CSV data chunk by chunk, emitting records as they become available.

```typescript
import { CsvStreamParser, ProgressInfo } from "@cerios/csv-nested-json";

const parser = new CsvStreamParser({
	autoParseNumbers: true,
	limit: 1000, // Stop after 1000 records
	batchSize: 100, // Emit in batches of 100
	maxContinuationGroupSize: 10000, // Safety guard for continuation buffering
	progressCallback: (info: ProgressInfo) => {
		console.log(`Progress: ${info.recordsEmitted} records, ${info.elapsedMs}ms`);
	},
	progressInterval: 500, // Call progress every 500 records
	// ... other CsvParserOptions
});

createReadStream("./large.csv")
	.pipe(parser)
	.on("data", record => console.log(record))
	.on("end", () => console.log("Done"));
```

#### Static Promise API

```typescript
// Parse stream and collect all records
const records = await CsvStreamParser.parseStream(createReadStream("./data.csv"), {
	autoParseNumbers: true,
	limit: 100,
});
```

### JsonToCsv Class

#### `stringify(data: object[], options?: JsonToCsvOptions): string`

Convert array of objects to CSV string.

#### `writeFileSync(filePath: string, data: object[], options?: JsonToCsvOptions): void`

Write objects to CSV file synchronously.

#### `writeFile(filePath: string, data: object[], options?: JsonToCsvOptions): Promise<void>`

Write objects to CSV file asynchronously.

```typescript
import { JsonToCsv } from "@cerios/csv-nested-json";

const data = [{ id: 1, user: { name: "Alice", age: 30 }, tags: ["js", "ts"] }];

const csv = JsonToCsv.stringify(data, {
	delimiter: ",",
	quote: '"',
	arrayMode: "rows", // 'rows' (continuation rows) or 'json' (stringify arrays)
	arraySuffixIndicator: "[]", // suffix added to array headers in 'rows' mode (default '[]')
	lineEnding: "\n", // '\n' (default) or '\r\n'
	includeHeader: true, // emit a header row (default true)
	nullValue: "", // string used for an explicit null (default ''), distinct from a missing cell
});
```

In `'rows'` mode, array columns are emitted with the `arraySuffixIndicator` suffix (for example
`tags[]`, `phones[].type`) so the output re-parses back into arrays. In `'json'` mode the suffix is
not used because each array is written to a single cell.

**`JsonToCsvOptions`:**

- `delimiter` / `quote` — single characters (default `,` and `"`).
- `encoding` — file encoding for `writeFile`/`writeFileSync` (default `'utf-8'`).
- `lineEnding` — `'\n'` (default) or `'\r\n'`.
- `includeHeader` — whether to emit a header row (default `true`).
- `arrayMode` — `'rows'` (default) or `'json'`.
- `arraySuffixIndicator` — suffix for array headers in `'rows'` mode (default `'[]'`).
- `nullValue` — string emitted for an explicit `null` so it can be distinguished from an empty cell
  on re-parse (default `''`). A missing/`undefined` value always becomes an empty string.
- `columns` — explicit header columns, in the exact order they should appear. When provided, headers
  are used as-is instead of being collected from the data, so columns can be reordered, subset, or
  pinned. Listed keys missing from a record become empty cells; unlisted keys are dropped. May use
  dot-notation and the array suffix (e.g. `['id', 'name', 'tags[]']`).
- `sortHeaders` — when headers are auto-collected, sort them (primary keys first, then nested keys
  alphabetically). Set `false` to keep first-seen insertion order. Ignored when `columns` is set
  (default `true`).
- `quoteAll` — wrap every field in the quote character regardless of content, for consumers that
  require uniformly quoted output (default `false`).
- `writeBom` — prepend a UTF-8 byte order mark so spreadsheet apps (notably Excel) detect UTF-8
  (default `false`).
- `trailingNewline` — append a final line ending after the last row (default `false`).

**Known limitation:** an empty nested object (`{ a: {} }`) produces no column and is dropped, because
there is no leaf value to place under a header.

#### Streaming JSON to CSV

For large arrays, `JsonToCsvStream` (a `Transform`) writes CSV incrementally instead of building the
whole string in memory. Headers are fixed up front — from an explicit `columns` option, or derived
from the **first** object written (keys on later objects that are not in the header set are dropped).

```typescript
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { JsonToCsvStream } from "@cerios/csv-nested-json";

await pipeline(Readable.from(records), new JsonToCsvStream({ delimiter: ";" }), createWriteStream("out.csv"));
```

### Error Classes

The library provides custom error classes for better error handling:

```typescript
import {
	CsvParseError,
	CsvFileNotFoundError,
	CsvValidationError,
	CsvEncodingError,
	CsvDuplicateHeaderError,
} from "@cerios/csv-nested-json";

try {
	const result = CsvParser.parseFileSync("./data.csv", {
		validationMode: "error",
	});
} catch (error) {
	if (error instanceof CsvFileNotFoundError) {
		console.error(`File not found: ${error.filePath}`);
	} else if (error instanceof CsvDuplicateHeaderError) {
		console.error(`Duplicate headers: ${error.duplicateHeaders.join(", ")}`);
	} else if (error instanceof CsvValidationError) {
		console.error(`Validation error at row ${error.row}`);
		console.error(`Expected ${error.expectedColumns}, got ${error.actualColumns}`);
	} else if (error instanceof CsvEncodingError) {
		console.error(`Encoding error: ${error.encoding}`);
	} else if (error instanceof CsvParseError) {
		console.error(`Parse error at row ${error.row}, column ${error.column}`);
	}
}
```

## 💡 How It Works

### 1. Row Grouping

Records are grouped by the first column (identifier) by default, or by the column specified in `identifierColumn`. When this column is empty, the row is treated as a continuation of the previous group:

```csv
id,name,item
1,Alice,Book
,,Pen
,,Notebook
2,Bob,Laptop
```

Groups:

- Group 1: Rows with `id=1` and the two continuation rows
- Group 2: Row with `id=2`

### 2. Dot Notation Parsing

Column headers with dots create nested object structures:

```csv
user.profile.name,user.profile.age
Alice,30
```

Creates:

```json
{
	"user": {
		"profile": {
			"name": "Alice",
			"age": "30"
		}
	}
}
```

### 3. Explicit Array Fields

Arrays are created only for columns marked with the `[]` suffix. Within a group, continuation rows
append to those arrays:

```csv
id,contact[].type,contact[].value
1,email,alice@example.com
,,phone,555-1234
```

Creates:

```json
{
	"id": "1",
	"contact": [
		{ "type": "email", "value": "alice@example.com" },
		{ "type": "phone", "value": "555-1234" }
	]
}
```

If the same non-`[]` path has a value in more than one row of a group, the parser throws
`CsvParseError` rather than guessing an array — add the `[]` suffix to make the intent explicit.

### 4. Empty Value Handling

Empty or null values are omitted from the output:

```csv
id,name,optional
1,Alice,
2,Bob,Value
```

Creates:

```json
[
	{ "id": "1", "name": "Alice" },
	{ "id": "2", "name": "Bob", "optional": "Value" }
]
```

## 🆚 Comparison

### When to Use Each Method

| Method            | Best For                                    | File Size                | Blocking |
| ----------------- | ------------------------------------------- | ------------------------ | -------- |
| `parseFileSync()` | Scripts, small files                        | <10MB                    | Yes      |
| `parseFile()`     | Web servers, medium files                   | 10MB-100MB               | No       |
| `parseString()`   | API responses, testing                      | Any (in-memory)          | Yes      |
| `parseStream()`   | Readable stream inputs with buffered output | Any (buffered in memory) | No       |
| `CsvStreamParser` | Large/very large files, ETL pipelines       | Any size                 | No       |

### Traditional CSV Parsing

```javascript
// ❌ Manual parsing - tedious and error-prone
const fs = require("fs");
const data = fs.readFileSync("data.csv", "utf-8");
const lines = data.split("\n");
const headers = lines[0].split(",");
const result = [];

for (let i = 1; i < lines.length; i++) {
	const values = lines[i].split(",");
	const obj = {};

	for (let j = 0; j < headers.length; j++) {
		const keys = headers[j].split(".");
		let current = obj;

		// Manually handle nesting...
		// ... complex nested object logic
	}

	result.push(obj);
}
```

### With @cerios/csv-nested-json

```typescript
// ✅ Simple, type-safe, and powerful
const result = CsvParser.parseFileSync("data.csv");

// ✅ Automatic nested object creation
// ✅ Explicit array fields via the `[]` suffix
// ✅ RFC 4180 compliant parsing
// ✅ Flexible configuration options
```

## 📋 CSV Format Support

The library follows RFC 4180 and supports:

- ✅ **Quoted Fields with Commas:** `"value, with, commas"`
- ✅ **Quoted Fields with Newlines:** Multi-line values within quotes
- ✅ **Escaped Quotes:** `"He said ""Hello"""` → `He said "Hello"`
- ✅ **Quotes only special at field start:** a quote in the middle of an unquoted field
  (e.g. `foo"bar`) is treated as a literal character, per RFC 4180
- ✅ **Various Line Endings:** Windows (CRLF), Unix (LF), Mac (CR)
- ✅ **BOM Handling:** UTF-8 and UTF-16 BOM automatically stripped
- ✅ **Empty Lines:** Automatically skipped
- ✅ **Comment Lines:** Optional, via `commentPrefix`
- ✅ **Whitespace Trimming:** Optional, via `trimValues` (quoted whitespace preserved)
- ✅ **Flexible Column Counts:** Continuation rows can have different column counts
- ✅ **Custom Delimiters:** Comma, semicolon, tab, pipe, or any **single** character
- ✅ **Custom Quote Characters:** Double quotes, single quotes, or any **single** character
- ✅ **Multiple Encodings:** UTF-8, Latin1, UTF-16, and more

> **Note:** `delimiter` and `quote` must each be a single character (and different from each other);
> a multi-character value throws `CsvParseError`.

### Quoted Fields Examples

```csv
id,name,description
1,Alice,"Product with, comma"
2,Bob,"Product with ""quotes"""
3,Charlie,"Multi-line
description here"
```

All of these are correctly parsed!

## 💻 TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import {
	CsvParser,
	CsvStreamParser,
	JsonToCsv,
	CsvParserOptions,
	CsvStreamParserOptions,
	CsvParseError,
	CsvValidationError,
	NestedObject,
	ProgressInfo,
	ProgressCallback,
	DuplicateHeaderStrategy,
} from "@cerios/csv-nested-json";

// Generic type support
interface Person {
	id: number;
	name: string;
	address: {
		city: string;
		zip: string;
	};
}

const result = CsvParser.parseFileSync<Person>("people.csv", {
	autoParseNumbers: true,
});

// result is typed as Person[]
console.log(result[0].address.city);
```

### Exported Types

```typescript
// Options
type ValidationMode = "ignore" | "warn" | "error";
type EmptyArrayBehavior = "empty-array" | "omit";
type NullRepresentation = "null" | "undefined" | "empty-string" | "omit";
type ArrayMode = "rows" | "json";
type DuplicateHeaderStrategy = "error" | "rename" | "combine" | "first" | "last";

// Function types
type ProgressCallback = (info: ProgressInfo) => void | Promise<void>;

// Progress tracking
interface ProgressInfo {
	bytesProcessed: number; // Total bytes read
	recordsEmitted: number; // Records emitted so far
	headersProcessed: boolean; // Whether headers have been parsed
	elapsedMs: number; // Milliseconds since start
}

// Error accumulation
type CsvRowErrorCode = "validation" | "grouping";
interface CsvRowError {
	row: number;
	column?: number;
	code: CsvRowErrorCode;
	message: string;
}
interface CsvParseResult<T> {
	data: T[];
	errors: CsvRowError[];
}

// Data types
type CsvRecord = Record<string, string>;
type NestedObject = { [key: string]: NestedValue };
type NestedValue = string | number | boolean | Date | null | NestedObject | NestedValue[];

// Options interfaces
interface CsvParserOptions {
	/* ... */
}
interface CsvStreamParserOptions extends CsvParserOptions {
	/* ... */
}
```

## 🎯 Best Practices

1. **Choose the Right Method:**

- Use `parseFileSync()` for small files in scripts
- Use `parseFile()` for web servers and async workflows
- Use `parseString()` for API responses and testing
- Use `parseStream()` when your source is a readable stream and buffering all content is acceptable
- Use `CsvStreamParser` for large/very large files or incremental processing; it groups continuation rows to match `CsvParser` continuation semantics

2. **Use Appropriate Validation Mode:**
   - Use `'ignore'` when you trust the data source
   - Use `'warn'` (default) during development
   - Use `'error'` for strict validation in production

3. **Enable Auto-Parsing When Appropriate:**

   ```typescript
   const result = CsvParser.parseFileSync("./data.csv", {
   	autoParseNumbers: true,
   	autoParseBooleans: true,
   });
   ```

4. **Handle Errors Gracefully:**

   ```typescript
   import { CsvParseError, CsvValidationError } from "@cerios/csv-nested-json";

   try {
   	const result = CsvParser.parseFileSync("./data.csv", {
   		validationMode: "error",
   	});
   } catch (error) {
   	if (error instanceof CsvValidationError) {
   		console.error(`Row ${error.row}: expected ${error.expectedColumns} columns`);
   	} else {
   		throw error;
   	}
   }
   ```

5. **Use Streaming for Large Files:**

   ```typescript
   // ✅ Good for very large files
   const parser = new CsvStreamParser({ autoParseNumbers: true });
   for await (const record of createReadStream("./huge.csv").pipe(parser)) {
   	await processRecord(record);
   }

   // ❌ May cause memory issues with large files
   const result = CsvParser.parseFileSync("./huge.csv");
   ```

6. **Validate Untrusted Files in One Pass:**

   ```typescript
   // ✅ Collect every bad row instead of throwing on the first
   const { data, errors } = CsvParser.parseFileSyncSafe("./upload.csv", {
   	validationMode: "error",
   });
   if (errors.length) reportToUser(errors);
   ```

7. **Specify Encoding for Non-UTF8 Files:**

   ```typescript
   const result = await CsvParser.parseFile("./data.csv", {
   	encoding: "latin1",
   });
   ```

8. **Use Consistent Column Headers:**
   - Ensure the first column is always the identifier for grouping
   - Use consistent dot notation for nested structures
   - Keep header names descriptive, or use `columnMapping` to rename them

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT © Ronald Veth - Cerios

## 🔗 Links

- [GitHub Repository](https://github.com/CeriosTesting/csv-nested-json)
- [Issue Tracker](https://github.com/CeriosTesting/csv-nested-json/issues)
- [NPM Package](https://www.npmjs.com/package/@cerios/csv-nested-json)
