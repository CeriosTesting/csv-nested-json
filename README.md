# @cerios/csv-nested-json

A powerful TypeScript CSV parser that transforms flat CSV data into nested JSON objects with support for dot notation, automatic array detection, and complex hierarchical structures.

## 🚀 Features

- **Zero Dependencies** - No external CSV parsing libraries
- **Nested Objects** - Use dot notation in headers (e.g., `address.city`)
- **Automatic Array Detection** - Smart array creation for grouped rows
- **Multi-Level Nesting** - Support for deeply nested structures
- **Multiple Input Methods** - Parse from files (sync/async), strings, or streams
- **RFC 4180 Compliant** - Handles quoted fields, escaped quotes, and various line endings
- **Flexible Delimiters** - Support for comma, semicolon, tab, pipe, and custom delimiters
- **Custom Encodings** - Handle different file encodings (UTF-8, Latin1, etc.)
- **TypeScript & JavaScript** - Full type definitions included
- **CommonJS & ESM** - Works in both module systems
- **Validation Modes** - Flexible error handling for malformed data

## 📦 Installation

```bash
npm install @cerios/csv-nested-json
```

## 🎯 Quick Start

```typescript
import { CsvParser } from '@cerios/csv-nested-json';

// Parse CSV file
const result = CsvParser.parseFileSync('data.csv');
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

| Method | Description |
|--------|-------------|
| `parseFileSync()` | Parse CSV file synchronously |
| `parseFile()` | Parse CSV file asynchronously |
| `parseString()` | Parse CSV string content |
| `parseStream()` | Parse CSV from readable stream |

## 🔧 Basic Usage

### 1. Parse File (Synchronous)

```typescript
import { CsvParser } from '@cerios/csv-nested-json';

const result = CsvParser.parseFileSync('./data.csv');
```

**When to use:** Small to medium files (<10MB), synchronous workflows, simple scripts.

### 2. Parse File (Asynchronous)

```typescript
import { CsvParser } from '@cerios/csv-nested-json';

const result = await CsvParser.parseFile('./data.csv');
```

**When to use:** Medium to large files, async/await workflows, web servers, non-blocking operations.

### 3. Parse String

```typescript
import { CsvParser } from '@cerios/csv-nested-json';

const csvString = `id,name,age
1,Alice,30
2,Bob,25`;

const result = CsvParser.parseString(csvString);
```

**When to use:** API responses, in-memory CSV data, testing, dynamic CSV generation.

### 4. Parse Stream

```typescript
import { CsvParser } from '@cerios/csv-nested-json';
import { createReadStream } from 'node:fs';

const stream = createReadStream('./large-file.csv');
const result = await CsvParser.parseStream(stream);
```

**When to use:** Very large files (>100MB), memory-constrained environments, real-time processing.

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
const result = CsvParser.parseFileSync('./nested-data.csv');
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

Rows without a value in the first column are treated as continuation rows and automatically create arrays:

**Input CSV:**
```csv
id,name,phones.type,phones.number
1,Alice,mobile,555-0001
,,home,555-0002
,,work,555-0003
```

**Code:**
```typescript
const result = CsvParser.parseFileSync('./grouped-data.csv');
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

### Complex Multi-Group Example

**Input CSV:**
```csv
id,username,profile.firstName,profile.lastName,addresses.type,addresses.city
1,johndoe,John,Doe,home,New York
,,,,work,Boston
2,janedoe,Jane,Doe,home,Chicago
```

**Code:**
```typescript
const result = CsvParser.parseFileSync('./complex-data.csv');
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
    "addresses": {
      "type": "home",
      "city": "Chicago"
    }
  }
]
```

**Note:** The first record has an array of addresses (multiple entries), while the second has a single address object.

### Custom Delimiters

**Semicolon-separated values:**
```typescript
const csvSemicolon = `id;name;city
1;Alice;NYC
2;Bob;LA`;

const result = CsvParser.parseString(csvSemicolon, {
  delimiter: ';'
});
```

