import { CsvParseError } from "./errors";
import type { CsvParserOptions } from "./types";

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

/**
 * Whether a partially-accumulated field value consists solely of leading spaces (i.e. nothing but
 * space characters seen so far). Shared by the buffered and streaming quote-detection scanners so
 * that `trimLeadingSpace` opens a quoted field identically in both paths.
 */
export function isLeadingSpaceOnly(value: string): boolean {
	for (let i = 0; i < value.length; i++) {
		if (value[i] !== " ") return false;
	}
	return true;
}

/**
 * Warn about options that have no effect in the current configuration, so a silent no-op does not
 * mask a mistake. These are advisory only — never throw, so valid parses are never blocked.
 *
 * Currently detects `preserveUnsafeIntegersAsString` set without `autoParseNumbers` (the option only
 * governs how numeric parsing treats already-parsed integers, so it is inert on its own).
 */
export function warnInertOptions(options: CsvParserOptions): void {
	if (options.preserveUnsafeIntegersAsString && !options.autoParseNumbers) {
		console.warn(
			"Warning: preserveUnsafeIntegersAsString has no effect without autoParseNumbers; enable autoParseNumbers to preserve large integers as strings."
		);
	}
}
