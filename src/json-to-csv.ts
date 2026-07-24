import fs from "node:fs";

import type { CsvParserOptions, NestedObject, NestedValue } from "./types";

/**
 * Options for JSON to CSV conversion.
 */
export interface JsonToCsvOptions extends Pick<
	CsvParserOptions,
	"delimiter" | "quote" | "encoding" | "arrayMode" | "arraySuffixIndicator"
> {
	/**
	 * Line ending to use in output.
	 * @default '\n'
	 */
	lineEnding?: "\n" | "\r\n";

	/**
	 * Whether to include a header row.
	 * @default true
	 */
	includeHeader?: boolean;
}

/**
 * Converts nested JSON objects back to CSV format.
 * Supports the reverse operation of CsvParser, including:
 * - Nested objects converted to dot-notation headers
 * - Arrays output as continuation rows (default) or JSON-stringified
 *
 * @example
 * ```typescript
 * const data = [
 *   { id: '1', person: { name: 'John', city: 'NYC' } },
 *   { id: '2', person: { name: 'Jane', city: 'LA' } }
 * ];
 *
 * const csv = JsonToCsv.stringify(data);
 * // id,person.name,person.city
 * // 1,John,NYC
 * // 2,Jane,LA
 * ```
 *
 * @example
 * ```typescript
 * // With arrays as continuation rows
 * const data = [
 *   { id: '1', tags: ['js', 'ts', 'node'] }
 * ];
 *
 * const csv = JsonToCsv.stringify(data, { arrayMode: 'rows' });
 * // id,tags
 * // 1,js
 * // ,ts
 * // ,node
 * ```
 */
export class JsonToCsv {
	/**
	 * Convert array of nested objects to CSV string.
	 *
	 * @param data - Array of objects to convert
	 * @param options - Conversion options
	 * @returns CSV string
	 *
	 * @example
	 * ```typescript
	 * const csv = JsonToCsv.stringify([
	 *   { id: 1, name: 'Alice', address: { city: 'NYC' } }
	 * ]);
	 * // "id,name,address.city\n1,Alice,NYC"
	 * ```
	 */
	static stringify(data: NestedObject[], options: JsonToCsvOptions = {}): string {
		if (!data || data.length === 0) {
			return "";
		}

		const delimiter = options.delimiter || ",";
		const quote = options.quote || '"';
		const lineEnding = options.lineEnding || "\n";
		const includeHeader = options.includeHeader !== false;
		const arrayMode = options.arrayMode || "rows";

		// Only the continuation-row mode reconstructs arrays on re-parse, and that requires
		// the array suffix in the header so the parser forces those columns back into arrays.
		// In 'json' mode arrays live in a single cell, so no suffix is emitted.
		const arraySuffix = arrayMode === "rows" ? (options.arraySuffixIndicator ?? "[]") : "";

		// Collect all unique headers from all objects
		const headers = this.collectHeaders(data, arraySuffix);

		// Build CSV rows
		const rows: string[] = [];

		// Add header row
		if (includeHeader) {
			rows.push(headers.map(h => this.escapeValue(h, delimiter, quote)).join(delimiter));
		}

		// Add data rows
		for (const obj of data) {
			const flatRows = this.flattenObject(obj, headers, arrayMode, arraySuffix);
			for (const flatRow of flatRows) {
				const values = headers.map(header => {
					const value = flatRow[header];
					return this.escapeValue(value, delimiter, quote);
				});
				rows.push(values.join(delimiter));
			}
		}

		return rows.join(lineEnding);
	}

	/**
	 * Write nested objects to CSV file synchronously.
	 *
	 * @param filePath - Path to output file
	 * @param data - Array of objects to convert
	 * @param options - Conversion options
	 *
	 * @example
	 * ```typescript
	 * JsonToCsv.writeFileSync('output.csv', data, { delimiter: ';' });
	 * ```
	 */
	static writeFileSync(filePath: string, data: NestedObject[], options: JsonToCsvOptions = {}): void {
		const csv = this.stringify(data, options);
		const encoding = options.encoding || "utf-8";
		fs.writeFileSync(filePath, csv, encoding);
	}

	/**
	 * Write nested objects to CSV file asynchronously.
	 *
	 * @param filePath - Path to output file
	 * @param data - Array of objects to convert
	 * @param options - Conversion options
	 * @returns Promise that resolves when file is written
	 *
	 * @example
	 * ```typescript
	 * await JsonToCsv.writeFile('output.csv', data);
	 * ```
	 */
	static async writeFile(filePath: string, data: NestedObject[], options: JsonToCsvOptions = {}): Promise<void> {
		const csv = this.stringify(data, options);
		const encoding = options.encoding || "utf-8";
		await fs.promises.writeFile(filePath, csv, encoding);
	}

