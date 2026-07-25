import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CsvParseError, CsvParser } from "../src";

import { TestFolderHelper } from "./test-folder-helper";

describe("Error-accumulation (*Safe methods)", () => {
	describe("parseStringSafe - validation errors", () => {
		it("collects a too-many-columns row and keeps the valid rows", () => {
			const csv = "a,b\n1,2\n1,2,3\n4,5";

			const { data, errors } = CsvParser.parseStringSafe(csv, { validationMode: "error" });

			expect(data).toEqual([
				{ a: 1, b: 2 },
				{ a: 4, b: 5 },
			]);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toMatchObject({ row: 3, code: "validation" });
			expect(errors[0].message).toContain("values");
		});

		it("collects a too-few-columns row in error mode", () => {
			const csv = "a,b,c\n1,2,3\n4,5";

			const { data, errors } = CsvParser.parseStringSafe(csv, { validationMode: "error" });

			expect(data).toEqual([{ a: 1, b: 2, c: 3 }]);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toMatchObject({ row: 3, code: "validation" });
		});

		it("returns no errors for a clean file", () => {
			const csv = "a,b\n1,2\n3,4";

			const { data, errors } = CsvParser.parseStringSafe(csv, { validationMode: "error" });

			expect(data).toEqual([
				{ a: 1, b: 2 },
				{ a: 3, b: 4 },
			]);
			expect(errors).toEqual([]);
		});
	});

	describe("parseStringSafe - grouping errors", () => {
		it("collects a repeated non-array path within a group and omits that group", () => {
			// `val` has no [] suffix but appears in two rows of the same group -> grouping collision.
			const csv = "id,val\n1,a\n,b\n2,c";

			const { data, errors } = CsvParser.parseStringSafe(csv);

			expect(data).toEqual([{ id: 2, val: "c" }]);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toMatchObject({ code: "grouping" });
		});

		it("collects an orphan continuation row and keeps later groups", () => {
			const csv = "id,val[]\n,a\n1,b\n,c";

			const { data, errors } = CsvParser.parseStringSafe(csv);

			expect(data).toEqual([{ id: 1, val: ["b", "c"] }]);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toMatchObject({ row: 1, code: "grouping" });
		});
	});

	describe("parseStringSafe - configuration errors still throw", () => {
		it("throws on an invalid delimiter rather than collecting", () => {
			expect(() => CsvParser.parseStringSafe("a,b\n1,2", { delimiter: "||" })).toThrow(CsvParseError);
		});
	});

	describe("file and stream Safe variants", () => {
		const helper = new TestFolderHelper("safe-parsing-tmp");
		beforeEach(() => helper.setupTestDir());
		afterEach(() => helper.cleanupTestDir());

		it("parseFileSyncSafe collects per-row errors", () => {
			const file = path.join(helper.testFolder, "data.csv");
			fs.writeFileSync(file, "a,b\n1,2\n1,2,3\n4,5");

			const { data, errors } = CsvParser.parseFileSyncSafe(file, { validationMode: "error" });

			expect(data).toEqual([
				{ a: 1, b: 2 },
				{ a: 4, b: 5 },
			]);
			expect(errors).toHaveLength(1);
		});

		it("parseFileSafe collects per-row errors", async () => {
			const file = path.join(helper.testFolder, "data-async.csv");
			fs.writeFileSync(file, "a,b\n1,2\n1,2,3");

			const { data, errors } = await CsvParser.parseFileSafe(file, { validationMode: "error" });

			expect(data).toEqual([{ a: 1, b: 2 }]);
			expect(errors).toHaveLength(1);
		});

		it("parseStreamSafe collects per-row errors", async () => {
			const stream = Readable.from(["a,b\n1,2\n1,2,3\n4,5"]);

			const { data, errors } = await CsvParser.parseStreamSafe(stream, { validationMode: "error" });

			expect(data).toEqual([
				{ a: 1, b: 2 },
				{ a: 4, b: 5 },
			]);
			expect(errors).toHaveLength(1);
		});
	});
});
