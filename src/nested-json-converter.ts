/**
 * Nested JSON conversion utilities
 */
export class NestedJsonConverter {
	/**
	 * Convert flat CSV records into nested JSON structure with array detection
	 */
	static convert(records: any[]): any[] {
		if (records.length === 0) return [];

		// Group by the first column (identifier)
		const firstKey = Object.keys(records[0])[0];
		const groups: any[][] = [];
		let currentGroup: any[] = [];

		for (const row of records) {
			// Check if the identifier column has a value
			if (row[firstKey] && row[firstKey].trim() !== "") {
				if (currentGroup.length > 0) {
					groups.push(currentGroup);
				}
				currentGroup = [row];
			} else {
				currentGroup.push(row);
			}
		}
		if (currentGroup.length > 0) {
			groups.push(currentGroup);
		}

		// First pass: process all groups
		const processedGroups = groups.map(group => this.processGroup(group));

		// Second pass: detect which fields are arrays in any group
		const arrayFields = this.detectArrayFields(processedGroups);

		// Third pass: normalize all groups to have consistent array fields
		return processedGroups.map(group => this.normalizeArrays(group, arrayFields));
	}

	private static processGroup(rows: any[]): any {
		const result: any = {};
		for (const row of rows) {
			const rowObj = this.unflatten(row);
			this.deepMerge(result, rowObj);
		}
		return result;
	}

	private static unflatten(row: any): any {
		const result: any = {};
		for (const [key, value] of Object.entries(row)) {
			if (value === "" || value === undefined || value === null) continue;

			const parts = key.split(".");
			let current = result;
			for (let i = 0; i < parts.length - 1; i++) {
				const part = parts[i];
				if (!current[part]) current[part] = {};
				current = current[part];
			}
			current[parts[parts.length - 1]] = value;
		}
		return result;
	}

	private static deepMerge(target: any, source: any): void {
		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = target[key];

			if (!(key in target)) {
				// Key doesn't exist in target, just assign it
				target[key] = sourceValue;
			} else if (Array.isArray(targetValue)) {
				// Target is already an array, append the new value
				targetValue.push(sourceValue);
			} else if (
				typeof targetValue === "object" &&
				targetValue !== null &&
				!Array.isArray(targetValue) &&
				typeof sourceValue === "object" &&
				sourceValue !== null &&
				!Array.isArray(sourceValue)
			) {
				// Both are plain objects - check if we should create array of objects
				// or recursively merge
				const shouldCreateArray = this.shouldCreateArrayOfObjects(targetValue, sourceValue);

				if (shouldCreateArray) {
					// Convert to array of objects
					target[key] = [targetValue, sourceValue];
				} else {
					// Recursively merge the nested objects
					this.deepMerge(targetValue, sourceValue);
				}
			} else {
				// Collision detected at this level: convert to array
				target[key] = [targetValue, sourceValue];
			}
		}
	}

	private static checkIfAllKeysCollide(obj1: any, obj2: any): boolean {
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

	private static shouldCreateArrayOfObjects(obj1: any, obj2: any): boolean {
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
				if (!this.checkIfAllKeysCollide(val1, val2)) {
					allNestedWouldCollide = false;
				}
			}
		}

		// If we have nested objects and ALL of them would result in primitive collisions,
		// then we should create array at this level to preserve the record structure
		return hasNestedObjects && allNestedWouldCollide;
	}

	private static detectArrayFields(groups: any[]): Set<string> {
		const arrayFields = new Set<string>();

		const checkForArrays = (obj: any, path: string = "") => {
			for (const [key, value] of Object.entries(obj)) {
				const currentPath = path ? `${path}.${key}` : key;

				if (Array.isArray(value)) {
					arrayFields.add(currentPath);
					// Recursively check array elements for nested arrays
					for (const item of value) {
						if (item && typeof item === "object" && !Array.isArray(item)) {
							checkForArrays(item, currentPath);
						}
					}
				} else if (value && typeof value === "object") {
					checkForArrays(value, currentPath);
				}
			}
		};

		for (const group of groups) {
			checkForArrays(group);
		}

		return arrayFields;
	}

	private static normalizeArrays(obj: any, arrayFields: Set<string>, path: string = ""): any {
		const result: any = {};

		for (const [key, value] of Object.entries(obj)) {
			const currentPath = path ? `${path}.${key}` : key;

			if (arrayFields.has(currentPath)) {
				// This field should be an array
				if (Array.isArray(value)) {
					// Already an array, recursively normalize its elements
					result[key] = value.map(item =>
						item && typeof item === "object" && !Array.isArray(item)
							? this.normalizeArrays(item, arrayFields, currentPath)
							: item
					);
				} else if (value && typeof value === "object") {
					// Convert single object to array with one element
					result[key] = [this.normalizeArrays(value, arrayFields, currentPath)];
				} else {
					// Convert single value to array with one element
					result[key] = [value];
				}
			} else if (value && typeof value === "object" && !Array.isArray(value)) {
				// Not an array field, but might contain nested objects
				result[key] = this.normalizeArrays(value, arrayFields, currentPath);
			} else {
				// Regular value, keep as-is
				result[key] = value;
			}
		}

		return result;
	}
}
