import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { CsvDuplicateHeaderError, CsvParser, CsvStreamParser } from "../src";

describe("Duplicate Header Handling", () => {
	describe("Detection", () => {
		it("should detect duplicate headers", () => {
			const csv = "id,name,id\n1,Alice,2";
			expect(() => CsvParser.parseString(csv)).toThrow(CsvDuplicateHeaderError);
		});

		it("should not throw for unique headers", () => {
			const csv = "id,name,email\n1,Alice,alice@example.com";
			expect(() => CsvParser.parseString(csv)).not.toThrow();
		});

		it("should detect multiple sets of duplicates", () => {
			const csv = "id,name,id,name\n1,Alice,2,Bob";
			try {
				CsvParser.parseString(csv);
				expect.fail("Expected CsvDuplicateHeaderError to be thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CsvDuplicateHeaderError);
				const dupError = error as CsvDuplicateHeaderError;
				expect(dupError.duplicateHeaders).toContain("id");
				expect(dupError.duplicateHeaders).toContain("name");
			}
		});

		it("should include header row number in error", () => {
			const csv = "id,name,id\n1,Alice,2";
			try {
				CsvParser.parseString(csv);
				expect.fail("Expected CsvDuplicateHeaderError to be thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CsvDuplicateHeaderError);
				const dupError = error as CsvDuplicateHeaderError;
				expect(dupError.headerRow).toBe(1);
				expect(dupError.row).toBe(1);
			}
		});

		it("should account for skipRows in header row number", () => {
			const csv = "metadata\nid,name,id\n1,Alice,2";
			try {
				CsvParser.parseString(csv, { skipRows: 1 });
				expect.fail("Expected CsvDuplicateHeaderError to be thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CsvDuplicateHeaderError);
				const dupError = error as CsvDuplicateHeaderError;
				expect(dupError.headerRow).toBe(2);
			}
		});
	});

	describe("Strategy: error (default)", () => {
		it("should throw CsvDuplicateHeaderError by default", () => {
			const csv = "id,name,id\n1,Alice,2";
			expect(() => CsvParser.parseString(csv)).toThrow(CsvDuplicateHeaderError);
		});

		it("should throw CsvDuplicateHeaderError with explicit error strategy", () => {
			const csv = "id,name,id\n1,Alice,2";
			expect(() => CsvParser.parseString(csv, { duplicateHeaders: "error" })).toThrow(CsvDuplicateHeaderError);
		});
	});

	describe("Strategy: rename", () => {
		it("should rename duplicate headers with suffix", () => {
			const csv = "id,name,id\n1,Alice,2";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "rename" });
			expect(result).toEqual([{ id: "1", name: "Alice", id_1: "2" }]);
		});

		it("should handle multiple duplicates of the same header", () => {
			const csv = "id,name,id,id\n1,Alice,2,3";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "rename" });
			expect(result).toEqual([{ id: "1", name: "Alice", id_1: "2", id_2: "3" }]);
		});

		it("should handle multiple different duplicate headers", () => {
			const csv = "id,name,id,name\n1,Alice,2,Bob";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "rename" });
			expect(result).toEqual([{ id: "1", name: "Alice", id_1: "2", name_1: "Bob" }]);
		});
	});

	describe("Strategy: combine", () => {
		it("should combine duplicate values into comma-separated string", () => {
			const csv = "id,tag,tag\n1,red,blue";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "combine" });
			expect(result).toEqual([{ id: "1", tag: "red,blue" }]);
		});

		it("should handle multiple duplicates", () => {
			const csv = "id,tag,tag,tag\n1,red,blue,green";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "combine" });
			expect(result).toEqual([{ id: "1", tag: "red,blue,green" }]);
		});

		it("should handle empty values in combination", () => {
			const csv = "id,tag,tag\n1,,blue";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "combine" });
			expect(result).toEqual([{ id: "1", tag: "blue" }]);
		});

		it("should handle all empty values", () => {
			const csv = "id,tag,tag\n1,,";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "combine" });
			// Empty combined values are filtered out by NestedJsonConverter
			expect(result).toEqual([{ id: "1" }]);
		});
	});

	describe("Strategy: first", () => {
		it("should keep only the first occurrence value", () => {
			const csv = "id,name,id\n1,Alice,2";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "first" });
			expect(result).toEqual([{ id: "1", name: "Alice" }]);
		});

		it("should keep first value across multiple duplicates", () => {
			const csv = "id,name,id,id\n1,Alice,2,3";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "first" });
			expect(result).toEqual([{ id: "1", name: "Alice" }]);
		});
	});

	describe("Strategy: last", () => {
		it("should keep only the last occurrence value", () => {
			const csv = "id,name,id\n1,Alice,2";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "last" });
			expect(result).toEqual([{ id: "2", name: "Alice" }]);
		});

		it("should keep last value across multiple duplicates", () => {
			const csv = "id,name,id,id\n1,Alice,2,3";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "last" });
			expect(result).toEqual([{ id: "3", name: "Alice" }]);
		});

		it("should maintain backwards compatibility (previous default behavior)", () => {
			// This test documents that 'last' is the previous implicit behavior
			const csv = "id,name,id\n1,Alice,2";
			const result = CsvParser.parseString(csv, { duplicateHeaders: "last" });
			expect(result[0].id).toBe("2"); // Last value wins
		});
	});

	describe("Edge Cases", () => {
		describe("Empty headers", () => {
			it("should detect duplicate empty headers", () => {
				const csv = "id,,\n1,a,b";
				expect(() => CsvParser.parseString(csv)).toThrow(CsvDuplicateHeaderError);
			});

			it("should rename duplicate empty headers", () => {
				const csv = "id,,\n1,a,b";
				const result = CsvParser.parseString(csv, { duplicateHeaders: "rename" });
				expect(result).toEqual([{ id: "1", "": "a", _1: "b" }]);
			});
		});

		describe("After transformation", () => {
			it("should detect duplicates created by headerTransformer", () => {
				const csv = "ID,id\n1,2";
				expect(() =>
					CsvParser.parseString(csv, {
						headerTransformer: h => h.toLowerCase(),
					})
				).toThrow(CsvDuplicateHeaderError);
			});

			it("should detect duplicates created by columnMapping", () => {
				const csv = "firstName,lastName\nAlice,Smith";
				expect(() =>
					CsvParser.parseString(csv, {
						columnMapping: { firstName: "name", lastName: "name" },
					})
				).toThrow(CsvDuplicateHeaderError);
			});

			it("should allow duplicates from transformer with last strategy", () => {
				const csv = "ID,id\n1,2";
				const result = CsvParser.parseString(csv, {
					headerTransformer: h => h.toLowerCase(),
					duplicateHeaders: "last",
				});
				expect(result).toEqual([{ id: "2" }]);
			});
		});

		describe("With nested paths", () => {
			it("should detect duplicate nested paths", () => {
				const csv = "user.name,user.name\nAlice,Bob";
				expect(() => CsvParser.parseString(csv)).toThrow(CsvDuplicateHeaderError);
			});

			it("should rename duplicate nested paths", () => {
				const csv = "user.name,user.name\nAlice,Bob";
				const result = CsvParser.parseString(csv, { duplicateHeaders: "rename" });
				expect(result).toEqual([{ user: { name: "Alice", name_1: "Bob" } }]);
			});
		});

		describe("With array suffix", () => {
			it("should detect duplicate array paths", () => {
				const csv = "items[],items[]\n1,2";
				expect(() => CsvParser.parseString(csv)).toThrow(CsvDuplicateHeaderError);
			});
		});

		describe("Multiple rows", () => {
			it("should apply strategy consistently across all rows", () => {
				const csv = "id,name,id\n1,Alice,2\n3,Bob,4";
				const result = CsvParser.parseString(csv, { duplicateHeaders: "last" });
				expect(result).toEqual([
					{ id: "2", name: "Alice" },
					{ id: "4", name: "Bob" },
				]);
			});
		});
	});

	describe("Stream Parser", () => {
		const parseStream = async (csv: string, options = {}): Promise<unknown[]> => {
			return new Promise((resolve, reject) => {
				const records: unknown[] = [];
				const stream = Readable.from([csv]);
				const parser = new CsvStreamParser(options);

				stream
					.pipe(parser)
					.on("data", record => records.push(record))
					.on("end", () => resolve(records))
					.on("error", reject);
			});
		};

		it("should throw CsvDuplicateHeaderError by default", async () => {
			const csv = "id,name,id\n1,Alice,2";
			await expect(parseStream(csv)).rejects.toThrow(CsvDuplicateHeaderError);
		});

		it("should support rename strategy", async () => {
			const csv = "id,name,id\n1,Alice,2";
			const result = await parseStream(csv, { duplicateHeaders: "rename" });
			expect(result).toEqual([{ id: "1", name: "Alice", id_1: "2" }]);
		});

		it("should support combine strategy", async () => {
			const csv = "id,tag,tag\n1,red,blue";
			const result = await parseStream(csv, { duplicateHeaders: "combine" });
			expect(result).toEqual([{ id: "1", tag: "red,blue" }]);
		});

		it("should support first strategy", async () => {
			const csv = "id,name,id\n1,Alice,2";
			const result = await parseStream(csv, { duplicateHeaders: "first" });
			expect(result).toEqual([{ id: "1", name: "Alice" }]);
		});

		it("should support last strategy", async () => {
			const csv = "id,name,id\n1,Alice,2";
			const result = await parseStream(csv, { duplicateHeaders: "last" });
			expect(result).toEqual([{ id: "2", name: "Alice" }]);
		});
	});
});
