import fs from "node:fs";
import { Readable } from "node:stream";
import type { CsvParserOptions } from "./types";

/**
 * File and stream I/O operations for CSV parsing
 */
export class CsvFileReader {
	/**
	 * Read CSV file synchronously
	 */
	static readFileSync(filePath: string, options: CsvParserOptions = {}): string {
		if (!fs.existsSync(filePath)) {
			throw new Error(`CSV file ${filePath} not found.`);
		}

		const encoding = options.encoding || "utf-8";
		return fs.readFileSync(filePath, encoding);
	}

	/**
	 * Read CSV file asynchronously
	 */
	static async readFile(filePath: string, options: CsvParserOptions = {}): Promise<string> {
		if (!fs.existsSync(filePath)) {
			throw new Error(`CSV file ${filePath} not found.`);
		}

		const encoding = options.encoding || "utf-8";
		return await fs.promises.readFile(filePath, encoding);
	}

	/**
	 * Read CSV from readable stream
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
