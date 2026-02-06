---
"@cerios/csv-nested-json": patch
---

Fix nested forced arrays producing incorrect nesting levels

**Problem**
When using forced array syntax (e.g., `items[].tags[]`) with continuation rows, nested arrays were being wrapped in extra array levels, producing `[[{...}]]` instead of the expected `[{...}]`.

**Solution**
Implemented hierarchy-aware merging for forced array fields:

- Added `ForcedArrayHierarchy` type to track parent/child relationships between forced array paths
- Added `RowContext` type to analyze which fields have values in each row
- Added `MergeState` type to track the last item added to each forced array for proper appending
- New `buildForcedArrayHierarchy()` method builds a tree structure from forced array paths
- New `analyzeRowContext()` method determines field population per row
- New `processGroupWithHierarchy()` replaces simple merge for forced array scenarios
- New `contextAwareMerge()` decides whether to create new items or append to existing nested arrays

**Behavior**
- When a sibling field has a value → creates a new parent item
- When only child array fields have values → appends to the nested array in the existing parent item
- Supports multi-level nesting (e.g., `items[].tags[].values[]`)
