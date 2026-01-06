import type { CsvParserOptions, CsvRecord, NestedObject, NestedValue } from "./types";

/**
 * Nested JSON conversion utilities.
 * Converts flat CSV records into nested JSON structures with automatic array detection.
 *
 * Features:
 * - Dot-notation paths in headers become nested objects
 * - Rows with empty first column are continuation rows (extend previous record)
 * - Automatic array detection when values collide during merge
 * - Forced array fields via `[]` suffix in headers
 * - Value transformation (auto-parse numbers, booleans, custom transformers)
 *
 * @example
 * ```typescript
 * const records = [
 *   { 'id': '1', 'person.name': 'John', 'person.age': '30' }
 * ];
 *
 * const result = NestedJsonConverter.convert(records);
 * // [{ id: '1', person: { name: 'John', age: '30' } }]
 * ```
 */
export class NestedJsonConverter {
	/**
	 * Convert flat CSV records into nested JSON structure with array detection.
	 *
	 * @param records - Array of flat CSV records with string values
	 * @param options - Parser options for customizing conversion
	 * @returns Array of nested JSON objects
	 *
	 * @example
	 * ```typescript
	 * // Basic conversion with dot notation
	 * const records = [{ 'person.name': 'John', 'person.city': 'NYC' }];
	 * const result = NestedJsonConverter.convert(records);
	 * // [{ person: { name: 'John', city: 'NYC' } }]
	 * ```
	 *
	 * @example
	 * ```typescript
	 * // With value transformation
	 * const records = [{ id: '1', active: 'true', score: '95.5' }];
	 * const result = NestedJsonConverter.convert(records, {
	 *   autoParseNumbers: true,
	 *   autoParseBooleans: true
	 * });
	 * // [{ id: 1, active: true, score: 95.5 }]
	 * ```
	 */
	static convert(records: CsvRecord[], options: CsvParserOptions = {}): NestedObject[] {
		if (records.length === 0) return [];

		const arraySuffix = options.arraySuffixIndicator ?? "[]";
		const emptyArrayBehavior = options.emptyArrayBehavior ?? "omit";

		// Detect forced array fields from headers (fields with array suffix indicator)
		const forcedArrayFields = this.detectForcedArrayFields(records, arraySuffix);

		// Normalize headers by removing array suffix indicators
		const normalizedRecords = this.normalizeHeaders(records, arraySuffix);

		// Apply value transformations
		const transformedRecords = this.applyValueTransformations(normalizedRecords, options);

		// Group by the first column (identifier)
		const firstKey = Object.keys(transformedRecords[0])[0];
		const groups: NestedObject[][] = [];
		let currentGroup: NestedObject[] = [];

		for (const row of transformedRecords) {
			const firstValue = row[firstKey];
			// Check if the identifier column has a value
			if (firstValue && String(firstValue).trim() !== "") {
				if (currentGroup.length > 0) {
					groups.push(currentGroup);
				}
				currentGroup = [row as NestedObject];
			} else {
				currentGroup.push(row as NestedObject);
			}
		}
		if (currentGroup.length > 0) {
			groups.push(currentGroup);
		}

		// First pass: process all groups
		const processedGroups = groups.map(group => this.processGroup(group));

		// Second pass: detect which fields are arrays in any group (auto-detected)
		const autoArrayFields = this.detectArrayFields(processedGroups);

		// Merge forced and auto-detected array fields
		const allArrayFields = new Set([...forcedArrayFields, ...autoArrayFields]);

		// Third pass: normalize all groups to have consistent array fields
		return processedGroups.map(group =>
			this.normalizeArrays(group, allArrayFields, forcedArrayFields, emptyArrayBehavior)
		);
	}