**Tab-separated values:**
```typescript
const csvTab = `id\tname\tcity
1\tAlice\tNYC`;

const result = CsvParser.parseString(csvTab, {
  delimiter: '\t'
});
```

**Pipe-separated values:**
```typescript
const csvPipe = `id|name|city
1|Alice|NYC`;

const result = CsvParser.parseString(csvPipe, {
  delimiter: '|'
});
```

### Custom Quote Character

```typescript
const csvSingleQuote = `id,name,message
1,Alice,'Hello, World'
2,Bob,'It''s working'`;

const result = CsvParser.parseString(csvSingleQuote, {
  quote: "'"
});
```

### Custom Encoding

```typescript
// Latin1 encoding
const result = await CsvParser.parseFile('./data-latin1.csv', {
  encoding: 'latin1'
});

// UTF-16LE encoding
const result2 = await CsvParser.parseFile('./data-utf16.csv', {
  encoding: 'utf16le'
});
```

### Validation Modes

```typescript
// Ignore extra columns silently
const result1 = CsvParser.parseString(csvData, {
  validationMode: 'ignore'
});

// Warn about extra columns (default)
const result2 = CsvParser.parseString(csvData, {
  validationMode: 'warn'
});

// Throw error on extra columns
try {
  const result3 = CsvParser.parseString(csvData, {
    validationMode: 'error'
  });
} catch (error) {
  console.error('Validation error:', error.message);
}
```

### Parse CSV from API Response

```typescript
async function parseApiCsv() {
  const response = await fetch('https://api.example.com/data.csv');
  const csvString = await response.text();

  const data = CsvParser.parseString(csvString, {
    validationMode: 'ignore'
  });

  return data;
}
```

### Parse Large File with Streams

```typescript
import { createReadStream } from 'node:fs';

async function parseLargeFile(filePath: string) {
  const stream = createReadStream(filePath, {
    highWaterMark: 64 * 1024 // 64KB chunks
  });

  const data = await CsvParser.parseStream(stream, {
    validationMode: 'warn',
    encoding: 'utf-8'
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
  delimiter: ';',
  validationMode: 'error'
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
const files = ['data1.csv', 'data2.csv', 'data3.csv'];

const results = await Promise.all(
  files.map(file => CsvParser.parseFile(file))
);
```

## 🧪 Options Reference

### CsvParserOptions

```typescript
interface CsvParserOptions {
  // Validation
  validationMode?: 'ignore' | 'warn' | 'error';  // Default: 'warn'

  // Parsing
  delimiter?: string;                             // Default: ','
  quote?: string;                                 // Default: '"'

  // File I/O
  encoding?: BufferEncoding;                      // Default: 'utf-8'
}
```

### Option Details

#### `validationMode`

Controls how the parser handles rows with more values than headers:
- `'ignore'`: Silently ignore extra values
- `'warn'` (default): Log a warning to console
- `'error'`: Throw an error

**Example:**
```typescript
const result = CsvParser.parseFile('data.csv', {
  validationMode: 'error'
});
```

#### `delimiter`

Field delimiter character. Common values:
- `','` (default) - Comma-separated values
- `';'` - Semicolon-separated values (common in Europe)
- `'\t'` - Tab-separated values
- `'|'` - Pipe-separated values
- Any custom single character

**Example:**
```typescript
const result = CsvParser.parseString(csvData, {
  delimiter: ';'
});
```

#### `quote`

Quote character for escaping fields containing delimiters or newlines:
- `'"'` (default) - Double quotes
- `"'"` - Single quotes
- Any custom single character

**Example:**
```typescript
const result = CsvParser.parseString(csvData, {
  quote: "'"
});
```

#### `encoding`

File encoding when reading from files or streams. Supported encodings:
- `'utf-8'` (default)
- `'utf-16le'`
- `'latin1'`
- `'ascii'`
- And all other Node.js supported encodings

