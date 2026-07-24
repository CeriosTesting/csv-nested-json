import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { CsvParseError, CsvReader, CsvStreamParser, NestedJsonConverter } from "../src";
import type { NestedObject } from "../src/types";

describe("Column Selection/Exclusion", () => {
	describe("includeColumns", () => {
		it("should only include specified columns", () => {
			const csv = "id,name,email,age\n1,John,john@test.com,30";
			const result = CsvReader.parse(csv, { includeColumns: ["id", "name"] });

			expect(result.length).toBe(1);
			expect(result[0]).toEqual({ id: "1", name: "John" });
		});

		it("should preserve column order from CSV, not includeColumns order", () => {
			const csv = "id,name,email,age\n1,John,john@test.com,30";
			const result = CsvReader.parse(csv, { includeColumns: ["age", "id"] });

			expect(Object.keys(result[0])).toEqual(["id", "age"]);
		});

		it("should warn for missing columns in includeColumns", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const csv = "id,name,email\n1,John,john@test.com";
			CsvReader.parse(csv, {
				includeColumns: ["id", "nonexistent", "name"],
			});

			expect(warnSpy).toHaveBeenCalledWith(
				"Warning: Column 'nonexistent' specified in includeColumns does not exist in the CSV headers."
			);
			warnSpy.mockRestore();
		});

		it("should handle all columns missing from includeColumns", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const csv = "id,name,email\n1,John,john@test.com";
			const result = CsvReader.parse(csv, { includeColumns: ["missing1", "missing2"] });

			expect(result).toEqual([{}]);
			// 2 warnings for missing columns + 1 warning for row having more values than headers
			expect(warnSpy).toHaveBeenCalledTimes(3);
			expect(warnSpy).toHaveBeenCalledWith(
				"Warning: Column 'missing1' specified in includeColumns does not exist in the CSV headers."
			);
			expect(warnSpy).toHaveBeenCalledWith(
				"Warning: Column 'missing2' specified in includeColumns does not exist in the CSV headers."
			);
			warnSpy.mockRestore();
		});

		it("should handle empty includeColumns array as selecting all columns", () => {
			const csv = "id,name,email\n1,John,john@test.com";
			const result = CsvReader.parse(csv, { includeColumns: [] });

			// Empty includeColumns is treated as "no filter" - all columns included
			expect(result[0]).toEqual({ id: "1", name: "John", email: "john@test.com" });
		});
	});

	describe("excludeColumns", () => {
		it("should exclude specified columns", () => {
			const csv = "id,name,email,age\n1,John,john@test.com,30";
			const result = CsvReader.parse(csv, { excludeColumns: ["email", "age"] });

			expect(result[0]).toEqual({ id: "1", name: "John" });
		});

		it("should handle non-existent columns in excludeColumns silently", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const csv = "id,name,email\n1,John,john@test.com";
			const result = CsvReader.parse(csv, { excludeColumns: ["nonexistent"] });

			// Should not warn for excludeColumns - just silently ignore
			expect(warnSpy).not.toHaveBeenCalled();
			expect(result[0]).toEqual({ id: "1", name: "John", email: "john@test.com" });
			warnSpy.mockRestore();
		});

		it("should handle excluding all columns", () => {
			const csv = "id,name\n1,John";
			const result = CsvReader.parse(csv, { excludeColumns: ["id", "name"] });

			expect(result[0]).toEqual({});
		});
	});

	describe("include and exclude together", () => {
		it("should apply include first, then exclude", () => {
			const csv = "id,name,email,age,city\n1,John,john@test.com,30,NYC";
			const result = CsvReader.parse(csv, {
				includeColumns: ["id", "name", "email", "age"],
				excludeColumns: ["email"],
			});

			// Include first: id, name, email, age
			// Then exclude email: id, name, age
			expect(result[0]).toEqual({ id: "1", name: "John", age: "30" });
		});

		it("should handle exclude column not in include list", () => {
			const csv = "id,name,email,age\n1,John,john@test.com,30";
			const result = CsvReader.parse(csv, {
				includeColumns: ["id", "name"],
				excludeColumns: ["email"], // email not in include list, should be ignored
			});

			expect(result[0]).toEqual({ id: "1", name: "John" });
		});
	});

	describe("identifierColumn", () => {
		it("should use specified identifier column for grouping continuation rows", () => {
			const records = [
				{ productId: "P001", name: "Widget", "variant[]": "Small", "price[]": "10.00" },
				{ productId: "", name: "", "variant[]": "Medium", "price[]": "15.00" },
				{ productId: "", name: "", "variant[]": "Large", "price[]": "20.00" },
				{ productId: "P002", name: "Gadget", "variant[]": "Standard", "price[]": "25.00" },
			];

			const result = NestedJsonConverter.convert(records, {
				identifierColumn: "productId",
			});

			expect(result.length).toBe(2);
			expect(result[0].productId).toBe("P001");
			expect(result[1].productId).toBe("P002");
		});

		it("should use identifierColumn that is not the first column", () => {
			const records = [
				{ category: "Electronics", productId: "P001", "name[]": "Phone", "price[]": "500" },
				{ category: "", productId: "", "name[]": "Charger", "price[]": "20" },
				{ category: "Clothing", productId: "P002", "name[]": "Shirt", "price[]": "30" },
			];

			const result = NestedJsonConverter.convert(records, {
				identifierColumn: "productId",
			});

			// Without identifierColumn, category would be used
			// With productId as identifier, rows with empty productId are continuations
			expect(result.length).toBe(2);
			expect(result[0].productId).toBe("P001");
			expect(result[1].productId).toBe("P002");
		});

		it("should default to first column if identifierColumn not specified", () => {
			const records = [
				{ id: "1", "name[]": "A", "value[]": "100" },
				{ id: "", "name[]": "B", "value[]": "200" },
				{ id: "2", "name[]": "C", "value[]": "300" },
			];

			const result = NestedJsonConverter.convert(records, {});

			expect(result.length).toBe(2);
			expect(result[0].id).toBe("1");
			expect(result[1].id).toBe("2");
		});

		it("should throw when identifierColumn is missing", () => {
			const records = [
				{ name: "Widget", variant: "Small" },
				{ name: "", variant: "Medium" },
				{ name: "Gadget", variant: "Standard" },
			];

			expect(() => {
				NestedJsonConverter.convert(records, {
					identifierColumn: "id",
				});
			}).toThrow(CsvParseError);
			expect(() => {
				NestedJsonConverter.convert(records, {
					identifierColumn: "id",
				});
			}).toThrow("identifierColumn 'id' not found in headers");
		});

		it("should throw when first row is a continuation row", () => {
			const records = [
				{ id: "", value: "a" },
				{ id: "1", value: "b" },
			];

			expect(() => {
				NestedJsonConverter.convert(records, {
					identifierColumn: "id",
				});
			}).toThrow("continuation row, but no base row exists");
		});

		it("should throw when no columns are available after filtering", () => {
			expect(() => {
				NestedJsonConverter.convert([{}]);
			}).toThrow("No columns available after filtering");
		});
	});

	describe("CsvStreamParser column selection", () => {
		it("should support includeColumns in streaming parser", async () => {
			const csv = "id,name,email\n1,John,john@test.com\n";
			const stream = Readable.from([csv]);
			const parser = new CsvStreamParser({
				includeColumns: ["id", "name"],
			});
			const results: NestedObject[] = [];

			for await (const record of stream.pipe(parser)) {
				results.push(record as NestedObject);
			}

			expect(results[0]).toEqual({ id: "1", name: "John" });
		});

		it("should support excludeColumns in streaming parser", async () => {
			const csv = "id,name,email\n1,John,john@test.com\n";
			const stream = Readable.from([csv]);
			const parser = new CsvStreamParser({
				excludeColumns: ["email"],
			});
			const results: NestedObject[] = [];

			for await (const record of stream.pipe(parser)) {
				results.push(record as NestedObject);
			}

			expect(results[0]).toEqual({ id: "1", name: "John" });
		});

		it("should warn for missing includeColumns in streaming parser", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const csv = "id,name,email\n1,John,john@test.com\n";
			const stream = Readable.from([csv]);
			const parser = new CsvStreamParser({
				includeColumns: ["id", "missing"],
			});
			const results: NestedObject[] = [];

			for await (const record of stream.pipe(parser)) {
				results.push(record as NestedObject);
			}

			expect(warnSpy).toHaveBeenCalledWith(
				"Warning: Column 'missing' specified in includeColumns does not exist in the CSV headers."
			);
			warnSpy.mockRestore();
		});

		it("should throw when identifierColumn is missing in streaming parser", async () => {
			const csv = "name,variant\nWidget,Small\n,Medium\n";
			const stream = Readable.from([csv]);

			await expect(
				CsvStreamParser.parseStream(stream, {
					identifierColumn: "id",
				})
			).rejects.toThrow("identifierColumn 'id' not found in headers");
		});
	});

	describe("column selection with headerTransformer", () => {
		it("should filter based on original header names, not transformed names", () => {
			const csv = "User ID,User Name,Email\n1,John,john@test.com";
			const result = CsvReader.parse(csv, {
				headerTransformer: (h: string) => h.toLowerCase().replace(" ", "_"),
				includeColumns: ["User ID", "User Name"],
			});

			expect(result[0]).toEqual({ user_id: "1", user_name: "John" });
		});

		it("should require transformed identifierColumn name in streaming parser", async () => {
			const csv = "User ID,values[]\n1,a\n,b";

			await expect(
				CsvStreamParser.parseStream(Readable.from([csv]), {
					headerTransformer: (h: string) => h.toLowerCase().replace(" ", "_"),
					identifierColumn: "User ID",
				})
			).rejects.toThrow("identifierColumn 'User ID' not found in headers");

			const result = await CsvStreamParser.parseStream(Readable.from([csv]), {
				headerTransformer: (h: string) => h.toLowerCase().replace(" ", "_"),
				identifierColumn: "user_id",
			});

			expect(result).toEqual([{ user_id: "1", values: ["a", "b"] }]);
		});
	});

	describe("column selection with columnMapping", () => {
		it("should filter based on original headers when columnMapping is applied", () => {
			const csv = "id,firstName,lastName\n1,John,Doe";
			const result = CsvReader.parse(csv, {
				columnMapping: { firstName: "first_name", lastName: "last_name" },
				includeColumns: ["id", "firstName"],
			});

			expect(result[0]).toEqual({ id: "1", first_name: "John" });
		});

		it("should require mapped identifierColumn name in streaming parser", async () => {
			const csv = "id,values[]\n1,a\n,b";

			await expect(
				CsvStreamParser.parseStream(Readable.from([csv]), {
					columnMapping: { id: "recordId" },
					identifierColumn: "id",
				})
			).rejects.toThrow("identifierColumn 'id' not found in headers");

			const result = await CsvStreamParser.parseStream(Readable.from([csv]), {
				columnMapping: { id: "recordId" },
				identifierColumn: "recordId",
			});

			expect(result).toEqual([{ recordId: "1", values: ["a", "b"] }]);
		});
	});

	describe("edge cases", () => {
		it("should handle column selection with quoted values", () => {
			const csv = 'id,name,description\n1,"John Doe","A long, quoted description"';
			const result = CsvReader.parse(csv, { includeColumns: ["id", "description"] });

			expect(result[0]).toEqual({
				id: "1",
				description: "A long, quoted description",
			});
		});

		it("should handle column selection with multiple rows", () => {
			const csv = "id,name,email\n1,John,j@t.com\n2,Jane,jane@t.com\n3,Bob,b@t.com";
			const result = CsvReader.parse(csv, { includeColumns: ["id", "name"] });

			expect(result.length).toBe(3);
			expect(result[0]).toEqual({ id: "1", name: "John" });
			expect(result[1]).toEqual({ id: "2", name: "Jane" });
			expect(result[2]).toEqual({ id: "3", name: "Bob" });
		});

		it("should handle excluding first column with identifierColumn", () => {
			const records = [
				{ extra: "X", id: "P001", name: "Widget", "variant[]": "Small" },
				{ extra: "", id: "", name: "", "variant[]": "Medium" },
				{ extra: "Y", id: "P002", name: "Gadget", "variant[]": "Standard" },
			];

			const result = NestedJsonConverter.convert(records, {
				identifierColumn: "id",
			});

			expect(result.length).toBe(2);
			expect(result[0].id).toBe("P001");
		});

		it("should handle duplicate header detection after column filtering", () => {
			const csv = "id,name,email,name\n1,John,j@t.com,Doe";
			const result = CsvReader.parse(csv, {
				includeColumns: ["id", "email"],
				duplicateHeaders: "error",
			});
			// Should not throw because name is excluded

			expect(result[0]).toEqual({ id: "1", email: "j@t.com" });
		});
	});
});
