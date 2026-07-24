import type { NullRepresentation } from "./types";

/**
 * Shared value-parsing helpers used by both the buffered converter
 * ({@link NestedJsonConverter}) and the streaming parser ({@link CsvStreamParser}).
 *
 * Keeping these in one place ensures the two parsing paths cannot drift apart.
 *
 * @internal
 */

/**
 * Strict numeric pattern: optional sign, integer part, optional fraction, optional exponent.
 *
 * Deliberately excludes formats that `Number()` would otherwise accept but that are
 * rarely intended as data values in a CSV (hex `0x1F`, octal/binary literals,
 * whitespace-padded numbers, `Infinity`, etc.). This keeps identifier-like codes as strings.
 */
const STRICT_NUMERIC_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Integer pattern (used for unsafe-integer preservation). */
const INTEGER_PATTERN = /^-?\d+$/;

/**
 * Try to parse a string as a number.
 * Returns `null` if the string is not a value we consider a safe numeric literal.
 *
 * @param value - The raw cell value
 * @param preserveUnsafeIntegersAsString - When true, integers outside the JS safe-integer
 *   range are returned as their original string to avoid precision loss.
 */
export function tryParseNumber(value: string, preserveUnsafeIntegersAsString?: boolean): number | string | null {
	// Only parse strings that strictly look like a decimal number.
	if (!STRICT_NUMERIC_PATTERN.test(value)) return null;

	// Preserve leading-zero codes (e.g. "007", "00123") as strings.
	if (/^-?0\d/.test(value)) return null;

	const parsed = Number(value);

	if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
		if (preserveUnsafeIntegersAsString && INTEGER_PATTERN.test(value) && !Number.isSafeInteger(parsed)) {
			return value;
		}
		return parsed;
	}

	return null;
}

/**
 * Try to parse a string as a boolean.
 * Returns `null` if the string is not `'true'` or `'false'` (case-insensitive).
 */
export function tryParseBoolean(value: string): boolean | null {
	const lower = value.toLowerCase().trim();
	if (lower === "true") return true;
	if (lower === "false") return false;
	return null;
}

/**
 * Resolve the concrete value used to represent a detected null, based on the option.
 */
export function applyNullRepresentation(representation: NullRepresentation | undefined): null | undefined | string {
	switch (representation) {
		case "null":
			return null;
		case "undefined":
			return undefined;
		case "empty-string":
			return "";
		default:
			return undefined;
	}
}