**Example:**
```typescript
const result = await CsvParser.parseFile('data.csv', {
  encoding: 'latin1'
});
```

### Complete Example with All Options

```typescript
const result = await CsvParser.parseFile('./data.csv', {
  validationMode: 'error',   // Strict validation
  delimiter: ',',            // Comma-separated
  quote: '"',                // Double quotes for escaping
  encoding: 'utf-8'          // UTF-8 encoding
});
```

## 📚 API Reference

### CsvParser Class

#### `parseFileSync(filePath: string, options?: CsvParserOptions): any[]`

Parses a CSV file synchronously and returns an array of nested JSON objects.

**Parameters:**
- `filePath` (string): Path to the CSV file
- `options` (CsvParserOptions, optional): Configuration options

**Returns:**
- `any[]`: Array of parsed objects with nested structures

**Throws:**
- Error if the file does not exist
- Error if `validationMode` is `'error'` and a row has validation issues

**Example:**
```typescript
const result = CsvParser.parseFileSync('./data.csv', {
  validationMode: 'warn',
  delimiter: ','
});
```

#### `parseFile(filePath: string, options?: CsvParserOptions): Promise<any[]>`

Parses a CSV file asynchronously and returns a promise that resolves to an array of nested JSON objects.

**Parameters:**
- `filePath` (string): Path to the CSV file
- `options` (CsvParserOptions, optional): Configuration options

**Returns:**
- `Promise<any[]>`: Promise resolving to array of parsed objects

**Throws:**
- Error if the file does not exist
- Error if `validationMode` is `'error'` and a row has validation issues

**Example:**
```typescript
const result = await CsvParser.parseFile('./data.csv', {
  encoding: 'utf-8'
});
```

#### `parseString(csvContent: string, options?: CsvParserOptions): any[]`

Parses CSV string content and returns an array of nested JSON objects.

**Parameters:**
- `csvContent` (string): CSV content as string
- `options` (CsvParserOptions, optional): Configuration options

**Returns:**
- `any[]`: Array of parsed objects with nested structures

**Throws:**
- Error if `validationMode` is `'error'` and a row has validation issues

**Example:**
```typescript
const csvString = `id,name
1,Alice
2,Bob`;

const result = CsvParser.parseString(csvString);
```

#### `parseStream(stream: Readable, options?: CsvParserOptions): Promise<any[]>`

Parses CSV from a readable stream and returns a promise that resolves to an array of nested JSON objects.

**Parameters:**
- `stream` (Readable): Node.js readable stream containing CSV data
- `options` (CsvParserOptions, optional): Configuration options

**Returns:**
- `Promise<any[]>`: Promise resolving to array of parsed objects

**Throws:**
- Error if stream reading fails
- Error if `validationMode` is `'error'` and a row has validation issues

**Example:**
```typescript
import { createReadStream } from 'node:fs';

const stream = createReadStream('./data.csv');
const result = await CsvParser.parseStream(stream, {
  validationMode: 'ignore'
});
```

## 💡 How It Works

### 1. Row Grouping

Records are grouped by the first column (identifier). When the first column is empty, the row is treated as a continuation of the previous group:

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

### 3. Automatic Array Detection

When the same key path appears multiple times within a group, an array is automatically created:

```csv
id,contact.type,contact.value
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

| Method | Best For | File Size | Blocking |
|--------|----------|-----------|----------|
| `parseFileSync()` | Scripts, small files | <10MB | Yes |
| `parseFile()` | Web servers, medium files | 10MB-100MB | No |
| `parseString()` | API responses, testing | Any (in-memory) | Yes |
| `parseStream()` | Large files, memory efficiency | >100MB | No |

### Traditional CSV Parsing

```javascript
// ❌ Manual parsing - tedious and error-prone
const fs = require('fs');
const data = fs.readFileSync('data.csv', 'utf-8');
const lines = data.split('\n');
const headers = lines[0].split(',');
const result = [];