	/**
	 * Collect all unique headers from an array of nested objects.
	 * Headers are generated using dot-notation for nested properties.
	 */
	private static collectHeaders(data: NestedObject[], arraySuffix: string): string[] {
		const headerSet = new Set<string>();

		for (const obj of data) {
			this.collectHeadersFromObject(obj, "", headerSet, arraySuffix);
		}

		// Sort headers for consistent output: primary keys (no dots) first, then nested keys.
		// Precompute each header's depth once (via a decorate-sort-undecorate) so the comparator
		// does not re-split every header O(n log n) times.
		const decorated = Array.from(headerSet, header => ({ header, depth: this.countSegments(header) }));
		decorated.sort((a, b) => {
			if (a.depth !== b.depth) return a.depth - b.depth;
			return a.header.localeCompare(b.header);
		});

		return decorated.map(entry => entry.header);
	}

	/**
	 * Count dot-separated segments in a header (i.e. its nesting depth) without allocating
	 * an intermediate array via `split`.
	 */
	private static countSegments(header: string): number {
		let count = 1;
		for (let i = 0; i < header.length; i++) {
			if (header[i] === ".") count++;
		}
		return count;
	}

	/**
	 * Recursively collect headers from a nested object.
	 */
	private static collectHeadersFromObject(
		obj: NestedObject,
		prefix: string,
		headers: Set<string>,
		arraySuffix: string
	): void {
		for (const [key, value] of Object.entries(obj)) {
			const fullKey = prefix ? `${prefix}.${key}` : key;

			if (Array.isArray(value)) {
				// Mark the array-owning segment with the suffix so it re-parses as an array.
				const arrayKey = `${fullKey}${arraySuffix}`;

				if (value.length === 0) {
					// Empty array - still add the header
					headers.add(arrayKey);
					continue;
				}

				let hasObjectItems = false;
				for (const item of value) {
					if (item && typeof item === "object" && !Array.isArray(item)) {
						hasObjectItems = true;
						this.collectHeadersFromObject(item as NestedObject, arrayKey, headers, arraySuffix);
					}
				}

				if (!hasObjectItems) {
					// Array of primitives
					headers.add(arrayKey);
				}
			} else if (value && typeof value === "object" && !(value instanceof Date)) {
				// Nested object
				this.collectHeadersFromObject(value as NestedObject, fullKey, headers, arraySuffix);
			} else {
				// Primitive value (or Date, treated as a scalar)
				headers.add(fullKey);
			}
		}
	}

	/**
	 * Flatten a nested object into one or more rows of flat key-value pairs.
	 * Arrays result in multiple rows (continuation rows).
	 */
	private static flattenObject(
		obj: NestedObject,
		headers: string[],
		arrayMode: "rows" | "json",
		arraySuffix: string
	): Record<string, string>[] {
		// First, flatten the object to get all paths and values
		const flatValues: Record<string, NestedValue> = {};
		const arrayValues: Record<string, NestedValue[]> = {};

		this.flattenToPathValues(obj, "", flatValues, arrayValues, arraySuffix);

		// If no arrays or arrayMode is 'json', return single row
		if (Object.keys(arrayValues).length === 0 || arrayMode === "json") {
			const row: Record<string, string> = {};
			for (const header of headers) {
				if (header in flatValues) {
					row[header] = this.valueToString(flatValues[header]);
				} else if (header in arrayValues) {
					// JSON-stringify the array
					row[header] = JSON.stringify(arrayValues[header]);
				} else {
					row[header] = "";
				}
			}
			return [row];
		}

		// ArrayMode is 'rows' - generate continuation rows
		return this.generateContinuationRows(headers, flatValues, arrayValues, arraySuffix);
	}

	/**
	 * Flatten a nested object to path-value pairs, separating arrays.
	 */
	private static flattenToPathValues(
		obj: NestedObject,
		prefix: string,
		flatValues: Record<string, NestedValue>,
		arrayValues: Record<string, NestedValue[]>,
		arraySuffix: string
	): void {
		for (const [key, value] of Object.entries(obj)) {
			const fullKey = prefix ? `${prefix}.${key}` : key;

			if (Array.isArray(value)) {
				// Key array values by the suffixed path so they align with the emitted headers.
				arrayValues[`${fullKey}${arraySuffix}`] = value;
			} else if (value && typeof value === "object" && !(value instanceof Date)) {
				this.flattenToPathValues(value as NestedObject, fullKey, flatValues, arrayValues, arraySuffix);
			} else {
				// Primitive value (or Date, treated as a scalar)
				flatValues[fullKey] = value;
			}
		}
	}

