import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { CsvParser, CsvStreamParser, JsonToCsv } from "../src";
import type { NestedObject } from "../src/types";

// =============================================================================
// #1 - `limit` option in the non-streaming parser
// =============================================================================
describe("limit option (non-streaming parser)", () => {
	const rows = (n: number) => `id,name\n${Array.from({ length: n }, (_, i) => `${i + 1},name${i + 1}`).join("\n")}`;

	it("caps the number of records returned by parseString", () => {
		const result = CsvParser.parseString(rows(10), { limit: 3 });
		expect(result).toHaveLength(3);
		expect(result.map(r => (r as { id: string }).id)).toEqual(["1", "2", "3"]);
	});

	it("treats limit as a count of output records, not raw rows (continuation rows)", () => {
		const csv = "id,tags[]\n1,a\n,b\n,c\n2,d\n3,e";
		// limit: 2 => first two grouped records; the multi-row group counts as one.
		const result = CsvParser.parseString(csv, { limit: 2 });
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ id: "1", tags: ["a", "b", "c"] });
		// `tags[]` is a forced array, so the single-value group is a one-element array.
		expect(result[1]).toEqual({ id: "2", tags: ["d"] });
	});

	it("applies limit after rowFilter", () => {
		const csv = "id,active\n1,false\n2,true\n3,true\n4,true";
		const result = CsvParser.parseString(csv, {
			rowFilter: record => record.active === "true",
			limit: 2,
		});
		expect(result).toHaveLength(2);
		expect(result.map(r => (r as { id: string }).id)).toEqual(["2", "3"]);
	});

	it("treats limit: 0 as no limit", () => {
		const result = CsvParser.parseString(rows(5), { limit: 0 });
		expect(result).toHaveLength(5);
	});

	it("returns all records when limit exceeds available records", () => {
		const result = CsvParser.parseString(rows(3), { limit: 100 });
		expect(result).toHaveLength(3);
	});

	it("matches the streaming parser's limit semantics", async () => {
		const csv = rows(10);
		const sync = CsvParser.parseString(csv, { limit: 4 });
		const streamed = await CsvStreamParser.parseStream(Readable.from([csv]), { limit: 4 });
		expect(streamed).toHaveLength(4);
		expect(streamed).toEqual(sync);
	});
});

// =============================================================================
// #2 - custom quote character escaping in JsonToCsv
// =============================================================================
describe("JsonToCsv custom quote escaping", () => {
	it("escapes a regex-special quote character literally", () => {
		const data: NestedObject[] = [{ id: "1", note: "a.b.c" }];
		// Using "." as the quote char must not be treated as a regex wildcard.
		const csv = JsonToCsv.stringify(data, { quote: ".", delimiter: "," });
		// The note contains the delimiter? no; it contains the quote char "." so it must be quoted.
		const lines = csv.split("\n");
		expect(lines[0]).toBe("id,note");
		// Each "." in the value is doubled, whole field wrapped in "."
		expect(lines[1]).toBe("1,.a..b..c.");
	});

	it("round-trips a value containing a regex-special quote char", () => {
		const data: NestedObject[] = [{ id: "1", note: "1|2|3" }];
		const csv = JsonToCsv.stringify(data, { quote: "|", delimiter: ";" });
		const parsed = CsvParser.parseString(csv, { quote: "|", delimiter: ";" });
		expect(parsed[0]).toEqual({ id: "1", note: "1|2|3" });
	});

	it("still escapes the default double-quote correctly", () => {
		const data: NestedObject[] = [{ id: "1", note: 'say "hi"' }];
		const csv = JsonToCsv.stringify(data);
		expect(csv.split("\n")[1]).toBe('1,"say ""hi"""');
	});
});