for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(',');
  const obj = {};

  for (let j = 0; j < headers.length; j++) {
    const keys = headers[j].split('.');
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
const result = CsvParser.parseFileSync('data.csv');

// ✅ Automatic nested object creation
// ✅ Automatic array detection
// ✅ RFC 4180 compliant parsing
// ✅ Flexible configuration options
```

## 📋 CSV Format Support

The library is fully RFC 4180 compliant and supports:

- ✅ **Quoted Fields with Commas:** `"value, with, commas"`
- ✅ **Quoted Fields with Newlines:** Multi-line values within quotes
- ✅ **Escaped Quotes:** `"He said ""Hello"""` → `He said "Hello"`
- ✅ **Various Line Endings:** Windows (CRLF), Unix (LF), Mac (CR)
- ✅ **Empty Lines:** Automatically skipped
- ✅ **Flexible Column Counts:** Continuation rows can have different column counts
- ✅ **Custom Delimiters:** Comma, semicolon, tab, pipe, or any character
- ✅ **Custom Quote Characters:** Double quotes, single quotes, or any character
- ✅ **Multiple Encodings:** UTF-8, Latin1, UTF-16, and more

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
import { CsvParser, CsvParserOptions, ValidationMode } from '@cerios/csv-nested-json';

const options: CsvParserOptions = {
  validationMode: 'warn',
  delimiter: ',',
  quote: '"',
  encoding: 'utf-8'
};

const result: any[] = CsvParser.parseFileSync('./data.csv', options);
```

### Type Definitions

```typescript
type ValidationMode = 'ignore' | 'warn' | 'error';

interface CsvParserOptions {
  validationMode?: ValidationMode;
  delimiter?: string;
  quote?: string;
  encoding?: BufferEncoding;
}

abstract class CsvParser {
  static parseFileSync(filePath: string, options?: CsvParserOptions): any[];
  static parseFile(filePath: string, options?: CsvParserOptions): Promise<any[]>;
  static parseString(csvContent: string, options?: CsvParserOptions): any[];
  static parseStream(stream: Readable, options?: CsvParserOptions): Promise<any[]>;
}
```

## 🎯 Best Practices

1. **Choose the Right Method:**
   - Use `parseFileSync()` for small files in scripts
   - Use `parseFile()` for web servers and async workflows
   - Use `parseString()` for API responses and testing
   - Use `parseStream()` for very large files

2. **Use Appropriate Validation Mode:**
   - Use `'ignore'` when you trust the data source
   - Use `'warn'` (default) during development
   - Use `'error'` for strict validation in production

3. **Handle Errors Gracefully:**
   ```typescript
   try {
     const result = CsvParser.parseFileSync('./data.csv', {
       validationMode: 'error'
     });
   } catch (error) {
     console.error('Failed to parse CSV:', error.message);
   }
   ```

4. **Use Streams for Large Files:**
   ```typescript
   // ✅ Good for large files
   const stream = createReadStream('./large.csv');
   const result = await CsvParser.parseStream(stream);

   // ❌ May cause memory issues
   const result = CsvParser.parseFileSync('./large.csv');
   ```

5. **Specify Encoding for Non-UTF8 Files:**
   ```typescript
   const result = await CsvParser.parseFile('./data.csv', {
     encoding: 'latin1'
   });
   ```

6. **Use Consistent Column Headers:**
   - Ensure the first column is always the identifier for grouping
   - Use consistent dot notation for nested structures
   - Keep header names descriptive and lowercase

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT © Ronald Veth - Cerios

## 🔗 Links

- [GitHub Repository](https://github.com/CeriosTesting/csv-nested-json)
- [Issue Tracker](https://github.com/CeriosTesting/csv-nested-json/issues)
- [NPM Package](https://www.npmjs.com/package/@cerios/csv-nested-json)