	/**
	 * Apply value transformations (null detection, auto-parse numbers, booleans, dates, custom transformer).
	 * Transformation order: nullValues → autoParseNumbers → autoParseBooleans → autoParseDates → valueTransformer
	 */
	private static applyValueTransformations(
		records: CsvRecord[],
		options: CsvParserOptions
	): Record<string, string | number | boolean | Date | null | undefined>[] {
		const { autoParseNumbers, autoParseBooleans, autoParseDates, valueTransformer, nullValues, nullRepresentation } =
			options;

		// Default null values
		const nullSet = new Set((nullValues ?? ["null", "NULL", "nil", "NIL"]).map(v => v.toLowerCase()));

		// If no transformations are needed, return records as-is
		if (!autoParseNumbers && !autoParseBooleans && !autoParseDates && !valueTransformer && nullValues === undefined) {
			return records;
		}

		return records.map(record => {
			const transformed: Record<string, string | number | boolean | Date | null | undefined> = {};

			for (const [header, value] of Object.entries(record)) {
				let transformedValue: string | number | boolean | Date | null | undefined = value;

				// Skip empty values (unless they match nullValues)
				if (value === "") {
					// Check if empty string is in nullValues
					if (nullValues !== undefined && nullSet.has("")) {
						transformedValue = this.applyNullRepresentation(nullRepresentation);
						if (nullRepresentation === "omit") {
							continue; // Skip this field entirely
						}
					}
					transformed[header] = transformedValue;
					continue;
				}

				// Step 0: Check for null values (before number/boolean parsing)
				if (nullValues !== undefined && nullSet.has(value.toLowerCase())) {
					const nullVal = this.applyNullRepresentation(nullRepresentation);
					if (nullRepresentation === "omit") {
						continue; // Skip this field entirely
					}
					transformed[header] = nullVal;
					continue;
				}

				// Step 1: Auto-parse numbers
				if (autoParseNumbers) {
					const parsed = this.tryParseNumber(value);
					if (parsed !== null) {
						transformedValue = parsed;
					}
				}

				// Step 2: Auto-parse booleans (only if still a string)
				if (autoParseBooleans && typeof transformedValue === "string") {
					const parsed = this.tryParseBoolean(value);
					if (parsed !== null) {
						transformedValue = parsed;
					}
				}

				// Step 3: Auto-parse dates (only if still a string)
				if (autoParseDates && typeof transformedValue === "string") {
					const parsed = this.tryParseDate(value);
					if (parsed !== null) {
						transformedValue = parsed;
					}
				}

				// Step 4: Apply custom transformer
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
		});
	}

	/**
	 * Apply null representation based on option.
	 */
	private static applyNullRepresentation(
		representation: CsvParserOptions["nullRepresentation"]
	): null | undefined | string {
		switch (representation) {
			case "null":
				return null;
			case "undefined":
				return undefined;
			case "empty-string":
				return "";
			case "omit":
			default:
				return undefined;
		}
	}

	/**
	 * Try to parse a string as a number.
	 * Returns null if the string is not a valid number.
	 */
	private static tryParseNumber(value: string): number | null {
		// Don't parse empty strings or whitespace-only
		if (value.trim() === "") return null;

		// Don't parse strings that look like they might be IDs or codes
		// (e.g., leading zeros like "007" or "00123")
		if (/^0\d+$/.test(value)) return null;

		const parsed = Number(value);

		// Check if it's a valid finite number
		if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
			return parsed;
		}

		return null;
	}

	/**
	 * Try to parse a string as a boolean.
	 * Returns null if the string is not 'true' or 'false' (case-insensitive).
	 */
	private static tryParseBoolean(value: string): boolean | null {
		const lower = value.toLowerCase().trim();
		if (lower === "true") return true;
		if (lower === "false") return false;
		return null;
	}

	/**
	 * Try to parse a string as a Date.
	 * Returns null if the string is not a valid date.
	 * Uses JavaScript's Date.parse() for recognition.
	 */
	private static tryParseDate(value: string): Date | null {
		// Don't parse empty strings or pure numbers
		if (value.trim() === "" || /^-?\d+(\.\d+)?$/.test(value)) return null;

		// Try to parse as date
		const timestamp = Date.parse(value);
		if (!Number.isNaN(timestamp)) {
			return new Date(timestamp);
		}

		return null;
	}

	private static detectForcedArrayFields(records: CsvRecord[], arraySuffix: string): Set<string> {
		if (records.length === 0 || !arraySuffix) return new Set();

		const forcedFields = new Set<string>();
		const headers = Object.keys(records[0]);

		for (const header of headers) {
			// Find all occurrences of the array suffix in the header
			const parts = header.split(".");
			let currentPath = "";

			for (let i = 0; i < parts.length; i++) {
				let part = parts[i];

				// Check if this part ends with the array suffix
				if (part.endsWith(arraySuffix)) {
					// Remove the suffix to get the clean part name
					part = part.slice(0, -arraySuffix.length);
					currentPath = currentPath ? `${currentPath}.${part}` : part;
					forcedFields.add(currentPath);
				} else {
					currentPath = currentPath ? `${currentPath}.${part}` : part;
				}
			}
		}

		return forcedFields;
	}

