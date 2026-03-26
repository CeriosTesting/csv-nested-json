---
"@cerios/csv-nested-json": patch
---

Add a new `preserveUnsafeIntegersAsString` option for number auto-parsing.

When enabled together with `autoParseNumbers`, integer strings outside JavaScript's safe integer range are preserved as strings instead of being converted to imprecise numbers.

This keeps existing behavior as the default and provides an opt-in path to prevent precision loss for large integer values in both regular and streaming parsers.
