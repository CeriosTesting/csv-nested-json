import { CsvParseError } from "./errors";

/**
 * Validate the resolved delimiter and quote characters.
 *
 * The single-pass scanners compare one character at a time, so multi-character delimiters or
 * quotes cannot be supported reliably. Reject them explicitly rather than silently misparsing.
 *
 * @throws {CsvParseError} If either is not exactly one character, or if they are equal.
 */
export function assertDelimiterAndQuote(delimiter: string, quote: string): void {
	if (delimiter.length !== 1) {
		throw new CsvParseError(
			`delimiter must be a single character, received '${delimiter}' (length ${delimiter.length}).`
		);
	}
	if (quote.length !== 1) {
		throw new CsvParseError(`quote must be a single character, received '${quote}' (length ${quote.length}).`);
	}
	if (delimiter === quote) {
		throw new CsvParseError(`delimiter and quote must be different characters (both are '${delimiter}').`);
	}
}