	private static normalizeHeaders(records: CsvRecord[], arraySuffix: string): CsvRecord[] {
		if (!arraySuffix) return records;

		return records.map(record => {
			const normalized: CsvRecord = {};
			for (const [key, value] of Object.entries(record)) {
				// Remove all occurrences of the array suffix from the key
				const normalizedKey = key
					.split(".")
					.map(part => (part.endsWith(arraySuffix) ? part.slice(0, -arraySuffix.length) : part))
					.join(".");
				normalized[normalizedKey] = value;
			}
			return normalized;
		});
	}

	private static processGroup(rows: NestedObject[]): NestedObject {
		const result: NestedObject = {};
		for (const row of rows) {
			const rowObj = this.unflatten(row);
			this.deepMerge(result, rowObj);
		}
		return result;
	}

	private static unflatten(row: NestedObject): NestedObject {
		const result: NestedObject = {};
		for (const [key, value] of Object.entries(row)) {
			// Skip empty strings and undefined, but preserve null as a valid value
			if (value === "" || value === undefined) continue;

			const parts = key.split(".");
			let current: NestedObject = result;
			for (let i = 0; i < parts.length - 1; i++) {
				const part = parts[i];
				if (!current[part]) current[part] = {};
				current = current[part] as NestedObject;
			}
			current[parts[parts.length - 1]] = value;
		}
		return result;
	}

