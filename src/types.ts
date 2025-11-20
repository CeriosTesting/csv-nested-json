export type ValidationMode = "ignore" | "warn" | "error";

export interface CsvParserOptions {
	/**
	 * How to handle rows with more values than headers.
	 * - 'ignore': Silently ignore extra values
	 * - 'warn': Log a warning to console (default)
	 * - 'error': Throw an error
	 */
	validationMode?: ValidationMode;
	/**
	 * Field delimiter character (default: ',')
	 */
	delimiter?: string;
	/**
	 * Quote character for escaping fields (default: '"')
	 */
	quote?: string;
	/**
	 * File encoding when reading from file (default: 'utf-8')
	 */
	encoding?: BufferEncoding;
}
