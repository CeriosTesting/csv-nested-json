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
 *
 * @param keyMapper - Optional mapping applied to each record key before it is used as the output
 *   key and passed to `valueTransformer`. The buffered converter uses this to fuse header
 *   normalization (array-suffix stripping) into the same pass, avoiding a second full-record copy.
 */
export function transformRecordValues(
	record: InternalCsvRecord,
	options: CsvParserOptions,
	nullSet: Set<string>,
	keyMapper?: (key: string) => string
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

	for (const rawHeader of Object.keys(record)) {
		const value = record[rawHeader];
		const header = keyMapper ? keyMapper(rawHeader) : rawHeader;
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
 * Precompute the dot-path segments (with the array suffix stripped) for a fixed set of keys.
 *
 * The header set is constant across every row of a parse, so splitting each key once and reusing
 * the result avoids re-running `String.split` + suffix stripping for every value of every row —
 * the dominant cost when unflattening wide or tall datasets. The returned segment arrays are
 * treated as read-only by {@link unflattenRecord}.
 */
export function buildUnflattenPlan(keys: Iterable<string>, options: CsvParserOptions): Map<string, string[]> {
	const arraySuffix = options.arraySuffixIndicator ?? "[]";
	const plan = new Map<string, string[]>();

	for (const key of keys) {
		if (plan.has(key)) continue;
		plan.set(key, splitPath(key, arraySuffix));
	}

	return plan;
}

/** Split a dot-path into segments, stripping the array suffix from each segment. */
function splitPath(key: string, arraySuffix: string): string[] {
	const parts = key.split(".");
	if (arraySuffix) {
		for (let p = 0; p < parts.length; p++) {
			if (parts[p].endsWith(arraySuffix)) {
				parts[p] = parts[p].slice(0, -arraySuffix.length);
			}
		}
	}
	return parts;
}

/**
 * Unflatten a record with dot-notation keys into a nested object, stripping the array suffix from
 * each path segment. Empty-cell handling honors `preserveEmptyString` (quoted empties) and
 * `preserveEmptyColumnAsEmptyString` (unquoted empties).
 *
 * @param plan - Optional precomputed path plan from {@link buildUnflattenPlan}. When a key is
 *   present, its cached segments are reused instead of re-splitting; otherwise the split happens
 *   inline (keeps external callers and the streaming fallback path working without a plan).
 */
export function unflattenRecord(
	record: TransformedRecord,
	options: CsvParserOptions,
	plan?: Map<string, string[]>
): NestedObject {
	const result: NestedObject = {};
	const preserveEmptyColumns = options.preserveEmptyColumnAsEmptyString === true;
	const preserveEmptyStrings = options.preserveEmptyString !== false;
	const arraySuffix = options.arraySuffixIndicator ?? "[]";

	for (const key of Object.keys(record)) {
		const value = record[key];
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

		// Reuse the precomputed segments when available; otherwise split inline.
		const parts = plan?.get(key) ?? splitPath(key, arraySuffix);

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
