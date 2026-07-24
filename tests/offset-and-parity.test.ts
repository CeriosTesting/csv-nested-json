import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { CsvParser } from "../src/csv-parser";
import { CsvStreamParser } from "../src/csv-stream-parser";
import type { CsvParserOptions, NestedObject } from "../src/types";

async function collectStream(csv: string, options: CsvParserOptions = {}): Promise<NestedObject[]> {
	const parser = new CsvStreamParser(options);
	const records: NestedObject[] = [];
	for await (const record of Readable.from([csv]).pipe(parser)) {
		records.push(record as NestedObject);
	}
	return records;
}

describe("offset (pagination)", () => {
	const csv = `id,name\n1,a\n2,b\n3,c\n4,d\n5,e`;

	it("skips the first N output records (buffered)", () => {
		expect(CsvParser.parseString(csv, { offset: 2 })).toEqual([
			{ id: "3", name: "c" },
			{ id: "4", name: "d" },
			{ id: "5", name: "e" },
		]);
	});

	it("composes offset + limit into a window (buffered)", () => {
		expect(CsvParser.parseString(csv, { offset: 1, limit: 2 })).toEqual([
			{ id: "2", name: "b" },
			{ id: "3", name: "c" },
		]);
	});

	it("returns an empty array when offset exceeds the record count", () => {
		expect(CsvParser.parseString(csv, { offset: 99 })).toEqual([]);
	});

	it("ignores non-positive offsets", () => {
		expect(CsvParser.parseString(csv, { offset: 0 })).toHaveLength(5);
		expect(CsvParser.parseString(csv, { offset: -3 })).toHaveLength(5);
	});

	it("counts grouped output records, not raw rows (offset with continuation rows)", () => {
		const grouped = `id,tags[]\n1,a\n,b\n2,c\n3,d`;
		expect(CsvParser.parseString(grouped, { offset: 1 })).toEqual([
			{ id: "2", tags: ["c"] },
			{ id: "3", tags: ["d"] },
		]);
	});

	describe("streaming parity", () => {
		for (const options of [{ offset: 2 }, { limit: 2 }, { offset: 1, limit: 2 }, { offset: 99 }, { offset: 3 }]) {
			it(`buffered and streaming agree for ${JSON.stringify(options)}`, async () => {
				const buffered = CsvParser.parseString(csv, options);
				const streamed = await collectStream(csv, options);
				expect(streamed).toEqual(buffered);
			});
		}
	});
});

describe("buffered vs streaming parity", () => {
	const cases: { name: string; csv: string; options?: CsvParserOptions }[] = [
		{ name: "flat scalars", csv: `id,name\n1,Ann\n2,Bo` },
		{ name: "dot-notation nesting", csv: `id,person.name,person.city\n1,Ann,NYC\n2,Bo,LA` },
		{
			name: "single forced array via continuation rows",
			csv: `id,tags[]\n1,a\n,b\n,c\n2,x`,
		},
		{
			name: "nested object inside forced array",
			csv: `id,items[].sku,items[].qty\n1,A,2\n,B,3\n2,C,1`,
		},
		{
			name: "3-level forced array hierarchy",
			csv: `id,order[].item[].name,order[].item[].tag[]\n1,widget,red\n,,blue\n,gadget,green`,
		},
		{ name: "quoted newlines", csv: `id,note\n1,"line1\nline2"\n2,plain` },
		{
			name: "comments and blank lines",
			csv: `# header follows\nid,name\n1,Ann\n\n2,Bo`,
			options: { commentPrefix: "#" },
		},
		{ name: "trimValues", csv: `a,b\n  x  ,"  y  "\n z , w `, options: { trimValues: true } },
		{
			name: "auto-parse numbers and booleans",
			csv: `id,active,score\n1,true,95.5\n2,false,0`,
			options: { autoParseNumbers: true, autoParseBooleans: true },
		},
	];

	for (const { name, csv, options } of cases) {
		it(`produces identical output for: ${name}`, async () => {
			const buffered = CsvParser.parseString(csv, options);
			const streamed = await collectStream(csv, options);
			expect(streamed).toEqual(buffered);
		});
	}
});

describe("preserveUnsafeIntegersAsString boundary", () => {
	const parse = (value: string, opts: CsvParserOptions) => CsvParser.parseString(`n\n${value}`, opts)[0].n;

	it("keeps integers just above MAX_SAFE_INTEGER as strings", () => {
		// 2^53 + 1 cannot be represented exactly as a JS number.
		expect(parse("9007199254740993", { autoParseNumbers: true, preserveUnsafeIntegersAsString: true })).toBe(
			"9007199254740993"
		);
	});

	it("keeps large negative unsafe integers as strings", () => {
		expect(parse("-9007199254740993", { autoParseNumbers: true, preserveUnsafeIntegersAsString: true })).toBe(
			"-9007199254740993"
		);
	});

	it("still parses MAX_SAFE_INTEGER itself as a number", () => {
		expect(
			parse(String(Number.MAX_SAFE_INTEGER), { autoParseNumbers: true, preserveUnsafeIntegersAsString: true })
		).toBe(Number.MAX_SAFE_INTEGER);
	});

	it("does not apply to floats (only whole integers are preserved)", () => {
		// A float is coerced normally even when it loses precision.
		expect(parse("1.5", { autoParseNumbers: true, preserveUnsafeIntegersAsString: true })).toBe(1.5);
	});

	it("loses precision without the option (documents the default)", () => {
		expect(parse("9007199254740993", { autoParseNumbers: true })).toBe(9007199254740992);
	});
});