	/**
	 * Generate continuation rows for arrays.
	 * First row contains all values, subsequent rows only contain array continuations.
	 */
	private static generateContinuationRows(
		headers: string[],
		flatValues: Record<string, NestedValue>,
		arrayValues: Record<string, NestedValue[]>,
		arraySuffix: string
	): Record<string, string>[] {
		const arrayPaths = Object.keys(arrayValues).sort((a, b) => b.length - a.length);

		// Determine the maximum array length
		let maxArrayLength = 1;
		for (const arr of Object.values(arrayValues)) {
			if (arr.length > maxArrayLength) {
				maxArrayLength = arr.length;
			}
		}

		// The owning array path for each header is invariant across rows, so resolve it once
		// instead of re-scanning arrayPaths for every header on every continuation row.
		const arrayPathByHeader = new Map<string, string | null>();
		for (const header of headers) {
			arrayPathByHeader.set(header, this.findArrayPathForHeader(header, arrayPaths));
		}

		const rows: Record<string, string>[] = [];

		for (let i = 0; i < maxArrayLength; i++) {
			const row: Record<string, string> = {};

			for (const header of headers) {
				const arrayPath = arrayPathByHeader.get(header) ?? null;

				if (arrayPath) {
					const arr = arrayValues[arrayPath];
					if (i < arr.length) {
						const item = arr[i];
						if (header === arrayPath) {
							row[header] = this.valueToString(item as NestedValue);
						} else if (item && typeof item === "object" && !Array.isArray(item)) {
							const relativePath = header.slice(arrayPath.length + 1);
							const nestedValue = this.getNestedValueAtPath(item as NestedObject, relativePath, arraySuffix);
							row[header] = nestedValue === undefined ? "" : this.valueToString(nestedValue);
						} else {
							row[header] = "";
						}
					} else {
						row[header] = "";
					}
				} else if (i === 0 && header in flatValues) {
					// Non-array values only appear in first row
					row[header] = this.valueToString(flatValues[header]);
				} else if (!(header in row)) {
					row[header] = "";
				}
			}

			rows.push(row);
		}

		return rows;
	}

	/**
	 * Resolve which array path (if any) owns a header.
	 */
	private static findArrayPathForHeader(header: string, arrayPaths: string[]): string | null {
		for (const path of arrayPaths) {
			if (header === path || header.startsWith(`${path}.`)) {
				return path;
			}
		}

		return null;
	}

	/**
	 * Read a nested value from an object using dot-notation.
	 */
	private static getNestedValueAtPath(obj: NestedObject, path: string, arraySuffix = ""): NestedValue | undefined {
		if (!path) return obj;

		const parts = path.split(".");
		let current: NestedValue = obj;

		for (const part of parts) {
			if (current === null || current === undefined) return undefined;
			if (typeof current !== "object" || Array.isArray(current) || current instanceof Date) {
				return undefined;
			}

			// Header segments carry the array suffix (e.g. `tags[]`) but object keys do not.
			const key = arraySuffix && part.endsWith(arraySuffix) ? part.slice(0, -arraySuffix.length) : part;
			current = (current as NestedObject)[key];
		}

		return current;
	}

	/**
	 * Convert a value to string for CSV output.
	 */
	private static valueToString(value: NestedValue): string {
		if (value === null || value === undefined) {
			return "";
		}
		if (value instanceof Date) {
			// Invalid dates stringify to "Invalid Date" via toISOString throwing; guard it.
			return Number.isNaN(value.getTime()) ? "" : value.toISOString();
		}
		if (typeof value === "object") {
			return JSON.stringify(value);
		}
		return String(value);
	}

	/**
	 * Escape a value for CSV output.
	 * Wraps in quotes if the value contains delimiter, quote, or newline.
	 */
	private static escapeValue(value: string | undefined | null, delimiter: string, quote: string): string {
		if (value === undefined || value === null) {
			return "";
		}

		const str = String(value);

		// Check if escaping is needed
		const needsEscape = str.includes(delimiter) || str.includes(quote) || str.includes("\n") || str.includes("\r");

		if (needsEscape) {
			// Escape quotes by doubling them. Use split/join so a regex-special quote
			// character (e.g. ".", "|", "*") is treated literally.
			const escaped = str.split(quote).join(quote + quote);
			return quote + escaped + quote;
		}

		return str;
	}
}
