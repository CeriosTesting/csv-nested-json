import type { CsvParserOptions } from "./types";

/**
 * Low-level CSV parsing utilities
 */
export class CsvReader {
	/**
	 * Parse CSV content into array of record objects
	 */
	static parse(content: string, options: CsvParserOptions = {}): any[] {
		if (!content || content.trim() === "") {
			return [];
		}

		const validationMode = options.validationMode || "warn";
		const delimiter = options.delimiter || ",";
		const quote = options.quote || '"';
		const lines = this.splitLines(content);

		if (lines.length === 0) return [];

		// Parse header
		const headers = this.parseLine(lines[0], delimiter, quote);
		if (headers.length === 0) return [];

		// Parse data rows
		const records: any[] = [];
		for (let i = 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line === "") continue; // Skip empty lines

			const values = this.parseLine(lines[i], delimiter, quote);

			// Validate column count
			if (values.length > headers.length && validationMode !== "ignore") {
				const lineNumber = i + 1;
				const message = `Row ${lineNumber} has ${values.length} values but only ${headers.length} columns defined. Extra values will be ignored.`;

				if (validationMode === "error") {
					throw new Error(message);
				}
				if (validationMode === "warn") {
					// biome-ignore lint/suspicious/noConsole: User explicitly requested warning mode
					console.warn(`Warning: ${message}`);
				}
			}

			const record: any = {};
			for (let j = 0; j < headers.length; j++) {
				const value = j < values.length ? values[j] : "";
				record[headers[j]] = value;
			}

			records.push(record);
		}

		return records;
	}

	/**
	 * Split CSV content into lines, respecting quoted fields with newlines
	 */
	static splitLines(content: string): string[] {
		const lines: string[] = [];
		let currentLine = "";
		let insideQuotes = false;

		for (let i = 0; i < content.length; i++) {
			const char = content[i];
			const nextChar = i + 1 < content.length ? content[i + 1] : "";

			if (char === '"') {
				insideQuotes = !insideQuotes;
				currentLine += char;
			} else if (char === "\r" && nextChar === "\n" && !insideQuotes) {
				// Windows line ending
				lines.push(currentLine);
				currentLine = "";
				i++; // Skip the \n
			} else if ((char === "\n" || char === "\r") && !insideQuotes) {
				// Unix/Mac line ending
				lines.push(currentLine);
				currentLine = "";
			} else {
				currentLine += char;
			}
		}

		// Don't forget the last line if it doesn't end with a newline
		if (currentLine) {
			lines.push(currentLine);
		}

		return lines;
	}

	/**
	 * Parse a single CSV line into values, respecting quotes and delimiters
	 */
	static parseLine(line: string, delimiter = ",", quote = '"'): string[] {
		const values: string[] = [];
		let currentValue = "";
		let insideQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const nextChar = i + 1 < line.length ? line[i + 1] : "";

			if (char === quote) {
				if (insideQuotes && nextChar === quote) {
					// Escaped quote
					currentValue += quote;
					i++; // Skip the next quote
				} else {
					// Toggle quote state
					insideQuotes = !insideQuotes;
				}
			} else if (char === delimiter && !insideQuotes) {
				// Field delimiter
				values.push(currentValue);
				currentValue = "";
			} else {
				currentValue += char;
			}
		}

		// Don't forget the last value
		values.push(currentValue);

		return values;
	}
}
