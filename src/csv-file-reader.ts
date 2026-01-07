import fs from "node:fs";
import { Readable } from "node:stream";
import { CsvFileNotFoundError } from "./errors";
import type { CsvParserOptions } from "./types";

/**
 * File and stream I/O operations for CSV parsing.
 * Handles reading CSV content from files and streams with configurable encoding.
 *
 * @example
 * ```typescript
 * // Read file synchronously
 * const content = CsvFileReader.readFileSync('data.csv');
 *
 * // Read file asynchronously
 * const content = await CsvFileReader.readFile('data.csv');
 *
 * // Read from stream
 * const stream = fs.createReadStream('data.csv');
 * const content = await CsvFileReader.readStream(stream);
 * ```
 */
export class CsvFileReader {
	/**
	 * Read CSV file synchronously.
	 *
	 * @param filePath - Path to the CSV file
	 * @param options - Parser options (uses `encoding` option)
	 * @returns The file content as a string
	 * @throws {CsvFileNotFoundError} If the file does not exist
	 *
	 * @example
	 * ```typescript
	 * const content = CsvFileReader.readFileSync('data.csv', { encoding: 'utf-8' });
	 * ```
	 */
	static readFileSync(filePath: string, options: CsvParserOptions = {}): string {
		if (!fs.existsSync(filePath)) {
			throw new CsvFileNotFoundError(filePath);
		}

		const encoding = options.encoding || "utf-8";
		return fs.readFileSync(filePath, encoding);
	}

	/**
	 * Read CSV file asynchronously.
	 *
	 * @param filePath - Path to the CSV file
	 * @param options - Parser options (uses `encoding` option)
	 * @returns Promise resolving to the file content as a string
	 * @throws {CsvFileNotFoundError} If the file does not exist
	 *
	 * @example
	 * ```typescript
	 * const content = await CsvFileReader.readFile('data.csv', { encoding: 'utf-16le' });
	 * ```
	 */
	static async readFile(filePath: string, options: CsvParserOptions = {}): Promise<string> {
		if (!fs.existsSync(filePath)) {
			throw new CsvFileNotFoundError(filePath);
		}

		const encoding = options.encoding || "utf-8";
		return await fs.promises.readFile(filePath, encoding);
	}

	/**
	 * Read CSV from a readable stream.
	 *
	 * @param stream - Readable stream containing CSV data
	 * @param options - Parser options (uses `encoding` option)
	 * @returns Promise resolving to the stream content as a string
	 *
	 * @example
	 * ```typescript
	 * const stream = fs.createReadStream('large-file.csv');
	 * const content = await CsvFileReader.readStream(stream);
	 * ```
	 */
	static async readStream(stream: Readable, options: CsvParserOptions = {}): Promise<string> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];

			stream.on("data", (chunk: Buffer | string) => {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			});

			stream.on("end", () => {
				try {
					const content = Buffer.concat(chunks).toString(options.encoding || "utf-8");
					resolve(content);
				} catch (error) {
					reject(error);
				}
			});

			stream.on("error", (error: Error) => {
				reject(error);
			});
		});
	}
}
