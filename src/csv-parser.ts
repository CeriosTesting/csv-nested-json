import { Readable } from "node:stream";

import { CsvFileReader } from "./csv-file-reader";
import { CsvReader } from "./csv-reader";
import { NestedJsonConverter } from "./nested-json-converter";
import { warnInertOptions } from "./option-validation";
import type { CsvParserOptions, NestedObject } from "./types";

/**
 * High-level CSV to nested JSON parser.
 * Combines file I/O, CSV parsing, and nested JSON conversion into a single API.
 *
 * The parser supports:
 * - Dot-notation headers for nested objects (`person.address.city`)
 * - Array fields via the `[]` header suffix (`tags[]`); arrays are never created implicitly
 * - Continuation rows (rows with empty first column extend previous record, filling `[]` arrays)
 * - Value transformation (auto-parse numbers, booleans, custom transformers)
 * - BOM stripping and row skipping
 *
 * @example
 * ```typescript
 * // Parse from file
 * const result = CsvParser.parseFileSync('data.csv');
 *
 * // Parse from string with options
 * const result = CsvParser.parseString(csvContent, {
 *   autoParseNumbers: true,
 *   autoParseBooleans: true,
 *   skipRows: 1
 * });
 *
 * // Parse with custom value transformer
 * const result = CsvParser.parseString(csv, {
 *   valueTransformer: (value, header) => {
 *     if (header === 'date') return new Date(value as string);
 *     return value;
 *   }
 * });
 * ```
 */
export abstract class CsvParser {
	/**
	 * Parse CSV file synchronously to nested JSON.
	 *
	 * @typeParam T - The expected type of each record in the result array
	 * @param csvFilePath - Path to the CSV file
	 * @param options - Parsing options
	 * @returns Array of nested JSON objects
	 * @throws {CsvFileNotFoundError} If the file does not exist
	 * @throws {CsvValidationError} If validationMode is 'error' and validation fails
	 *
	 * @example
	 * ```typescript
	 * interface Person {
	 *   id: string;
	 *   name: string;
	 *   address: { city: string };
	 * }
	 *
	 * const people = CsvParser.parseFileSync<Person>('people.csv');
	 * console.log(people[0].address.city);
	 * ```
	 */
	static parseFileSync<T = NestedObject>(csvFilePath: string, options: CsvParserOptions = {}): T[] {
		const csvContent = CsvFileReader.readFileSync(csvFilePath, options);
		return this.parseString<T>(csvContent, options);
	}

	/**
	 * Parse CSV file asynchronously to nested JSON.
	 *
	 * @typeParam T - The expected type of each record in the result array
	 * @param csvFilePath - Path to the CSV file
	 * @param options - Parsing options
	 * @returns Promise resolving to array of nested JSON objects
	 * @throws {CsvFileNotFoundError} If the file does not exist
	 * @throws {CsvValidationError} If validationMode is 'error' and validation fails
	 *
	 * @example
	 * ```typescript
	 * const people = await CsvParser.parseFile<Person>('people.csv');
	 * ```
	 */
	static async parseFile<T = NestedObject>(csvFilePath: string, options: CsvParserOptions = {}): Promise<T[]> {
		const csvContent = await CsvFileReader.readFile(csvFilePath, options);
		return this.parseString<T>(csvContent, options);
	}

	/**
	 * Parse CSV from readable stream to nested JSON.
	 * Note: This method buffers the entire stream before parsing.
	 * For true streaming with large files, use {@link CsvStreamParser}.
	 *
	 * @typeParam T - The expected type of each record in the result array
	 * @param stream - Readable stream containing CSV data
	 * @param options - Parsing options
	 * @returns Promise resolving to array of nested JSON objects
	 * @throws {CsvValidationError} If validationMode is 'error' and validation fails
	 *
	 * @example
	 * ```typescript
	 * const stream = fs.createReadStream('large-file.csv');
	 * const result = await CsvParser.parseStream(stream);
	 * ```
	 */
	static async parseStream<T = NestedObject>(stream: Readable, options: CsvParserOptions = {}): Promise<T[]> {
		const csvContent = await CsvFileReader.readStream(stream, options);
		return this.parseString<T>(csvContent, options);
	}

	/**
	 * Parse CSV string content to nested JSON.
	 *
	 * @typeParam T - The expected type of each record in the result array
	 * @param csvContent - CSV content as string
	 * @param options - Parsing options
	 * @returns Array of nested JSON objects
	 * @throws {CsvValidationError} If validationMode is 'error' and validation fails
	 *
	 * @example
	 * ```typescript
	 * const csv = `id,name,address.city
	 * 1,John,NYC
	 * 2,Jane,LA`;
	 *
	 * const result = CsvParser.parseString(csv);
	 * // [
	 * //   { id: '1', name: 'John', address: { city: 'NYC' } },
	 * //   { id: '2', name: 'Jane', address: { city: 'LA' } }
	 * // ]
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // With continuation rows for arrays (the `[]` suffix is required)
	 * const csv = `id,tags[]
	 * 1,javascript
	 * ,typescript
	 * ,nodejs`;
	 *
	 * const result = CsvParser.parseString(csv);
	 * // [{ id: '1', tags: ['javascript', 'typescript', 'nodejs'] }]
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // With auto-parsing
	 * const csv = `id,active,score
	 * 1,true,95.5`;
	 *
	 * const result = CsvParser.parseString(csv, {
	 *   autoParseNumbers: true,
	 *   autoParseBooleans: true
	 * });
	 * // [{ id: 1, active: true, score: 95.5 }]
	 * ```
	 */
	static parseString<T = NestedObject>(csvContent: string, options: CsvParserOptions = {}): T[] {
		warnInertOptions(options);
		const records = CsvReader.parseWithQuotedEmptyProvenance(csvContent, options);
		return NestedJsonConverter.convert(records, options) as T[];
	}
}
