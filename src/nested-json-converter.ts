import type {
	CsvParserOptions,
	CsvRecord,
	ForcedArrayHierarchy,
	MergeState,
	NestedObject,
	NestedValue,
	RowContext,
} from "./types";

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

		// Build hierarchy for forced array fields (for context-aware merging)
		const allHeaders = Object.keys(records[0]);
		const normalizedHeaders = allHeaders.map(h =>
			h
				.split(".")
				.map(part => (part.endsWith(arraySuffix) ? part.slice(0, -arraySuffix.length) : part))
				.join(".")
		);
		const hierarchy = this.buildForcedArrayHierarchy(forcedArrayFields, normalizedHeaders);

		// Normalize headers by removing array suffix indicators
		const normalizedRecords = this.normalizeHeaders(records, arraySuffix);

		// Apply value transformations
		const transformedRecords = this.applyValueTransformations(normalizedRecords, options);

		// Determine identifier column: use specified column or default to first
		const identifierColumn = options.identifierColumn ?? Object.keys(transformedRecords[0])[0];

		// Validate that identifierColumn exists
		if (transformedRecords.length > 0 && !(identifierColumn in transformedRecords[0])) {
			// Fall back to first key if specified column doesn't exist
			// (this handles cases where the column was filtered out)
		}

		// Group by the identifier column
		const groups: NestedObject[][] = [];
		let currentGroup: NestedObject[] = [];

		for (const row of transformedRecords) {
			const identifierValue = row[identifierColumn];
			// Check if the identifier column has a value
			if (identifierValue && String(identifierValue).trim() !== "") {
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

		// First pass: process all groups with hierarchy-aware merging
		const processedGroups = groups.map(group => this.processGroupWithHierarchy(group, hierarchy, forcedArrayFields));

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
		const {
			autoParseNumbers,
			preserveUnsafeIntegersAsString,
			autoParseBooleans,
			autoParseDates,
			valueTransformer,
			nullValues,
			nullRepresentation,
		} = options;

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
					const parsed = this.tryParseNumber(value, preserveUnsafeIntegersAsString);
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
			default:
				return undefined;
		}
	}

	/**
	 * Try to parse a string as a number.
	 * Returns null if the string is not a valid number.
	 */
	private static tryParseNumber(value: string, preserveUnsafeIntegersAsString?: boolean): number | string | null {
		// Don't parse empty strings or whitespace-only
		if (value.trim() === "") return null;

		// Don't parse strings that look like they might be IDs or codes
		// (e.g., leading zeros like "007" or "00123")
		if (/^0\d+$/.test(value)) return null;

		const parsed = Number(value);

		// Check if it's a valid finite number
		if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
			if (preserveUnsafeIntegersAsString && /^-?\d+$/.test(value) && !Number.isSafeInteger(parsed)) {
				return value;
			}
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

	/**
	 * Build hierarchy structure for forced array fields.
	 * This enables context-aware merging of continuation rows.
	 */
	private static buildForcedArrayHierarchy(
		forcedArrayFields: Set<string>,
		normalizedHeaders: string[]
	): ForcedArrayHierarchy {
		const hierarchy: ForcedArrayHierarchy = {
			parentMap: new Map(),
			childrenMap: new Map(),
			siblingFieldsMap: new Map(),
			sortedByDepth: [],
		};

		if (forcedArrayFields.size === 0) {
			return hierarchy;
		}

		// Sort paths by depth (ascending)
		const sortedPaths = [...forcedArrayFields].sort((a, b) => a.split(".").length - b.split(".").length);
		hierarchy.sortedByDepth = sortedPaths;

		// Build parent/child relationships
		for (const path of sortedPaths) {
			hierarchy.childrenMap.set(path, new Set());

			// Find parent: the longest forced array path that is a prefix of this path
			let parent: string | null = null;
			for (const candidate of sortedPaths) {
				if (candidate !== path && path.startsWith(`${candidate}.`)) {
					if (!parent || candidate.length > parent.length) {
						parent = candidate;
					}
				}
			}
			hierarchy.parentMap.set(path, parent);

			if (parent) {
				hierarchy.childrenMap.get(parent)?.add(path);
			}
		}

		// Build sibling fields map for each forced array path
		for (const arrayPath of sortedPaths) {
			const siblings = new Set<string>();
			const pathPrefix = `${arrayPath}.`;

			for (const header of normalizedHeaders) {
				// Check if header is under this array path
				if (!header.startsWith(pathPrefix)) continue;

				const relativePath = header.slice(pathPrefix.length);
				const firstPart = relativePath.split(".")[0];

				// Check if this first part leads to a child forced array
				const potentialChildPath = `${arrayPath}.${firstPart}`;
				let isUnderChildArray = false;

				for (const childPath of hierarchy.childrenMap.get(arrayPath) || []) {
					if (potentialChildPath === childPath || childPath.startsWith(`${potentialChildPath}.`)) {
						isUnderChildArray = true;
						break;
					}
				}

				// Also check if the first part itself is a forced array path (nested arrays without intermediate fields)
				if (forcedArrayFields.has(potentialChildPath)) {
					isUnderChildArray = true;
				}

				if (!isUnderChildArray) {
					siblings.add(firstPart);
				}
			}

			hierarchy.siblingFieldsMap.set(arrayPath, siblings);
		}

		return hierarchy;
	}

	/**
	 * Analyze a row to determine merge behavior based on which fields have values.
	 */
	private static analyzeRowContext(row: NestedObject, hierarchy: ForcedArrayHierarchy): RowContext {
		const context: RowContext = {
			populatedPaths: new Set(),
			hasSiblingValues: new Map(),
		};

		// Find all populated paths (normalized flat paths with values)
		for (const [key, value] of Object.entries(row)) {
			if (value !== "" && value !== undefined && value !== null) {
				context.populatedPaths.add(key);
			}
		}

		// For each forced array path, check if its siblings have values
		for (const arrayPath of hierarchy.sortedByDepth) {
			const siblings = hierarchy.siblingFieldsMap.get(arrayPath);
			if (!siblings || siblings.size === 0) {
				context.hasSiblingValues.set(arrayPath, false);
				continue;
			}

			let hasSiblings = false;
			const pathPrefix = `${arrayPath}.`;

			for (const sibling of siblings) {
				const siblingPath = pathPrefix + sibling;

				// Check if any populated path starts with or equals this sibling path
				for (const populated of context.populatedPaths) {
					if (populated === siblingPath || populated.startsWith(`${siblingPath}.`)) {
						hasSiblings = true;
						break;
					}
				}
				if (hasSiblings) break;
			}

			context.hasSiblingValues.set(arrayPath, hasSiblings);
		}

		return context;
	}

	/**
	 * Process a group of rows using hierarchy-aware merging.
	 * This handles nested forced arrays correctly by distinguishing between
	 * "create new parent item" vs "append to nested array in existing item".
	 */
	private static processGroupWithHierarchy(
		rows: NestedObject[],
		hierarchy: ForcedArrayHierarchy,
		forcedArrayFields: Set<string>
	): NestedObject {
		if (rows.length === 0) return {};

		// If no forced array fields, use the simple merge
		if (forcedArrayFields.size === 0) {
			return this.processGroup(rows);
		}

		const result: NestedObject = {};
		const mergeState: MergeState = { lastItemByPath: new Map() };

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const isFirstRow = i === 0;
			const unflattened = this.unflatten(row);

			if (isFirstRow) {
				// First row: merge normally and track last items for each forced array
				this.deepMergeWithTracking(result, unflattened, "", hierarchy, mergeState, forcedArrayFields);
			} else {
				// Continuation row: use context-aware merging
				const rowContext = this.analyzeRowContext(row, hierarchy);
				this.contextAwareMerge(result, unflattened, hierarchy, rowContext, mergeState, forcedArrayFields, row);
			}
		}

		return result;
	}

	/**
	 * Deep merge with tracking of last items in forced arrays.
	 * Used for the first row to establish the base structure.
	 */
	private static deepMergeWithTracking(
		target: NestedObject,
		source: NestedObject,
		path: string,
		hierarchy: ForcedArrayHierarchy,
		mergeState: MergeState,
		forcedArrayFields: Set<string>
	): void {
		for (const key of Object.keys(source)) {
			const currentPath = path ? `${path}.${key}` : key;
			const sourceValue = source[key];
			const targetValue = target[key];

			if (!(key in target)) {
				target[key] = sourceValue;

				// Track this as the last item if it's part of a forced array
				if (
					forcedArrayFields.has(currentPath) &&
					typeof sourceValue === "object" &&
					sourceValue !== null &&
					!Array.isArray(sourceValue)
				) {
					mergeState.lastItemByPath.set(currentPath, sourceValue as NestedObject);
				}

				// Recursively track nested forced arrays
				if (typeof sourceValue === "object" && sourceValue !== null && !Array.isArray(sourceValue)) {
					this.trackLastItems(sourceValue as NestedObject, currentPath, mergeState, forcedArrayFields);
				}
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
				// Both are objects, recurse
				this.deepMergeWithTracking(
					targetValue as NestedObject,
					sourceValue as NestedObject,
					currentPath,
					hierarchy,
					mergeState,
					forcedArrayFields
				);
			} else {
				// Collision - use standard merge behavior
				this.deepMerge(target, { [key]: sourceValue });
			}
		}
	}

	/**
	 * Track last items in nested forced arrays.
	 */
	private static trackLastItems(
		obj: NestedObject,
		basePath: string,
		mergeState: MergeState,
		forcedArrayFields: Set<string>
	): void {
		for (const [key, value] of Object.entries(obj)) {
			const currentPath = `${basePath}.${key}`;

			if (forcedArrayFields.has(currentPath) && typeof value === "object" && value !== null) {
				if (Array.isArray(value) && value.length > 0) {
					const lastItem = value[value.length - 1];
					if (typeof lastItem === "object" && lastItem !== null && !Array.isArray(lastItem)) {
						mergeState.lastItemByPath.set(currentPath, lastItem as NestedObject);
					}
				} else if (!Array.isArray(value)) {
					mergeState.lastItemByPath.set(currentPath, value as NestedObject);
				}
			}

			if (typeof value === "object" && value !== null && !Array.isArray(value)) {
				this.trackLastItems(value as NestedObject, currentPath, mergeState, forcedArrayFields);
			}
		}
	}

	/**
	 * Context-aware merge for continuation rows.
	 * Decides whether to create new array items or append to existing nested arrays.
	 */
	private static contextAwareMerge(
		target: NestedObject,
		source: NestedObject,
		hierarchy: ForcedArrayHierarchy,
		rowContext: RowContext,
		mergeState: MergeState,
		forcedArrayFields: Set<string>,
		flatRow: NestedObject
	): void {
		// Determine which array paths need new items vs append to existing
		const createNewItemAt = new Set<string>();
		const appendToExistingAt = new Set<string>();
		const skipAt = new Set<string>(); // Paths to skip (parent that only has nested array data)

		// Process from shallowest to deepest
		for (const arrayPath of hierarchy.sortedByDepth) {
			const hasSiblingValues = rowContext.hasSiblingValues.get(arrayPath) ?? false;
			const parentPath = hierarchy.parentMap.get(arrayPath) ?? null;

			// Check if this array path has any data in this row
			const hasDataAtPath = this.hasDataUnderPath(flatRow, arrayPath);
			if (!hasDataAtPath) continue;

			// Check if ALL data is in child forced arrays (no direct data at this level)
			const hasOnlyChildArrayData = this.hasOnlyChildArrayData(flatRow, arrayPath, hierarchy);

			if (hasSiblingValues) {
				// This level has sibling values - create new item
				createNewItemAt.add(arrayPath);
			} else if (parentPath !== null && createNewItemAt.has(parentPath)) {
				// Parent is creating new item, so we also create new under it
				createNewItemAt.add(arrayPath);
			} else if (hasOnlyChildArrayData) {
				// This level only has data in child forced arrays - skip this level
				// The child array handling will take care of appending
				skipAt.add(arrayPath);
			} else {
				// No sibling values and parent isn't creating new - append to existing
				appendToExistingAt.add(arrayPath);
			}
		}

		// Now apply the merge based on decisions
		this.applyContextAwareMerge(
			target,
			source,
			createNewItemAt,
			appendToExistingAt,
			mergeState,
			hierarchy,
			forcedArrayFields
		);
	}

	/**
	 * Check if the only data under this path is in child forced array fields.
	 * Returns false if there are no child forced arrays.
	 */
	private static hasOnlyChildArrayData(flatRow: NestedObject, path: string, hierarchy: ForcedArrayHierarchy): boolean {
		const prefix = `${path}.`;
		const childArrayPaths = hierarchy.childrenMap.get(path) || new Set<string>();

		// If there are no child forced arrays, return false
		if (childArrayPaths.size === 0) {
			return false;
		}

		let hasAnyData = false;

		for (const [key, value] of Object.entries(flatRow)) {
			if (!key.startsWith(prefix)) continue;
			if (value === "" || value === undefined) continue;

			hasAnyData = true;

			// Check if this key is under any child forced array
			let isUnderChildArray = false;
			for (const childPath of childArrayPaths) {
				const childPrefix = `${childPath}.`;
				if (key.startsWith(childPrefix) || key === childPath) {
					isUnderChildArray = true;
					break;
				}
			}

			// If there's data that's NOT under a child forced array, return false
			if (!isUnderChildArray) {
				return false;
			}
		}

		// Return true only if there was some data and all of it was under child arrays
		return hasAnyData;
	}

	/**
	 * Check if there's any data under a given path in the flat row.
	 */
	private static hasDataUnderPath(flatRow: NestedObject, path: string): boolean {
		const prefix = `${path}.`;
		for (const key of Object.keys(flatRow)) {
			if ((key === path || key.startsWith(prefix)) && flatRow[key] !== "" && flatRow[key] !== undefined) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Apply the context-aware merge decisions.
	 */
	private static applyContextAwareMerge(
		target: NestedObject,
		source: NestedObject,
		createNewItemAt: Set<string>,
		appendToExistingAt: Set<string>,
		mergeState: MergeState,
		hierarchy: ForcedArrayHierarchy,
		forcedArrayFields: Set<string>
	): void {
		// Handle arrays that need new items (from shallowest to deepest)
		for (const arrayPath of hierarchy.sortedByDepth) {
			if (createNewItemAt.has(arrayPath)) {
				const parentPath = hierarchy.parentMap.get(arrayPath) ?? null;

				// Get the data for this array level from source
				const sourceData = this.getValueAtPath(source, arrayPath);
				if (sourceData === undefined) continue;

				if (parentPath === null || !createNewItemAt.has(parentPath)) {
					// Root-level array or parent isn't creating new - add to target directly
					const targetArray = this.ensureArrayAtPath(target, arrayPath);
					const newItem =
						typeof sourceData === "object" && !Array.isArray(sourceData) ? sourceData : { value: sourceData };
					targetArray.push(newItem as NestedValue);
					mergeState.lastItemByPath.set(arrayPath, newItem as NestedObject);

					// Track nested forced arrays in the new item
					if (typeof newItem === "object" && newItem !== null) {
						this.trackLastItems(newItem as NestedObject, arrayPath, mergeState, forcedArrayFields);
					}
				}
				// If parent is also creating new, the data is already included in parent's item
			}
		}

		// Handle arrays that append to existing items
		for (const arrayPath of hierarchy.sortedByDepth) {
			if (appendToExistingAt.has(arrayPath)) {
				const parentPath = hierarchy.parentMap.get(arrayPath) ?? null;
				const sourceData = this.getValueAtPath(source, arrayPath);
				if (sourceData === undefined) continue;

				if (parentPath !== null) {
					// Get the last item of the parent array
					const lastParentItem = mergeState.lastItemByPath.get(parentPath);
					if (lastParentItem) {
						// Get the relative path from parent to this array
						const relativePath = arrayPath.slice(parentPath.length + 1);
						const nestedArray = this.ensureArrayAtPathRelative(lastParentItem, relativePath);

						if (typeof sourceData === "object" && !Array.isArray(sourceData)) {
							nestedArray.push(sourceData as NestedValue);
							mergeState.lastItemByPath.set(arrayPath, sourceData as NestedObject);

							// Track nested forced arrays
							this.trackLastItems(sourceData as NestedObject, arrayPath, mergeState, forcedArrayFields);
						} else {
							nestedArray.push(sourceData);
						}
					}
				} else {
					// Root-level array - append to the array in target
					const targetArray = this.ensureArrayAtPath(target, arrayPath);
					const lastItem = targetArray.length > 0 ? targetArray[targetArray.length - 1] : null;

					if (lastItem && typeof lastItem === "object" && !Array.isArray(lastItem)) {
						// Merge into the last item
						if (typeof sourceData === "object" && !Array.isArray(sourceData)) {
							this.deepMerge(lastItem as NestedObject, sourceData as NestedObject);
						}
					} else {
						// No last item or last item is not an object - just add
						targetArray.push(sourceData as NestedValue);
					}
				}
			}
		}

		// Handle non-array fields that weren't part of forced arrays
		this.mergeNonArrayFields(target, source, forcedArrayFields);
	}

	/**
	 * Merge fields that are not part of forced arrays.
	 * Uses deepMerge for proper collision detection and auto-array creation.
	 */
	private static mergeNonArrayFields(target: NestedObject, source: NestedObject, forcedArrayFields: Set<string>): void {
		// Filter source to only include paths not under forced array fields
		const filteredSource = this.filterForcedArrayPaths(source, forcedArrayFields, "");

		if (Object.keys(filteredSource).length > 0) {
			this.deepMerge(target, filteredSource);
		}
	}

	/**
	 * Filter out paths that are under forced array fields.
	 */
	private static filterForcedArrayPaths(obj: NestedObject, forcedArrayFields: Set<string>, path: string): NestedObject {
		const result: NestedObject = {};

		for (const key of Object.keys(obj)) {
			const currentPath = path ? `${path}.${key}` : key;

			// Check if this path or any parent is a forced array field
			let isUnderForcedArray = false;
			let checkPath = currentPath;
			while (checkPath) {
				if (forcedArrayFields.has(checkPath)) {
					isUnderForcedArray = true;
					break;
				}
				const lastDot = checkPath.lastIndexOf(".");
				checkPath = lastDot > 0 ? checkPath.slice(0, lastDot) : "";
			}

			if (isUnderForcedArray) continue;

			const value = obj[key];

			if (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
				const filtered = this.filterForcedArrayPaths(value as NestedObject, forcedArrayFields, currentPath);
				if (Object.keys(filtered).length > 0) {
					result[key] = filtered;
				}
			} else {
				result[key] = value;
			}
		}

		return result;
	}

	/**
	 * Get value at a dot-separated path in a nested object.
	 */
	private static getValueAtPath(obj: NestedObject, path: string): NestedValue | undefined {
		const parts = path.split(".");
		let current: NestedValue = obj;

		for (const part of parts) {
			if (current === null || current === undefined) return undefined;
			if (typeof current !== "object" || Array.isArray(current)) return undefined;
			current = (current as NestedObject)[part];
		}

		return current;
	}

	/**
	 * Ensure an array exists at the given path, creating intermediate objects as needed.
	 */
	private static ensureArrayAtPath(obj: NestedObject, path: string): NestedValue[] {
		const parts = path.split(".");
		let current: NestedObject = obj;

		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (!(part in current)) {
				current[part] = {};
			}
			current = current[part] as NestedObject;
		}

		const lastPart = parts[parts.length - 1];
		if (!(lastPart in current)) {
			current[lastPart] = [];
		} else if (!Array.isArray(current[lastPart])) {
			// Convert existing value to array
			current[lastPart] = [current[lastPart]];
		}

		return current[lastPart] as NestedValue[];
	}

	/**
	 * Ensure an array exists at the given relative path within an object.
	 */
	private static ensureArrayAtPathRelative(obj: NestedObject, relativePath: string): NestedValue[] {
		return this.ensureArrayAtPath(obj, relativePath);
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
