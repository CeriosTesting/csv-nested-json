import { CsvParseError } from "./errors";
import { type InternalCsvRecord, isQuotedEmptyCell, QUOTED_EMPTY_CELL } from "./internal-empty-cell";
import type {
	CsvParserOptions,
	CsvRecord,
	ForcedArrayHierarchy,
	MergeState,
	NestedObject,
	NestedValue,
	RowContext,
} from "./types";
import { applyNullRepresentation, tryParseBoolean, tryParseNumber } from "./value-parsers";

type ConvertibleCsvRecord = CsvRecord | InternalCsvRecord;
type TransformedRecordValue = string | number | boolean | Date | null | undefined | typeof QUOTED_EMPTY_CELL;
type TransformedRecord = Record<string, TransformedRecordValue>;

/**
 * Nested JSON conversion utilities.
 * Converts flat CSV records into nested JSON structures with automatic array detection.
 *
 * Features:
 * - Dot-notation paths in headers become nested objects
 * - Rows with empty first column are continuation rows (extend previous record)
 * - Array fields via the `[]` suffix in headers; arrays are never created implicitly.
 *   A repeated non-`[]` path within a group throws `CsvParseError`.
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
	static convert(records: ConvertibleCsvRecord[], options: CsvParserOptions = {}): NestedObject[] {
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

		// Determine identifier column from available normalized columns.
		// A configured identifierColumn must exist, otherwise grouping semantics are ambiguous.
		const availableColumns = Object.keys(normalizedRecords[0] ?? {});
		if (availableColumns.length === 0) {
			throw new CsvParseError(
				"No columns available after filtering. Cannot resolve identifier column for continuation row grouping."
			);
		}

		const configuredIdentifier = options.identifierColumn;
		if (configuredIdentifier && !availableColumns.includes(configuredIdentifier)) {
			throw new CsvParseError(
				`identifierColumn '${configuredIdentifier}' not found in headers. Available columns: ${availableColumns.join(", ")}`
			);
		}

		const identifierColumn = configuredIdentifier ?? availableColumns[0];

		// Group by the identifier column
		const groups: TransformedRecord[][] = [];
		let currentGroup: TransformedRecord[] = [];

		for (let rowIndex = 0; rowIndex < transformedRecords.length; rowIndex++) {
			const row = transformedRecords[rowIndex];
			const identifierValue = row[identifierColumn];
			const hasIdentifierValue = this.hasIdentifierValue(identifierValue);

			// Check if the identifier column has a value
			if (hasIdentifierValue) {
				if (currentGroup.length > 0) {
					groups.push(currentGroup);
				}
				currentGroup = [row];
			} else {
				if (currentGroup.length === 0) {
					throw new CsvParseError(
						`Row ${rowIndex + 1} is a continuation row, but no base row exists. Column '${identifierColumn}' must have a value to start a group.`
					);
				}

				// Continuation rows should never overwrite the grouping identifier value.
				const continuationRow: TransformedRecord = {
					...row,
					[identifierColumn]: undefined,
				};
				currentGroup.push(continuationRow);
			}
		}
		if (currentGroup.length > 0) {
			groups.push(currentGroup);
		}

		// Apply record limit (counts output records, i.e. groups). A partially buffered
		// group is never split: each group maps to exactly one output object.
		const limit = options.limit;
		const limitedGroups = limit !== undefined && limit > 0 ? groups.slice(0, limit) : groups;

		// Process all groups with hierarchy-aware merging. Arrays are created ONLY for
		// forced array fields (`[]` suffix). A repeated non-forced path within a group is
		// treated as an error rather than being silently promoted to an array.
		const processedGroups = limitedGroups.map(group =>
			this.processGroupWithHierarchy(group, hierarchy, forcedArrayFields, arraySuffix, options)
		);

		// Normalize all groups so forced array fields are consistently arrays.
		return processedGroups.map(group =>
			this.normalizeArrays(group, forcedArrayFields, forcedArrayFields, emptyArrayBehavior)
		);
	}

	private static hasIdentifierValue(value: TransformedRecordValue): boolean {
		if (value === undefined || value === null || isQuotedEmptyCell(value)) {
			return false;
		}

		return String(value).trim() !== "";
	}

	/**
	 * Apply value transformations (null detection, auto-parse numbers, booleans, custom transformer).
	 * Transformation order: nullValues → autoParseNumbers → autoParseBooleans → valueTransformer
	 */
	private static applyValueTransformations(
		records: InternalCsvRecord[],
		options: CsvParserOptions
	): TransformedRecord[] {
		const {
			autoParseNumbers,
			preserveUnsafeIntegersAsString,
			autoParseBooleans,
			valueTransformer,
			nullValues,
			nullRepresentation,
		} = options;

		// Default null values
		const nullSet = new Set((nullValues ?? ["null", "NULL", "nil", "NIL"]).map(v => v.toLowerCase()));

		// If no transformations are needed, return records as-is
		if (!autoParseNumbers && !autoParseBooleans && !valueTransformer && nullValues === undefined) {
			return records as TransformedRecord[];
		}

		return records.map(record => {
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
					// Check if empty string is in nullValues
					if (nullValues !== undefined && nullSet.has("")) {
						transformedValue = applyNullRepresentation(nullRepresentation);
						if (nullRepresentation === "omit") {
							continue; // Skip this field entirely
						}
					}
					transformed[header] = transformedValue;
					continue;
				}

				// Step 0: Check for null values (before number/boolean parsing)
				if (nullValues !== undefined && nullSet.has(value.toLowerCase())) {
					const nullVal = applyNullRepresentation(nullRepresentation);
					if (nullRepresentation === "omit") {
						continue; // Skip this field entirely
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
		});
	}

	private static detectForcedArrayFields(records: ConvertibleCsvRecord[], arraySuffix: string): Set<string> {
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

	private static normalizeHeaders(records: ConvertibleCsvRecord[], arraySuffix: string): InternalCsvRecord[] {
		if (!arraySuffix) return records as InternalCsvRecord[];

		return records.map(record => {
			const normalized: InternalCsvRecord = {};
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

	private static processGroup(rows: TransformedRecord[], arraySuffix: string, options: CsvParserOptions): NestedObject {
		const result: NestedObject = {};
		for (const row of rows) {
			const rowObj = this.unflatten(row, options);
			this.deepMerge(result, rowObj, arraySuffix);
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
	private static analyzeRowContext(row: TransformedRecord, hierarchy: ForcedArrayHierarchy): RowContext {
		const context: RowContext = {
			populatedPaths: new Set(),
			hasSiblingValues: new Map(),
		};

		// Find all populated paths (normalized flat paths with values)
		for (const [key, value] of Object.entries(row)) {
			if (!this.isEffectivelyEmptyValue(value)) {
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
		rows: TransformedRecord[],
		hierarchy: ForcedArrayHierarchy,
		forcedArrayFields: Set<string>,
		arraySuffix: string,
		options: CsvParserOptions
	): NestedObject {
		if (rows.length === 0) return {};

		// If no forced array fields, use the simple merge
		if (forcedArrayFields.size === 0) {
			return this.processGroup(rows, arraySuffix, options);
		}

		const result: NestedObject = {};
		const mergeState: MergeState = { lastItemByPath: new Map() };

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const isFirstRow = i === 0;
			const unflattened = this.unflatten(row, options);

			if (isFirstRow) {
				// First row: merge normally and track last items for each forced array
				this.deepMergeWithTracking(result, unflattened, "", hierarchy, mergeState, forcedArrayFields, arraySuffix);
			} else {
				// Continuation row: use context-aware merging
				const rowContext = this.analyzeRowContext(row, hierarchy);
				this.contextAwareMerge(
					result,
					unflattened,
					hierarchy,
					rowContext,
					mergeState,
					forcedArrayFields,
					arraySuffix,
					row
				);
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
		forcedArrayFields: Set<string>,
		arraySuffix: string
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
					forcedArrayFields,
					arraySuffix
				);
			} else {
				// Collision on a non-forced path - throw (arrays require the `[]` suffix).
				this.deepMerge(target, { [key]: sourceValue }, arraySuffix, path);
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
		arraySuffix: string,
		flatRow: TransformedRecord
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
			forcedArrayFields,
			arraySuffix
		);
	}

	/**
	 * Check if the only data under this path is in child forced array fields.
	 * Returns false if there are no child forced arrays.
	 */
	private static hasOnlyChildArrayData(
		flatRow: TransformedRecord,
		path: string,
		hierarchy: ForcedArrayHierarchy
	): boolean {
		const prefix = `${path}.`;
		const childArrayPaths = hierarchy.childrenMap.get(path) || new Set<string>();

		// If there are no child forced arrays, return false
		if (childArrayPaths.size === 0) {
			return false;
		}

		let hasAnyData = false;

		for (const [key, value] of Object.entries(flatRow)) {
			if (!key.startsWith(prefix)) continue;
			if (this.isEffectivelyEmptyValue(value)) continue;

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
	private static hasDataUnderPath(flatRow: TransformedRecord, path: string): boolean {
		const prefix = `${path}.`;
		for (const key of Object.keys(flatRow)) {
			if ((key === path || key.startsWith(prefix)) && !this.isEffectivelyEmptyValue(flatRow[key])) {
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
		forcedArrayFields: Set<string>,
		arraySuffix: string
	): void {
		// Handle arrays that need new items (from shallowest to deepest)
		for (const arrayPath of hierarchy.sortedByDepth) {
			if (createNewItemAt.has(arrayPath)) {
				const parentPath = hierarchy.parentMap.get(arrayPath) ?? null;

				// Get the data for this array level from source
				const sourceData = this.getValueAtPath(source, arrayPath);
				if (sourceData === undefined) continue;

				if (parentPath !== null && !createNewItemAt.has(parentPath)) {
					// Parent is an existing item; append to the child array under that parent item,
					// not at the root target path.
					const lastParentItem = this.getLastArrayItemAtPath(target, parentPath, mergeState);
					if (!lastParentItem) continue;

					const relativePath = arrayPath.slice(parentPath.length + 1);
					const nestedArray = this.ensureArrayAtPathRelative(lastParentItem, relativePath);
					const newItem =
						typeof sourceData === "object" && !Array.isArray(sourceData) ? sourceData : { value: sourceData };

					nestedArray.push(newItem as NestedValue);
					mergeState.lastItemByPath.set(arrayPath, newItem as NestedObject);

					if (typeof newItem === "object" && newItem !== null) {
						this.trackLastItems(newItem as NestedObject, arrayPath, mergeState, forcedArrayFields);
					}
					continue;
				}

				if (parentPath === null) {
					// Root-level array - add directly to target.
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
					// Get the last item of the parent array (tracked or resolved from target).
					const lastParentItem = this.getLastArrayItemAtPath(target, parentPath, mergeState);
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
							this.deepMerge(lastItem as NestedObject, sourceData as NestedObject, arraySuffix, arrayPath);
						}
					} else {
						// No last item or last item is not an object - just add
						targetArray.push(sourceData as NestedValue);
					}
				}
			}
		}

		// Handle non-array fields that weren't part of forced arrays
		this.mergeNonArrayFields(target, source, forcedArrayFields, arraySuffix);
	}

	/**
	 * Merge fields that are not part of forced arrays.
	 * Uses deepMerge, which throws on a genuine non-forced collision.
	 */
	private static mergeNonArrayFields(
		target: NestedObject,
		source: NestedObject,
		forcedArrayFields: Set<string>,
		arraySuffix: string
	): void {
		// Filter source to only include paths not under forced array fields
		const filteredSource = this.filterForcedArrayPaths(source, forcedArrayFields, "");

		if (Object.keys(filteredSource).length > 0) {
			this.deepMerge(target, filteredSource, arraySuffix);
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
	 * Resolve the last item for an array path using merge state first,
	 * then fallback to the current target structure.
	 */
	private static getLastArrayItemAtPath(
		target: NestedObject,
		path: string,
		mergeState: MergeState
	): NestedObject | undefined {
		const tracked = mergeState.lastItemByPath.get(path);
		if (tracked) return tracked;

		const valueAtPath = this.getValueAtPath(target, path);
		if (valueAtPath === undefined || valueAtPath === null || typeof valueAtPath !== "object") {
			return undefined;
		}

		if (Array.isArray(valueAtPath)) {
			if (valueAtPath.length === 0) return undefined;
			const lastItem = valueAtPath[valueAtPath.length - 1];
			if (!lastItem || typeof lastItem !== "object" || Array.isArray(lastItem)) {
				return undefined;
			}

			mergeState.lastItemByPath.set(path, lastItem as NestedObject);
			return lastItem as NestedObject;
		}

		mergeState.lastItemByPath.set(path, valueAtPath as NestedObject);
		return valueAtPath as NestedObject;
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

	private static unflatten(row: TransformedRecord, options: CsvParserOptions): NestedObject {
		const result: NestedObject = {};
		const preserveEmptyColumns = options.preserveEmptyColumnAsEmptyString === true;
		const preserveEmptyStrings = options.preserveEmptyString !== false;

		for (const [key, value] of Object.entries(row)) {
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

			const parts = key.split(".");
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

	private static isEffectivelyEmptyValue(value: unknown): boolean {
		return value === "" || value === undefined || value === null || isQuotedEmptyCell(value);
	}

	/**
	 * Merge `source` into `target` for non-forced (`[]`) fields.
	 *
	 * Arrays are never created here: automatic array grouping was removed, so arrays only
	 * come from the forced-array (`[]`) path. Two plain objects are merged recursively.
	 * Any other overlap where the existing leaf already holds a real value is a genuine
	 * collision and throws {@link CsvParseError} — the caller must add the array suffix to
	 * collect repeated values into an array. Overwriting an empty/undefined leaf is allowed
	 * so that sparse continuation rows can fill in blanks.
	 */
	private static deepMerge(target: NestedObject, source: NestedObject, arraySuffix: string, path: string = ""): void {
		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = target[key];
			const currentPath = path ? `${path}.${key}` : key;

			if (!(key in target) || this.isEffectivelyEmptyValue(targetValue)) {
				// Key absent, or existing leaf is empty - assign (fills blanks from continuation rows).
				target[key] = sourceValue;
			} else if (this.isEffectivelyEmptyValue(sourceValue)) {
				// Nothing meaningful to merge in - keep the existing value.
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
				// Both are plain objects - recurse.
				this.deepMerge(targetValue as NestedObject, sourceValue as NestedObject, arraySuffix, currentPath);
			} else {
				// Genuine collision: the same non-forced path has values in multiple rows.
				throw new CsvParseError(
					`Column path '${currentPath}' has multiple values within a single group. ` +
						`Add the array suffix ('${arraySuffix}') to the header to collect repeated values into an array.`
				);
			}
		}
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