// =============================================================================
// #3 - Date serialization in JsonToCsv (autoParseDates removed)
// =============================================================================
describe("JsonToCsv Date serialization", () => {
	it("serializes a Date to a clean ISO string (no wrapping quotes)", () => {
		const data: NestedObject[] = [{ id: "1", created: new Date("2024-01-15T00:00:00.000Z") }];
		const csv = JsonToCsv.stringify(data);
		const [header, row] = csv.split("\n");
		expect(header.split(",").sort()).toEqual(["created", "id"]);
		// The ISO string appears unquoted (not JSON-wrapped in double-quotes).
		expect(row).toContain("2024-01-15T00:00:00.000Z");
		expect(row).not.toContain('"');
	});

	it("round-trips a valueTransformer-produced Date via ISO string", () => {
		const source = "id,created\n1,2024-01-15T00:00:00.000Z";
		const parsed = CsvParser.parseString(source, {
			valueTransformer: (value, header) =>
				header === "created" && typeof value === "string" ? new Date(value) : value,
		});
		expect((parsed[0] as { created: Date }).created).toBeInstanceOf(Date);

		const csv = JsonToCsv.stringify(parsed as NestedObject[]);
		// Re-parsing the produced CSV yields the same ISO string value.
		const reparsed = CsvParser.parseString(csv);
		expect(reparsed[0]).toEqual({ id: "1", created: "2024-01-15T00:00:00.000Z" });
	});

	it("serializes an invalid Date to an empty field", () => {
		const data: NestedObject[] = [{ id: "1", created: new Date("not-a-date") }];
		const csv = JsonToCsv.stringify(data);
		const [, row] = csv.split("\n");
		// created sorts before id; invalid date becomes empty.
		expect(row).toBe(",1");
	});
});

// =============================================================================
// #4 - streaming parser multibyte characters split across chunk boundaries
// =============================================================================
describe("CsvStreamParser multibyte decoding", () => {
	it("reassembles a multibyte character split across two Buffer chunks", async () => {
		const csv = "id,name\n1,café€\n";
		const full = Buffer.from(csv, "utf-8");

		// Split at a byte boundary that lands in the middle of the € (3-byte) sequence.
		const euroStart = Buffer.from("id,name\n1,café", "utf-8").length;
		const splitAt = euroStart + 1;
		const first = full.subarray(0, splitAt);
		const second = full.subarray(splitAt);

		const stream = Readable.from([first, second]);
		const records = await CsvStreamParser.parseStream<{ id: string; name: string }>(stream);

		expect(records).toHaveLength(1);
		expect(records[0].name).toBe("café€");
	});
});

// =============================================================================
// #6 - stricter number auto-parsing
// =============================================================================
describe("autoParseNumbers strictness", () => {
	const parseValue = (raw: string) =>
		(CsvParser.parseString(`id,v\n1,${raw}`, { autoParseNumbers: true })[0] as { v: unknown }).v;

	it("parses plain decimal and float values", () => {
		expect(parseValue("42")).toBe(42);
		expect(parseValue("3.14")).toBe(3.14);
		expect(parseValue("-7")).toBe(-7);
	});

	it("does not parse hex, binary or octal literals", () => {
		expect(parseValue("0x1F")).toBe("0x1F");
		expect(parseValue("0b101")).toBe("0b101");
		expect(parseValue("0o17")).toBe("0o17");
	});

	it("does not parse exponent-like or leading-plus or whitespace-padded values", () => {
		expect(parseValue("+5")).toBe("+5");
		expect(parseValue(" 42 ")).toBe(" 42 ");
	});

	it("parses valid scientific notation", () => {
		expect(parseValue("1e3")).toBe(1000);
	});

	it("keeps leading-zero codes as strings", () => {
		expect(parseValue("007")).toBe("007");
		expect(parseValue("00123")).toBe("00123");
	});

	it("applies the same rules in the streaming parser", async () => {
		const stream = Readable.from(["id,v\n1,0x1F\n2,42"]);
		const records = await CsvStreamParser.parseStream<{ id: string; v: unknown }>(stream, {
			autoParseNumbers: true,
		});
		expect(records[0].v).toBe("0x1F");
		expect(records[1].v).toBe(42);
	});
});

// =============================================================================
// #7 - nullValues is opt-in (documented behavior)
// =============================================================================
describe("nullValues opt-in behavior", () => {
	it("keeps 'null' strings untouched when nullValues is not provided", () => {
		const result = CsvParser.parseString("id,name\n1,null");
		expect(result[0]).toEqual({ id: "1", name: "null" });
	});

	it("detects nulls only when nullValues is provided", () => {
		const result = CsvParser.parseString("id,name\n1,null", { nullValues: ["null"] });
		expect(result[0]).not.toHaveProperty("name");
	});
});
