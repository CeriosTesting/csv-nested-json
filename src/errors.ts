/**
 * Base error class for CSV parsing errors.
 * Provides context about where the error occurred.
 *
 * @example
 * ```typescript
 * try {
 *   CsvParser.parseString(csvContent);
 * } catch (error) {
 *   if (error instanceof CsvParseError) {
 *     console.log(`Error at row ${error.row}: ${error.message}`);
 *   }
 * }
 * ```
 */
export class CsvParseError extends Error {
	/**
	 * Creates a new CSV parse error
	 * @param message - Human-readable error description
	 * @param row - The 1-based row number where the error occurred (optional)
	 * @param column - The 1-based column number where the error occurred (optional)
	 */
	constructor(
		message: string,
		public readonly row?: number,
		public readonly column?: number
	) {
		super(message);
		this.name = "CsvParseError";
		// Maintains proper stack trace for where our error was thrown (only in V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CsvParseError);
		}
	}
}

/**
 * Error thrown when a CSV file cannot be found at the specified path.
 *
 * @example
 * ```typescript
 * try {
 *   CsvParser.parseFileSync('/path/to/missing.csv');
 * } catch (error) {
 *   if (error instanceof CsvFileNotFoundError) {
 *     console.log(`File not found: ${error.filePath}`);
 *   }
 * }
 * ```
 */
export class CsvFileNotFoundError extends CsvParseError {
	/**
	 * Creates a new file not found error
	 * @param filePath - The path to the file that was not found
	 */
	constructor(public readonly filePath: string) {
		super(`CSV file not found: ${filePath}`);
		this.name = "CsvFileNotFoundError";
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CsvFileNotFoundError);
		}
	}
}

/**
 * Error thrown when CSV data fails validation rules.
 * Contains details about the expected vs actual column counts.
 *
 * @example
 * ```typescript
 * try {
 *   CsvParser.parseString(csvContent, { validationMode: 'error' });
 * } catch (error) {
 *   if (error instanceof CsvValidationError) {
 *     console.log(`Row ${error.row}: expected ${error.expectedColumns} columns, got ${error.actualColumns}`);
 *   }
 * }
 * ```
 */
export class CsvValidationError extends CsvParseError {
	/**
	 * Creates a new validation error
	 * @param message - Human-readable error description
	 * @param row - The 1-based row number where validation failed
	 * @param expectedColumns - The expected number of columns (from header)
	 * @param actualColumns - The actual number of columns found in the row
	 */
	constructor(
		message: string,
		row: number,
		public readonly expectedColumns: number,
		public readonly actualColumns: number
	) {
		super(message, row);
		this.name = "CsvValidationError";
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CsvValidationError);
		}
	}
}

/**
 * Error thrown when there are encoding or BOM-related issues.
 *
 * @example
 * ```typescript
 * try {
 *   CsvParser.parseFileSync('file.csv', { encoding: 'utf-16' });
 * } catch (error) {
 *   if (error instanceof CsvEncodingError) {
 *     console.log(`Encoding error: ${error.message}`);
 *   }
 * }
 * ```
 */
export class CsvEncodingError extends CsvParseError {
	/**
	 * Creates a new encoding error
	 * @param message - Human-readable error description
	 * @param encoding - The encoding that was being used
	 */
	constructor(
		message: string,
		public readonly encoding?: string
	) {
		super(message);
		this.name = "CsvEncodingError";
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CsvEncodingError);
		}
	}
}

/**
 * Error thrown when duplicate headers are detected and the strategy is 'error'.
 * Contains the list of duplicate header names and the row number where they were found.
 *
 * @example
 * ```typescript
 * try {
 *   CsvParser.parseString('id,name,id\n1,Alice,2');
 * } catch (error) {
 *   if (error instanceof CsvDuplicateHeaderError) {
 *     console.log(`Duplicate headers: ${error.duplicateHeaders.join(', ')}`);
 *     // Output: "Duplicate headers: id"
 *   }
 * }
 * ```
 */
export class CsvDuplicateHeaderError extends CsvParseError {
	/**
	 * Creates a new duplicate header error
	 * @param duplicateHeaders - Array of header names that appear more than once
	 * @param headerRow - The 1-based row number where the headers are located
	 */
	constructor(
		public readonly duplicateHeaders: string[],
		public readonly headerRow: number = 1
	) {
		super(`Duplicate headers found at row ${headerRow}: ${duplicateHeaders.join(", ")}`, headerRow);
		this.name = "CsvDuplicateHeaderError";
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CsvDuplicateHeaderError);
		}
	}
}