	private static deepMerge(target: NestedObject, source: NestedObject): void {
		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = target[key];

			if (!(key in target)) {
				// Key doesn't exist in target, just assign it
				target[key] = sourceValue;
			} else if (Array.isArray(targetValue)) {
				// Target is already an array, append the new value
				(targetValue as NestedValue[]).push(sourceValue);
			} else if (
				typeof targetValue === "object" &&
				targetValue !== null &&
				!Array.isArray(targetValue) &&
				!(targetValue instanceof Date) &&
				typeof sourceValue === "object" &&
				sourceValue !== null &&
				!Array.isArray(sourceValue) &&
				!(sourceValue instanceof Date)
			) {
				// Both are plain objects (not Date) - check if we should create array of objects
				// or recursively merge
				const shouldCreateArray = this.shouldCreateArrayOfObjects(
					targetValue as NestedObject,
					sourceValue as NestedObject
				);

				if (shouldCreateArray) {
					// Convert to array of objects
					target[key] = [targetValue, sourceValue];
				} else {
					// Recursively merge the nested objects
					this.deepMerge(targetValue as NestedObject, sourceValue as NestedObject);
				}
			} else {
				// Collision detected at this level: convert to array
				target[key] = [targetValue, sourceValue];
			}
		}
	}

	private static checkIfAllKeysCollide(obj1: NestedObject, obj2: NestedObject): boolean {
		// Check if ALL overlapping keys would result in collisions (non-mergeable values).
		// Returns true only if every overlapping key has primitives/arrays that can't be merged.

		const keys1 = Object.keys(obj1);
		const keys2 = Object.keys(obj2);

		// Get overlapping keys
		const overlapping = keys2.filter(k => keys1.includes(k));

		if (overlapping.length === 0) return false;

		// Check each overlapping key
		for (const key of overlapping) {
			const val1 = obj1[key];
			const val2 = obj2[key];

			const isObj1 = typeof val1 === "object" && val1 !== null && !Array.isArray(val1);
			const isObj2 = typeof val2 === "object" && val2 !== null && !Array.isArray(val2);

			// If both are plain objects, this key could be merged (not a collision)
			if (isObj1 && isObj2) {
				return false; // Not ALL keys would collide
			}
			// If at least one is not an object, this key would collide
			// Continue checking other keys
		}

		// All overlapping keys have non-object values, so all would collide
		return true;
	}

	private static shouldCreateArrayOfObjects(obj1: NestedObject, obj2: NestedObject): boolean {
		// Create an array of objects at this level if:
		// 1. There's an immediate collision (overlapping keys with non-object values), OR
		// 2. All overlapping nested object keys would result in primitive collisions
		//    (indicating these are two distinct records, not mergeable structures)

		const keys1 = new Set(Object.keys(obj1));
		const keys2 = new Set(Object.keys(obj2));

		let hasNestedObjects = false;
		let allNestedWouldCollide = true;

		for (const key of keys2) {
			if (keys1.has(key)) {
				const val1 = obj1[key];
				const val2 = obj2[key];

				const isObj1 = typeof val1 === "object" && val1 !== null && !Array.isArray(val1);
				const isObj2 = typeof val2 === "object" && val2 !== null && !Array.isArray(val2);

				// If at least one is NOT a plain object, we have an immediate collision
				if (!isObj1 || !isObj2) {
					return true;
				}

				// Both are objects - check if they would collide when merged
				hasNestedObjects = true;
				if (!this.checkIfAllKeysCollide(val1 as NestedObject, val2 as NestedObject)) {
					allNestedWouldCollide = false;
				}
			}
		}

		// If we have nested objects and ALL of them would result in primitive collisions,
		// then we should create array at this level to preserve the record structure
		return hasNestedObjects && allNestedWouldCollide;
	}

	private static detectArrayFields(groups: NestedObject[]): Set<string> {
		const arrayFields = new Set<string>();

		const checkForArrays = (obj: NestedObject, path: string = "") => {
			for (const [key, value] of Object.entries(obj)) {
				const currentPath = path ? `${path}.${key}` : key;

				if (Array.isArray(value)) {
					arrayFields.add(currentPath);
					// Recursively check array elements for nested arrays
					for (const item of value) {
						if (item && typeof item === "object" && !Array.isArray(item)) {
							checkForArrays(item as NestedObject, currentPath);
						}
					}
				} else if (value && typeof value === "object" && !(value instanceof Date)) {
					checkForArrays(value as NestedObject, currentPath);
				}
			}
		};

		for (const group of groups) {
			checkForArrays(group);
		}

		return arrayFields;
	}

	private static normalizeArrays(
		obj: NestedObject,
		arrayFields: Set<string>,
		forcedArrayFields: Set<string>,
		emptyArrayBehavior: "empty-array" | "omit",
		path: string = ""
	): NestedObject {
		const result: NestedObject = {};

		// First, handle existing properties
		for (const [key, value] of Object.entries(obj)) {
			const currentPath = path ? `${path}.${key}` : key;

			if (arrayFields.has(currentPath)) {
				// This field should be an array
				if (Array.isArray(value)) {
					// Already an array, recursively normalize its elements
					result[key] = value.map(item =>
						item && typeof item === "object" && !Array.isArray(item) && !(item instanceof Date)
							? this.normalizeArrays(
									item as NestedObject,
									arrayFields,
									forcedArrayFields,
									emptyArrayBehavior,
									currentPath
								)
							: item
					);
				} else if (value && typeof value === "object" && !(value instanceof Date)) {
					// Convert single object to array with one element
					result[key] = [
						this.normalizeArrays(
							value as NestedObject,
							arrayFields,
							forcedArrayFields,
							emptyArrayBehavior,
							currentPath
						),
					];
				} else {
					// Convert single value to array with one element
					result[key] = [value];
				}
			} else if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
				// Not an array field, but might contain nested objects
				result[key] = this.normalizeArrays(
					value as NestedObject,
					arrayFields,
					forcedArrayFields,
					emptyArrayBehavior,
					currentPath
				);
			} else {
				// Regular value, keep as-is
				result[key] = value;
			}
		}

		// Second, add empty arrays for forced array fields that are missing
		for (const forcedPath of forcedArrayFields) {
			// Check if this forced path should be a direct child of current path
			const relativePath = path ? forcedPath.replace(`${path}.`, "") : forcedPath;

			// Only process if it's a direct child (no dots in relative path after removing prefix)
			if (relativePath.includes(".")) continue;
			if (forcedPath !== (path ? `${path}.${relativePath}` : relativePath)) continue;

			// If this key doesn't exist in result and we should create empty arrays
			if (!(relativePath in result)) {
				if (emptyArrayBehavior === "empty-array") {
					result[relativePath] = [];
				}
				// If 'omit', we don't add anything
			}
		}

		return result;
	}
}
