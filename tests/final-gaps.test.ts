import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CsvParser } from "../src/csv-parser";
import { CsvStreamParser } from "../src/csv-stream-parser";
import type { NestedObject } from "../src/types";

async function collectStream(csv: string, options = {}): Promise<NestedObject[]> {
	const parser = new CsvStreamParser(options);
	const records: NestedObject[] = [];
	for await (const record of Readable.from([csv]).pipe(parser)) {
		records.push(record as NestedObject);
	}
	return records;
}

describe("Final gaps", () => {
	describe("trimLeadingSpace: quote after leading spaces opens the field", () => {
		it("buffered: strips the leading space and treats the quote as field-opening", () => {
			expect(CsvParser.parseString(`note\n "hi"`, { trimLeadingSpace: true })).toEqual([{ note: "hi" }]);
		});

		it("buffered: a delimiter inside the (space-prefixed) quoted field no longer splits it", () => {
			expect(CsvParser.parseString(`id,note\n1, "x,y"`, { trimLeadingSpace: true })).toEqual([{ id: 1, note: "x,y" }]);
		});

		it("streaming matches the buffered result", async () => {
			await expect(collectStream(`id,note\n1, "x,y"`, { trimLeadingSpace: true })).resolves.toEqual([
				{ id: 1, note: "x,y" },
			]);
		});

		it("streaming: a newline inside a space-prefixed quoted field is not split across lines", async () => {
			const records = await collectStream(`a,b\n1, "line1\nline2"`, { trimLeadingSpace: true });
			expect(records).toEqual([{ a: 1, b: "line1\nline2" }]);
		});

		it("preserves whitespace inside the quoted field (only leading space before the quote is dropped)", () => {
			expect(CsvParser.parseString(`note\n "  x  "`, { trimLeadingSpace: true })).toEqual([{ note: "  x  " }]);
		});

		describe("default (option off) keeps RFC-strict behavior", () => {
			let warnSpy: ReturnType<typeof vi.spyOn>;
			beforeEach(() => {
				warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			});
			afterEach(() => {
				warnSpy.mockRestore();
			});

			it("buffered: the space defeats quote detection, so the quote stays literal", () => {
				expect(CsvParser.parseString(`note\n "hi"`)).toEqual([{ note: ' "hi"' }]);
			});

			it("streaming: same strict behavior as buffered", async () => {
				await expect(collectStream(`note\n "hi"`)).resolves.toEqual([{ note: ' "hi"' }]);
			});
		});
	});

	describe("streaming no-quote fast path parity", () => {
		it("matches the buffered parser for unquoted CRLF content with a trailing newline", async () => {
			const csv = "a,b\r\n1,2\r\n3,4\r\n";
			const streamed = await collectStream(csv);
			expect(streamed).toEqual(CsvParser.parseString(csv));
			expect(streamed).toEqual([
				{ a: 1, b: 2 },
				{ a: 3, b: 4 },
			]);
		});

		it("still splits a chunk boundary correctly when quotes appear later", async () => {
			// First chunk has no quotes (fast path), second introduces one (slow path).
			const parser = new CsvStreamParser();
			const records: NestedObject[] = [];
			for await (const record of Readable.from(["a,b\n1,2\n3,", '"x,y"\n']).pipe(parser)) {
				records.push(record as NestedObject);
			}
			expect(records).toEqual([
				{ a: 1, b: 2 },
				{ a: 3, b: "x,y" },
			]);
		});
	});

	describe("warnInertOptions: preserveUnsafeIntegersAsString with autoParseNumbers disabled", () => {
		let warnSpy: ReturnType<typeof vi.spyOn>;
		beforeEach(() => {
			warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		});
		afterEach(() => {
			warnSpy.mockRestore();
		});

		it("buffered: warns exactly once when autoParseNumbers is explicitly disabled", () => {
			CsvParser.parseString("id\n1", { preserveUnsafeIntegersAsString: true, autoParseNumbers: false });
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy.mock.calls[0][0]).toContain("preserveUnsafeIntegersAsString");
		});

		it("buffered: does not warn when autoParseNumbers is left at its default (on)", () => {
			CsvParser.parseString("id\n1", { preserveUnsafeIntegersAsString: true });
			expect(warnSpy).not.toHaveBeenCalled();
		});

		it("streaming: warns exactly once at construction when autoParseNumbers is explicitly disabled", () => {
			new CsvStreamParser({ preserveUnsafeIntegersAsString: true, autoParseNumbers: false });
			expect(warnSpy).toHaveBeenCalledTimes(1);
		});

		it("streaming: does not warn when autoParseNumbers is left at its default (on)", () => {
			new CsvStreamParser({ preserveUnsafeIntegersAsString: true });
			expect(warnSpy).not.toHaveBeenCalled();
		});
	});
});
