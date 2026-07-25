# Migration Guide: v1 → v2

Version 2.0 refocuses `@cerios/csv-nested-json` on faithful CSV → nested JSON
conversion. It makes type coercion the default, requires arrays to be declared
explicitly, tightens RFC 4180 compliance, and removes the in-parser
transformation hooks in favor of doing that work on the parsed result.

This guide lists every breaking change with a **Before → After** for the code
you are most likely to have. If you use only `CsvParser.parseFileSync(path)` /
`parseString(csv)` with default options, the two things most likely to affect
you are **[type coercion is now on by default](#1-type-coercion-is-on-by-default)**
and **[arrays require the `[]` suffix](#2-arrays-require-the--suffix)**.

## At a glance

| Area                                                                  | v1 behavior                                              | v2 behavior                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Number/boolean coercion                                               | Off by default (strings)                                 | **On by default** — pass `false` to opt out                 |
| Arrays                                                                | Auto-detected from repeated columns in continuation rows | **Require the `[]` header suffix**; repeats otherwise throw |
| `valueTransformer`, `headerTransformer`, `rowFilter`, `defaultValues` | Supported                                                | **Removed** — transform the result instead                  |
| `autoParseDates`                                                      | Supported                                                | **Removed** — dates stay strings; convert after parsing     |
| `autoParseNumbers`                                                    | Coerced hex/octal/`+5`/padded values                     | **Stricter** — only plain decimal/float/scientific          |
| Mid-field quotes                                                      | A `"` anywhere could open a quoted region                | **Quote is only special at field start** (RFC 4180)         |
| `delimiter` / `quote`                                                 | Multi-char values silently mis-parsed                    | **Must be single, distinct characters** or throws           |
| `CsvStreamParser` validation                                          | Did not validate column counts                           | **Validates column counts** like the buffered parser        |
| `JsonToCsv` (`arrayMode: "rows"`)                                     | Array headers had no suffix                              | **Emits the `[]` suffix** so output re-parses into arrays   |

---

## 1. Type coercion is on by default

`autoParseNumbers` and `autoParseBooleans` now both default to `true`. Numeric
and boolean-looking strings are coerced automatically.

```ts
// v1: values stayed strings unless you opted in
CsvParser.parseString("id,active\n1,true");
// -> [{ id: "1", active: "true" }]

// v2: coerced by default
CsvParser.parseString("id,active\n1,true");
// -> [{ id: 1, active: true }]
```

**To keep the v1 behavior** (everything as strings), opt out explicitly:

```ts
CsvParser.parseString(csv, {
	autoParseNumbers: false,
	autoParseBooleans: false,
});
```

Leading-zero strings (e.g. `"007"`) are still preserved as strings, and — with
`preserveUnsafeIntegersAsString: true` — integers outside JavaScript's safe
range stay strings as well.

## 2. Arrays require the `[]` suffix

Automatic array grouping was removed. Values are no longer silently collapsed
into an array when the same column repeats across continuation rows. You must
mark array columns explicitly with the `[]` suffix.

```csv
# v1 auto-detected this as an array:
id,tags
1,a
,b
# -> { id: "1", tags: ["a", "b"] }
```

```csv
# v2 requires the [] suffix:
id,tags[]
1,a
,b
# -> { id: "1", tags: ["a", "b"] }
```

Use `[]` on each array path, including nested ones (`phones[].type`,
`phones[].number`). Continuation rows (empty identifier column) still group with
the previous record: they append to `[]` arrays and fill in blank scalar fields.

> **Now throws:** if a non-`[]` column has a value in more than one row of the
> same continuation group, v2 throws `CsvParseError` instead of guessing an
> array. Add the `[]` suffix to make the intent explicit.

## 3. Transform-family options were removed

`valueTransformer`, `headerTransformer`, `rowFilter`, and `defaultValues` — and
the exported types `ValueTransformer`, `HeaderTransformer`, and `RowFilter` —
were removed. Do the equivalent work on the parsed array.

```ts
// v1
const result = CsvParser.parseString(csv, {
	valueTransformer: (value, header) => (header === "price" ? Number(value) * 100 : value),
	rowFilter: row => row.active === "true",
	defaultValues: { role: "user" },
});

// v2 — transform after parsing
const result = CsvParser.parseString(csv)
	.filter(row => row.active === true)
	.map(row => ({
		role: "user",
		...row,
		price: typeof row.price === "number" ? row.price * 100 : row.price,
	}));
```

`columnMapping` is **retained** for renaming columns, but it now maps the **raw
CSV header names** directly (in v1 it ran _after_ a `headerTransformer`).

```ts
CsvParser.parseString(csv, {
	columnMapping: { user_id: "id", first_name: "firstName" },
});
```

## 4. `autoParseDates` was removed

`Date.parse` recognition was too loose and locale-dependent (and was the root
cause of mangled dates during JSON→CSV conversion). Date-looking strings are now
kept as plain strings. Convert them yourself after parsing:

```ts
// v1
CsvParser.parseString(csv, { autoParseDates: true });

// v2 — convert the columns you know are dates
const rows = CsvParser.parseString(csv).map(r => ({
	...r,
	createdAt: new Date(r.createdAt as string),
}));
```

## 5. `autoParseNumbers` is stricter

Only plain decimal, float, and scientific-notation values are converted now.
The following are **preserved as strings** in v2 (v1 coerced them):

| Input    | v1   | v2 (string) |
| -------- | ---- | ----------- |
| `0x1F`   | `31` | `"0x1F"`    |
| `0b101`  | `5`  | `"0b101"`   |
| `0o17`   | `15` | `"0o17"`    |
| `+5`     | `5`  | `"+5"`      |
| `" 42 "` | `42` | `" 42 "`    |

Plain values like `42`, `-3.14`, and `6.022e23` still coerce. Leading-zero codes
(e.g. `007`) continue to be preserved as strings.

## 6. Quotes are only special at the start of a field (RFC 4180)

A quote character now only opens a quoted region at the **start of a field**. A
quote in the middle of an unquoted field is treated as a literal character, so a
following delimiter is no longer swallowed.

```ts
// input: foo"bar,baz
// v1: the " opened a quoted region and the comma was swallowed
// v2: -> ["foo\"bar", "baz"]  (the " is literal, comma still splits)
```

Properly quoted fields, escaped `""`, and quoted newlines are unchanged. If you
relied on the old lenient behavior, quote the whole field:
`"foo""bar",baz`.

## 7. `delimiter` and `quote` must be single, distinct characters

A multi-character `delimiter` or `quote` now throws `CsvParseError` instead of
silently mis-parsing, and the two must differ from each other.

```ts
// v1: silently mis-parsed
CsvParser.parseString(csv, { delimiter: "||" });

// v2: throws CsvParseError — use a single character
CsvParser.parseString(csv, { delimiter: "|" });
```

## 8. `CsvStreamParser` now validates column counts

`CsvStreamParser` now applies the same validation as the buffered `CsvParser`:

- In `validationMode: "error"`, a row with **too many** columns throws
  `CsvValidationError` (v1 ignored this in the stream).
- In `validationMode: "error"`, both parsers now throw on rows with **fewer**
  values than headers.
- `"warn"` / `"ignore"` stay lenient and pad short rows with empty values.

If you stream files with ragged rows and want the old lenient stream behavior,
use `validationMode: "warn"` (the default) or `"ignore"`.

## 9. `JsonToCsv` (`arrayMode: "rows"`) emits the `[]` suffix

In `arrayMode: "rows"`, array columns are now written with the array suffix in
the header (e.g. `tags[]`, `phones[].type`) so the output re-parses back into
arrays with v2's explicit-array rules. The suffix is configurable via the new
`arraySuffixIndicator` option (default `"[]"`). `arrayMode: "json"` output is
unchanged.

```ts
JsonToCsv.stringify([{ id: 1, tags: ["a", "b"] }]);
// v1 header: id,tags
// v2 header: id,tags[]
```

If a downstream consumer expects the old suffix-free headers, either switch to
`arrayMode: "json"` or set explicit `columns` without the suffix (note that
suffix-free array headers will **not** round-trip back into arrays under v2).

---

## Behavioral fixes worth knowing (not opt-in)

These are bug fixes, but they change output for affected inputs:

- **`limit` is now respected by the buffered parser.** `parseString` /
  `parseFileSync` / `parseFile` previously ignored `limit` and returned all
  records; they now cap output records (without splitting a continuation group).
- **`JsonToCsv` handles a custom `quote` and `Date` values correctly.**
  Regex-special quote characters no longer corrupt output; `Date` values are
  emitted as ISO strings (invalid dates as an empty field) and are no longer
  dropped.
- **`CsvStreamParser` no longer corrupts multibyte UTF-8** characters that span
  chunk boundaries.
- **`CsvEncodingError` is now actually thrown** for unknown encodings (it was
  exported and documented but never raised).
- **`nullValues` is opt-in and fully replaces the built-in set** — null
  detection runs only when you provide the option.

## New in v2 (non-breaking, for reference)

You don't need to change anything for these, but they may replace patterns you
built around v1's limitations:

- **`*Safe` methods** — `parseStringSafe`, `parseFileSyncSafe`, `parseFileSafe`,
  `parseStreamSafe` return `{ data, errors }` and collect per-row errors instead
  of throwing on the first bad row.
- **`offset`** parser option — skip N records; composes with `limit` for
  pagination.
- **`commentPrefix`**, **`trimValues`**, **`trimLeadingSpace`** parser options.
- **`JsonToCsvStream`** — streaming JSON→CSV writer for large arrays.
- **`JsonToCsv`** options: `columns`, `sortHeaders`, `quoteAll`, `writeBom`,
  `trailingNewline`, `nullValue`.

---

## Upgrade checklist

1. If you depend on values staying strings, add
   `autoParseNumbers: false, autoParseBooleans: false`.
2. Add the `[]` suffix to every array column in your CSV headers (and in
   `JsonToCsv` `columns`, if you pin them).
3. Replace `valueTransformer` / `headerTransformer` / `rowFilter` /
   `defaultValues` with `.map()` / `.filter()` on the result.
4. Replace `autoParseDates: true` with a post-parse `.map()` that constructs
   `Date`s for the columns you know are dates.
5. Audit any reliance on hex/octal/`+5`/whitespace-padded numbers being coerced.
6. Ensure `delimiter` and `quote` are single, distinct characters.
7. If you stream ragged rows in `validationMode: "error"`, expect it to throw
   now — switch to `"warn"`/`"ignore"` if you want leniency.
8. Re-check any `JsonToCsv` (`arrayMode: "rows"`) consumers for the new `[]`
   header suffix.
