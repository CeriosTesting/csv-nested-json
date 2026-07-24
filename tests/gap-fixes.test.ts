import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CsvFileReader } from "../src/csv-file-reader";
import { CsvParser } from "../src/csv-parser";
import { CsvStreamParser } from "../src/csv-stream-parser";
import { CsvEncodingError, CsvParseError, CsvValidationError } from "../src/errors";
import { JsonToCsv } from "../src/json-to-csv";
import { JsonToCsvStream } from "../src/json-to-csv-stream";
import type { NestedObject } from "../src/types";

async function streamToCsv(records: NestedObject[], options = {}): Promise<string> {
	const stream = new JsonToCsvStream(options);
	const chunks: string[] = [];
	for (const record of records) {
		stream.write(record);
	}
	stream.end();
	for await (const chunk of stream) {
		chunks.push(String(chunk));
	}
	return chunks.join("");
}

async function collectStream(csv: string, options = {}): Promise<NestedObject[]> {
	const parser = new CsvStreamParser(options);
	const records: NestedObject[] = [];
	for await (const record of Readable.from([csv]).pipe(parser)) {
		records.push(record as NestedObject);
	}
	return records;
}

describe("Gap fixes", () => {
	describe("B1: validationMode parity between buffered and streaming parsers", () => {
		const csvTooMany = `id,name
1,Alice,extra
2,Bob`;

		it("buffered parser throws CsvValidationError on too-many-columns with validationMode 'error'", () => {
			expect(() => CsvParser.parseString(csvTooMany, { validationMode: "error" })).toThrow(CsvValidationError);
		});

		it("streaming parser throws CsvValidationError on too-many-columns with validationMode 'error'", async () => {
			await expect(collectStream(csvTooMany, { validationMode: "error" })).rejects.toThrow(CsvValidationError);
		});

		it("streaming parser reports the same source line number as the buffered parser", async () => {
			let bufferedRow: number | undefined;
			try {
				CsvParser.parseString(csvTooMany, { validationMode: "error" });
			} catch (error) {
				if (error instanceof CsvValidationError) bufferedRow = error.row;
			}

			let streamRow: number | undefined;
			try {
				await collectStream(csvTooMany, { validationMode: "error" });
			} catch (error) {
				if (error instanceof CsvValidationError) streamRow = error.row;
			}

			expect(bufferedRow).toBe(2);
			expect(streamRow).toBe(bufferedRow);
		});

		describe("validationMode 'warn'", () => {
			let warnSpy: ReturnType<typeof vi.spyOn>;
			beforeEach(() => {
				warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			});
			afterEach(() => {
				warnSpy.mockRestore();
			});

			it("streaming parser warns (does not throw) on too-many-columns", async () => {
				await expect(collectStream(csvTooMany, { validationMode: "warn" })).resolves.toBeDefined();
				expect(warnSpy).toHaveBeenCalled();
			});
		});

		it("streaming parser ignores extra columns silently with validationMode 'ignore'", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			await expect(collectStream(csvTooMany, { validationMode: "ignore" })).resolves.toBeDefined();
			expect(warnSpy).not.toHaveBeenCalled();
			warnSpy.mockRestore();
		});
	});

	describe("B2: CsvEncodingError is thrown for unsupported encodings", () => {
		it("readFileSync throws CsvEncodingError for an unknown encoding", () => {
			expect(() =>
				CsvFileReader.readFileSync("whatever.csv", { encoding: "not-an-encoding" as BufferEncoding })
			).toThrow(CsvEncodingError);
		});

		it("readFile (async) rejects with CsvEncodingError for an unknown encoding", async () => {
			await expect(CsvFileReader.readFile("whatever.csv", { encoding: "bogus" as BufferEncoding })).rejects.toThrow(
				CsvEncodingError
			);
		});

		it("readStream rejects with CsvEncodingError for an unknown encoding", async () => {
			await expect(
				CsvFileReader.readStream(Readable.from(["id\n1"]), { encoding: "bogus" as BufferEncoding })
			).rejects.toThrow(CsvEncodingError);
		});

		it("CsvStreamParser constructor throws CsvEncodingError for an unknown encoding", () => {
			expect(() => new CsvStreamParser({ encoding: "bogus" as BufferEncoding })).toThrow(CsvEncodingError);
		});

		it("exposes the offending encoding on the error", () => {
			try {
				CsvFileReader.readFileSync("whatever.csv", { encoding: "bogus" as BufferEncoding });
			} catch (error) {
				expect(error).toBeInstanceOf(CsvEncodingError);
				expect((error as CsvEncodingError).encoding).toBe("bogus");
			}
		});
	});

	describe("B3: RFC-4180 quotes are only special at the start of a field", () => {
		it("treats a quote in the middle of an unquoted field as a literal (does not swallow the delimiter)", () => {
			const rows = CsvParser.parseString(`a,b\nfoo"bar,baz`);
			expect(rows).toEqual([{ a: 'foo"bar', b: "baz" }]);
		});

		it("keeps a properly quoted field containing the delimiter intact", () => {
			const rows = CsvParser.parseString(`a,b\n"x,y",z`);
			expect(rows).toEqual([{ a: "x,y", b: "z" }]);
		});

		it("still handles escaped quotes inside a quoted field", () => {
			const rows = CsvParser.parseString(`a\n"He said ""hi"""`);
			expect(rows).toEqual([{ a: 'He said "hi"' }]);
		});

		it("treats trailing text after a closing quote as literal", () => {
			const rows = CsvParser.parseString(`a\n"ok"trailing`);
			expect(rows).toEqual([{ a: "oktrailing" }]);
		});

		it("streaming parser matches: a literal mid-field quote does not suppress newline splitting", async () => {
			const records = await collectStream(`a,b\nfoo"bar,baz\n1,2`);
			expect(records).toEqual([
				{ a: 'foo"bar', b: "baz" },
				{ a: "1", b: "2" },
			]);
		});

		it("streaming parser still respects newlines inside a properly quoted field", async () => {
			const records = await collectStream(`a,b\n"line1\nline2",z`);
			expect(records).toEqual([{ a: "line1\nline2", b: "z" }]);
		});
	});

	describe("B4: single-character delimiter and quote validation", () => {
		it("buffered parser throws CsvParseError for a multi-character delimiter", () => {
			expect(() => CsvParser.parseString("a,b\n1,2", { delimiter: "||" })).toThrow(CsvParseError);
		});

		it("buffered parser throws CsvParseError for a multi-character quote", () => {
			expect(() => CsvParser.parseString("a,b\n1,2", { quote: "''" })).toThrow(CsvParseError);
		});

		it("throws when delimiter and quote are the same character", () => {
			expect(() => CsvParser.parseString("a,b\n1,2", { delimiter: '"', quote: '"' })).toThrow(CsvParseError);
		});

		it("streaming parser throws CsvParseError for a multi-character delimiter", () => {
			expect(() => new CsvStreamParser({ delimiter: "::" })).toThrow(CsvParseError);
		});

		it("JsonToCsv throws CsvParseError for a multi-character delimiter", () => {
			expect(() => JsonToCsv.stringify([{ a: "1" }], { delimiter: "||" })).toThrow(CsvParseError);
		});

		it("still accepts valid single-character delimiters (tab, pipe, semicolon)", () => {
			expect(CsvParser.parseString("a\tb\n1\t2", { delimiter: "\t" })).toEqual([{ a: "1", b: "2" }]);
			expect(CsvParser.parseString("a|b\n1|2", { delimiter: "|" })).toEqual([{ a: "1", b: "2" }]);
			expect(CsvParser.parseString("a;b\n1;2", { delimiter: ";" })).toEqual([{ a: "1", b: "2" }]);
		});
	});

	describe("C1: too-few-columns validation is opt-in via 'error' mode", () => {
		const csvShort = `a,b,c\n1,2`;

		it("throws in 'error' mode when a row has fewer values than columns", () => {
			expect(() => CsvParser.parseString(csvShort, { validationMode: "error" })).toThrow(CsvValidationError);
		});

		it("stays lenient (pads with empty) in default 'warn' mode", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			expect(CsvParser.parseString(csvShort)).toEqual([{ a: "1", b: "2" }]);
			warnSpy.mockRestore();
		});

		it("streaming parser matches: throws in 'error' mode on too-few columns", async () => {
			await expect(collectStream(csvShort, { validationMode: "error" })).rejects.toThrow(CsvValidationError);
		});
	});

	describe("C2: commentPrefix and trimValues", () => {
		it("skips comment lines interspersed with data (buffered)", () => {
			const csv = `# top comment\nid,name\n1,Alice\n# mid comment\n2,Bob`;
			expect(CsvParser.parseString(csv, { commentPrefix: "#" })).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("skips comment lines (streaming)", async () => {
			const csv = `# top\nid,name\n1,Alice\n#skip me\n2,Bob`;
			const records = await collectStream(csv, { commentPrefix: "#" });
			expect(records).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("trims unquoted values but preserves quoted whitespace (buffered)", () => {
			const csv = `a,b\n  x  ,"  y  "`;
			expect(CsvParser.parseString(csv, { trimValues: true })).toEqual([{ a: "x", b: "  y  " }]);
		});

		it("trims unquoted values but preserves quoted whitespace (streaming)", async () => {
			const csv = `a,b\n  x  ,"  y  "`;
			const records = await collectStream(csv, { trimValues: true });
			expect(records).toEqual([{ a: "x", b: "  y  " }]);
		});

		it("does not treat a '#' inside a quoted field as a comment", () => {
			const csv = `a,b\n"# not a comment",2`;
			expect(CsvParser.parseString(csv, { commentPrefix: "#" })).toEqual([{ a: "# not a comment", b: "2" }]);
		});
	});

	describe("C3: streaming JSON -> CSV", () => {
		it("matches JsonToCsv.stringify for uniform records (headers from first object)", async () => {
			const records: NestedObject[] = [
				{ id: "1", name: "Alice", address: { city: "NYC" } },
				{ id: "2", name: "Bob", address: { city: "LA" } },
			];
			const streamed = await streamToCsv(records);
			expect(streamed).toBe(JsonToCsv.stringify(records));
		});

		it("round-trips back through the parser", async () => {
			const records: NestedObject[] = [
				{ id: "1", tags: ["a", "b"] },
				{ id: "2", tags: ["c"] },
			];
			const csv = await streamToCsv(records);
			expect(CsvParser.parseString(csv)).toEqual(records);
		});

		it("honors explicit columns and can omit the header row", async () => {
			const records: NestedObject[] = [{ id: "1", name: "Alice" }];
			const csv = await streamToCsv(records, { columns: ["id", "name"], includeHeader: false });
			expect(csv).toBe("1,Alice");
		});

		it("emits only the header row for an empty stream with explicit columns", async () => {
			const csv = await streamToCsv([], { columns: ["id", "name"] });
			expect(csv).toBe("id,name");
		});

		it("validates the delimiter", async () => {
			await expect(streamToCsv([{ a: "1" }], { delimiter: "||" })).rejects.toThrow(CsvParseError);
		});
	});

	describe("D1: JsonToCsv nullValue round-trip fidelity", () => {
		it("defaults to '' for null (unchanged behavior)", () => {
			expect(JsonToCsv.stringify([{ id: "1", note: null }])).toBe("id,note\n1,");
		});

		it("emits a distinct token for null when nullValue is set", () => {
			expect(JsonToCsv.stringify([{ id: "1", note: null }], { nullValue: "\\N" })).toBe("id,note\n1,\\N");
		});

		it("keeps a genuinely missing value as an empty cell, distinct from null", () => {
			// Headers are emitted sorted (primary keys alphabetically): a, b, id.
			const csv = JsonToCsv.stringify(
				[
					{ id: "1", a: null },
					{ id: "2", b: "x" },
				],
				{ nullValue: "NULL" }
			);
			// Row 1: a is null -> NULL, b missing -> empty; Row 2: a missing -> empty, b -> x.
			expect(csv).toBe("a,b,id\nNULL,,1\n,x,2");
		});

		it("applies nullValue inside continuation-row arrays", () => {
			const csv = JsonToCsv.stringify([{ id: "1", tags: ["a", null] }], { nullValue: "NULL" });
			expect(csv).toBe("id,tags[]\n1,a\n,NULL");
		});
	});
});
