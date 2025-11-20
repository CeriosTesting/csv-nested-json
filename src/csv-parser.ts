import { Readable } from "node:stream";
import { CsvFileReader } from "./csv-file-reader";
import { CsvReader } from "./csv-reader";
import { NestedJsonConverter } from "./nested-json-converter";
import type { CsvParserOptions } from "./types";

/**
 * High-level CSV to nested JSON parser
 * Combines file I/O, CSV parsing, and nested JSON conversion
 */
export abstract class CsvParser {
	/**
	 * Parse CSV file synchronously to nested JSON
	 * @param csvFilePath Path to CSV file
	 * @param options Parsing options
	 * @returns Array of nested JSON objects
	 */
	static parseFileSync(csvFilePath: string, options: CsvParserOptions = {}): any[] {
		const csvContent = CsvFileReader.readFileSync(csvFilePath, options);
		return this.parseString(csvContent, options);
	}

	/**
	 * Parse CSV file asynchronously to nested JSON
	 * @param csvFilePath Path to CSV file
	 * @param options Parsing options
	 * @returns Promise resolving to array of nested JSON objects
	 */
	static async parseFile(csvFilePath: string, options: CsvParserOptions = {}): Promise<any[]> {
		const csvContent = await CsvFileReader.readFile(csvFilePath, options);
		return this.parseString(csvContent, options);
	}

	/**
	 * Parse CSV string content to nested JSON
	 * @param csvContent CSV content as string
	 * @param options Parsing options
	 * @returns Array of nested JSON objects
	 */
	static parseString(csvContent: string, options: CsvParserOptions = {}): any[] {
		const records = CsvReader.parse(csvContent, options);
		return NestedJsonConverter.convert(records);
	}

	/**
	 * Parse CSV from readable stream to nested JSON
	 * @param stream Readable stream containing CSV data
	 * @param options Parsing options
	 * @returns Promise resolving to array of nested JSON objects
	 */
	static async parseStream(stream: Readable, options: CsvParserOptions = {}): Promise<any[]> {
		const csvContent = await CsvFileReader.readStream(stream, options);
		return this.parseString(csvContent, options);
	}
}
