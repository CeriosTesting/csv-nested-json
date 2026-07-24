import { type InternalCsvRecord, isQuotedEmptyCell, type QUOTED_EMPTY_CELL } from "./internal-empty-cell";
import type { CsvParserOptions, NestedObject, NestedValue } from "./types";
import { applyNullRepresentation, tryParseBoolean, tryParseNumber } from "./value-parsers";

/**
 * Shared record-level transformation logic used by both the buffered converter
 * ({@link NestedJsonConverter}) and the streaming parser ({@link CsvStreamParser}).
 *
 * Keeping the value-transformation pipeline and the unflatten step in one place ensures the two
 * parsing paths cannot drift apart (they previously held near-identical private copies).
 *
 * @internal
 */

export type TransformedRecordValue = string | number | boolean | Date | null | undefined | typeof QUOTED_EMPTY_CELL;
export type TransformedRecord = Record<string, TransformedRecordValue>;

/** The built-in null tokens used when `nullValues` is not supplied. */
const DEFAULT_NULL_VALUES = ["null", "NULL", "nil", "NIL"];

/**
 * Build the lower-cased set of tokens treated as null. Both parsing paths derive this identically.
 */
export function resolveNullSet(options: CsvParserOptions): Set<string> {
	return new Set((options.nullValues ?? DEFAULT_NULL_VALUES).map(v => v.toLowerCase()));
}

/**
 * Whether any value transformation is configured. When false, records can be passed through as-is.
 */
export function needsValueTransformation(options: CsvParserOptions): boolean {
	return Boolean(
		options.autoParseNumbers ||
		options.autoParseBooleans ||
		options.valueTransformer ||
		options.nullValues !== undefined
	);
}

/**
 * Apply value transformations to a single record.
 * Transformation order: nullValues → autoParseNumbers → autoParseBooleans → valueTransformer.
 *
 * Callers should guard with {@link needsValueTransformation} and skip this entirely when no
 * transformation is configured.
 */
export function transformRecordValues(
	record: InternalCsvRecord,
	options: CsvParserOptions,
	nullSet: Set<string>
): TransformedRecord {
	const {
		autoParseNumbers,
		preserveUnsafeIntegersAsString,
		autoParseBooleans,
		valueTransformer,
		nullValues,
		nullRepresentation,
	} = options;

	const transformed: TransformedRecord = {};

	for (const [header, value] of Object.entries(record)) {
		let transformedValue: TransformedRecordValue = value;

		if (isQuotedEmptyCell(value)) {
			if (nullValues !== undefined && nullSet.has("")) {
				transformedValue = applyNullRepresentation(nullRepresentation);
				if (nullRepresentation === "omit") {
					continue;
				}
			}

			transformed[header] = transformedValue;
			continue;
		}

		// Skip empty values (unless they match nullValues)
		if (value === "") {
			if (nullValues !== undefined && nullSet.has("")) {
				transformedValue = applyNullRepresentation(nullRepresentation);
				if (nullRepresentation === "omit") {
					continue;
				}
			}
			transformed[header] = transformedValue;
			continue;
		}

		// Step 0: Check for null values (before number/boolean parsing)
		if (nullValues !== undefined && nullSet.has(value.toLowerCase())) {
			const nullVal = applyNullRepresentation(nullRepresentation);
			if (nullRepresentation === "omit") {
				continue;
			}
			transformed[header] = nullVal;
			continue;
		}

		// Step 1: Auto-parse numbers
		if (autoParseNumbers) {
			const parsed = tryParseNumber(value, preserveUnsafeIntegersAsString);
			if (parsed !== null) {
				transformedValue = parsed;
			}
		}

		// Step 2: Auto-parse booleans (only if still a string)
		if (autoParseBooleans && typeof transformedValue === "string") {
			const parsed = tryParseBoolean(value);
			if (parsed !== null) {
				transformedValue = parsed;
			}
		}

		// Step 3: Apply custom transformer
		if (valueTransformer) {
			transformedValue = valueTransformer(transformedValue as string | number | boolean, header) as
				| string
				| number
				| boolean
				| Date;
		}

		transformed[header] = transformedValue;
	}

	return transformed;
}

/**
 * Unflatten a record with dot-notation keys into a nested object, stripping the array suffix from
 * each path segment. Empty-cell handling honors `preserveEmptyString` (quoted empties) and
 * `preserveEmptyColumnAsEmptyString` (unquoted empties).
 */
export function unflattenRecord(record: TransformedRecord, options: CsvParserOptions): NestedObject {
	const result: NestedObject = {};
	const preserveEmptyColumns = options.preserveEmptyColumnAsEmptyString === true;
	const preserveEmptyStrings = options.preserveEmptyString !== false;
	const arraySuffix = options.arraySuffixIndicator ?? "[]";

	for (const [key, value] of Object.entries(record)) {
		if (value === undefined) continue;

		let normalizedValue: NestedValue;

		if (isQuotedEmptyCell(value)) {
			if (!preserveEmptyStrings) continue;
			normalizedValue = "";
		} else if (value === "") {
			if (!preserveEmptyColumns) continue;
			normalizedValue = "";
		} else {
			normalizedValue = value as NestedValue;
		}

		// Split once and strip the array suffix from each segment in the same pass.
		const parts = key.split(".");
		if (arraySuffix) {
			for (let p = 0; p < parts.length; p++) {
				if (parts[p].endsWith(arraySuffix)) {
					parts[p] = parts[p].slice(0, -arraySuffix.length);
				}
			}
		}

		let current: NestedObject = result;
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (!current[part]) current[part] = {};
			current = current[part] as NestedObject;
		}
		current[parts[parts.length - 1]] = normalizedValue;
	}

	return result;
}
