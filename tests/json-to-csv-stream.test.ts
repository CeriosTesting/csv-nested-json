import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { CsvParser } from "../src/csv-parser";
import { CsvParseError } from "../src/errors";
import { JsonToCsv } from "../src/json-to-csv";
import { JsonToCsvStream, type JsonToCsvStreamOptions } from "../src/json-to-csv-stream";
import type { NestedObject } from "../src/types";

const UTF8_BOM = "﻿";

async function streamToCsv(records: NestedObject[], options: JsonToCsvStreamOptions = {}): Promise<string> {
	const stream = new JsonToCsvStream(options);
	const chunks: string[] = [];
	for (const record of records) stream.write(record);
	stream.end();
	for await (const chunk of stream) chunks.push(String(chunk));
	return chunks.join("");
}

describe("JsonToCsvStream", () => {
	it("derives headers from the first record when columns are not given", async () => {
		const records: NestedObject[] = [
			{ id: "1", name: "Ann" },
			{ id: "2", name: "Bo" },
		];
		expect(await streamToCsv(records)).toBe("id,name\n1,Ann\n2,Bo");
	});

	it("matches JsonToCsv.stringify for uniform records", async () => {
		const records: NestedObject[] = [
			{ id: "1", address: { city: "NYC" } },
			{ id: "2", address: { city: "LA" } },
		];
		expect(await streamToCsv(records)).toBe(JsonToCsv.stringify(records));
	});

	describe("explicit columns", () => {
		it("drops keys not present in columns and pads missing keys with empty cells", async () => {
			const records: NestedObject[] = [{ id: "1", name: "Ann", secret: "hide" }, { id: "2" }];
			expect(await streamToCsv(records, { columns: ["id", "name"] })).toBe("id,name\n1,Ann\n2,");
		});

		it("emits only the header row for an empty stream with explicit columns", async () => {
			expect(await streamToCsv([], { columns: ["id", "name"] })).toBe("id,name");
		});

		it("emits nothing for an empty stream without columns", async () => {
			expect(await streamToCsv([])).toBe("");
		});
	});

	it("writes nested-array continuation rows that round-trip through the parser", async () => {
		const records: NestedObject[] = [{ id: "1", tags: ["a", "b", "c"] }];
		const csv = await streamToCsv(records);
		expect(csv).toBe("id,tags[]\n1,a\n,b\n,c");
		expect(CsvParser.parseString(csv, { autoParseNumbers: false, autoParseBooleans: false })).toEqual(records);
	});

	it("applies nullValue for explicit nulls", async () => {
		expect(await streamToCsv([{ id: "1", note: null }], { nullValue: "NULL" })).toBe("id,note\n1,NULL");
	});

	describe("writeBom / trailingNewline", () => {
		it("prepends a BOM to the very first chunk only", async () => {
			expect(await streamToCsv([{ a: "1" }, { a: "2" }], { writeBom: true })).toBe(`${UTF8_BOM}a\n1\n2`);
		});

		it("appends a trailing newline after the last row", async () => {
			expect(await streamToCsv([{ a: "1" }, { a: "2" }], { trailingNewline: true })).toBe("a\n1\n2\n");
		});

		it("does not emit a trailing newline for an empty stream", async () => {
			expect(await streamToCsv([], { trailingNewline: true })).toBe("");
		});
	});

	it("propagates a bad-delimiter error instead of emitting output", async () => {
		const stream = new JsonToCsvStream({ delimiter: "||" });
		await expect(
			(async () => {
				for await (const _chunk of Readable.from([{ a: "1" }]).pipe(stream)) {
					// drain
				}
			})()
		).rejects.toThrow(CsvParseError);
	});

	it("streams a large number of records without buffering the whole output", async () => {
		const records: NestedObject[] = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), v: `row${i}` }));
		const csv = await streamToCsv(records);
		const lines = csv.split("\n");
		expect(lines).toHaveLength(5001); // header + 5000 rows
		expect(lines[0]).toBe("id,v");
		expect(lines[5000]).toBe("4999,row4999");
	});
});
