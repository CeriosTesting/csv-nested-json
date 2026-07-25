import { describe, expect, it } from "vitest";

import { CsvParser } from "../src/csv-parser";
import { JsonToCsv } from "../src/json-to-csv";
import type { NestedObject } from "../src/types";

const UTF8_BOM = "﻿";

describe("JsonToCsv output options", () => {
	describe("columns (explicit header order/subset)", () => {
		const data: NestedObject[] = [{ b: "2", a: "1", c: "3" }];

		it("uses the provided columns in the given order", () => {
			expect(JsonToCsv.stringify(data, { columns: ["c", "a", "b"] })).toBe("c,a,b\n3,1,2");
		});

		it("subsets to only the listed columns (extra keys dropped)", () => {
			expect(JsonToCsv.stringify(data, { columns: ["a"] })).toBe("a\n1");
		});

		it("emits empty cells for listed columns missing from a record", () => {
			expect(JsonToCsv.stringify([{ a: "1" }], { columns: ["a", "missing"] })).toBe("a,missing\n1,");
		});

		it("honors the array suffix in explicit columns for round-trippable arrays", () => {
			const csv = JsonToCsv.stringify([{ id: "1", tags: ["x", "y"] }], { columns: ["id", "tags[]"] });
			expect(csv).toBe("id,tags[]\n1,x\n,y");
			expect(CsvParser.parseString(csv)).toEqual([{ id: 1, tags: ["x", "y"] }]);
		});
	});

	describe("sortHeaders", () => {
		const data: NestedObject[] = [{ b: "2", a: "1", nested: { z: "9", a: "8" } }];

		it("sorts headers by depth then alphabetically by default", () => {
			expect(JsonToCsv.stringify(data)).toBe("a,b,nested.a,nested.z\n1,2,8,9");
		});

		it("preserves first-seen insertion order when sortHeaders is false", () => {
			expect(JsonToCsv.stringify(data, { sortHeaders: false })).toBe("b,a,nested.z,nested.a\n2,1,9,8");
		});

		it("unions keys across records in first-seen order when unsorted", () => {
			const csv = JsonToCsv.stringify([{ a: "1" }, { a: "2", b: "3" }], { sortHeaders: false });
			expect(csv).toBe("a,b\n1,\n2,3");
		});
	});

	describe("quoteAll", () => {
		it("wraps every field (including empty cells) in quotes", () => {
			expect(JsonToCsv.stringify([{ a: "1", b: "" }], { quoteAll: true })).toBe('"a","b"\n"1",""');
		});

		it("still escapes embedded quotes when quoteAll is on", () => {
			expect(JsonToCsv.stringify([{ a: 'x"y' }], { quoteAll: true })).toBe('"a"\n"x""y"');
		});
	});

	describe("writeBom", () => {
		it("prepends a UTF-8 BOM to the output", () => {
			expect(JsonToCsv.stringify([{ a: "1" }], { writeBom: true })).toBe(`${UTF8_BOM}a\n1`);
		});

		it("re-parses cleanly because the parser strips the BOM by default", () => {
			const csv = JsonToCsv.stringify([{ a: "1" }], { writeBom: true });
			expect(CsvParser.parseString(csv)).toEqual([{ a: 1 }]);
		});
	});

	describe("trailingNewline", () => {
		it("appends a final line ending when enabled", () => {
			expect(JsonToCsv.stringify([{ a: "1" }], { trailingNewline: true })).toBe("a\n1\n");
		});

		it("respects a custom line ending for the trailing newline", () => {
			expect(JsonToCsv.stringify([{ a: "1" }], { trailingNewline: true, lineEnding: "\r\n" })).toBe("a\r\n1\r\n");
		});

		it("does not append a trailing newline by default", () => {
			expect(JsonToCsv.stringify([{ a: "1" }])).toBe("a\n1");
		});
	});

	describe("round-trip fidelity", () => {
		const records: NestedObject[] = [
			{ id: "1", person: { name: "Ann", city: "NYC" }, tags: ["a", "b"], note: null },
			{ id: "2", person: { name: "Bo", city: "LA" }, tags: ["c"], note: "x" },
		];

		it("parse(stringify(x)) reproduces x in rows array mode with a null token", () => {
			const csv = JsonToCsv.stringify(records, { nullValue: "\\N" });
			const parsed = CsvParser.parseString(csv, {
				nullValues: ["\\N"],
				nullRepresentation: "null",
				autoParseNumbers: false,
				autoParseBooleans: false,
			});
			expect(parsed).toEqual(records);
		});

		it("explicit columns preserve order through a round-trip", () => {
			const columns = ["id", "note", "person.name", "person.city", "tags[]"];
			const csv = JsonToCsv.stringify(records, { columns, nullValue: "\\N" });
			expect(csv.split("\n")[0]).toBe(columns.join(","));
			const parsed = CsvParser.parseString(csv, {
				nullValues: ["\\N"],
				nullRepresentation: "null",
				autoParseNumbers: false,
				autoParseBooleans: false,
			});
			expect(parsed).toEqual(records);
		});
	});
});
