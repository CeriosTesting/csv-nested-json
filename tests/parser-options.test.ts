import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { CsvParser, CsvStreamParser } from "../src";

describe("Parser Options - New Features", () => {
	// =============================================================================
	// Column Mapping Tests
	// =============================================================================
	describe("columnMapping", () => {
		it("should rename columns using mapping", () => {
			const csv = "FirstName,LastName\nJohn,Doe";
			const mapping = { FirstName: "first_name", LastName: "last_name" };

			const result = CsvParser.parseString(csv, { columnMapping: mapping });

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("first_name", "John");
			expect(result[0]).toHaveProperty("last_name", "Doe");
		});

		it("should leave unmapped columns unchanged", () => {
			const csv = "id,FirstName,LastName\n1,John,Doe";
			const mapping = { FirstName: "first_name" };

			const result = CsvParser.parseString(csv, { columnMapping: mapping });

			expect(result).toHaveLength(1);
			// `id` is coerced to a number by the default-on auto-parse.
			expect(result[0]).toHaveProperty("id", 1);
			expect(result[0]).toHaveProperty("first_name", "John");
			expect(result[0]).toHaveProperty("LastName", "Doe");
		});

		it("should support nested path renaming", () => {
			const csv = "user.firstName,user.lastName\nJohn,Doe";
			const mapping = { "user.firstName": "person.name.first", "user.lastName": "person.name.last" };

			const result = CsvParser.parseString(csv, { columnMapping: mapping });

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("person");
			const person = (result[0] as { person: { name: { first: string; last: string } } }).person;
			expect(person.name.first).toBe("John");
			expect(person.name.last).toBe("Doe");
		});
	});

	// =============================================================================
	// Date Handling Tests
	// =============================================================================
	// There is no built-in date option: Date.parse recognition is too loose/locale-dependent, so
	// date-looking strings stay strings.
	describe("date handling", () => {
		it("leaves ISO date strings as plain strings by default", () => {
			const csv = "id,created\n1,2024-01-15";

			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("created", "2024-01-15");
		});
	});

	// =============================================================================
	// Auto-parse defaults
	// =============================================================================
	describe("auto-parse defaults", () => {
		it("coerces numbers and booleans by default", () => {
			const csv = "id,active,score\n1,true,9.5";

			const result = CsvParser.parseString(csv);

			expect(result).toEqual([{ id: 1, active: true, score: 9.5 }]);
		});

		it("can be disabled explicitly to keep raw strings", () => {
			const csv = "id,active,score\n1,true,9.5";

			const result = CsvParser.parseString(csv, {
				autoParseNumbers: false,
				autoParseBooleans: false,
			});

			expect(result).toEqual([{ id: "1", active: "true", score: "9.5" }]);
		});
	});

	// =============================================================================
	// Null Value Handling Tests
	// =============================================================================
	describe("nullValues", () => {
		it("should detect null values and omit by default", () => {
			const csv = "id,name\n1,null\n2,John";

			const result = CsvParser.parseString(csv, {
				nullValues: ["null"],
			});

			expect(result).toHaveLength(2);
			expect(result[0]).not.toHaveProperty("name");
			expect(result[1]).toHaveProperty("name", "John");
		});

		it("should be case-insensitive", () => {
			const csv = "id,value\n1,NULL\n2,Null\n3,null\n4,normal";

			const result = CsvParser.parseString(csv, {
				nullValues: ["null"],
				nullRepresentation: "null",
			});

			expect(result).toHaveLength(4);
			expect((result[0] as { value: null }).value).toBeNull();
			expect((result[1] as { value: null }).value).toBeNull();
			expect((result[2] as { value: null }).value).toBeNull();
			expect(result[3]).toHaveProperty("value", "normal");
		});

		it("should support multiple null representations", () => {
			const csv = "id,value\n1,null\n2,N/A\n3,-\n4,valid";

			const result = CsvParser.parseString(csv, {
				nullValues: ["null", "N/A", "-"],
				nullRepresentation: "null",
			});

			expect(result).toHaveLength(4);
			expect((result[0] as { value: null }).value).toBeNull();
			expect((result[1] as { value: null }).value).toBeNull();
			expect((result[2] as { value: null }).value).toBeNull();
			expect(result[3]).toHaveProperty("value", "valid");
		});

		it("should check null before number parsing", () => {
			const csv = "id,value\n1,null\n2,42";

			const result = CsvParser.parseString(csv, {
				nullValues: ["null"],
				nullRepresentation: "null",
				autoParseNumbers: true,
			});

			expect(result).toHaveLength(2);
			expect((result[0] as { value: null }).value).toBeNull();
			expect(result[1]).toHaveProperty("value", 42);
		});
	});

	describe("nullRepresentation", () => {
		const csv = "id,value\n1,null\n2,valid";

		it("should use null when representation is 'null'", () => {
			const result = CsvParser.parseString(csv, {
				nullValues: ["null"],
				nullRepresentation: "null",
			});

			expect((result[0] as { value: null }).value).toBeNull();
		});

		it("should use undefined when representation is 'undefined' (same as omit for nested)", () => {
			const result = CsvParser.parseString(csv, {
				nullValues: ["null"],
				nullRepresentation: "undefined",
			});

			// Note: undefined values are omitted during nested conversion
			expect("value" in result[0]).toBe(false);
		});

		it("should use empty string when representation is 'empty-string' (omitted for nested)", () => {
			const result = CsvParser.parseString(csv, {
				nullValues: ["null"],
				nullRepresentation: "empty-string",
			});

			// Note: empty string values are omitted during nested conversion
			expect("value" in result[0]).toBe(false);
		});

		it("should omit field when representation is 'omit'", () => {
			const result = CsvParser.parseString(csv, {
				nullValues: ["null"],
				nullRepresentation: "omit",
			});

			expect("value" in result[0]).toBe(false);
			expect(result[1]).toHaveProperty("value", "valid");
		});
	});

	// =============================================================================
	// Streaming Parser Tests
	// =============================================================================
	describe("CsvStreamParser - New Features", () => {
		const collectStream = async (parser: CsvStreamParser, data: string): Promise<unknown[]> => {
			const results: unknown[] = [];
			return new Promise((resolve, reject) => {
				parser.on("data", record => results.push(record));
				parser.on("end", () => resolve(results));
				parser.on("error", reject);
				parser.end(data);
			});
		};

		it("should apply columnMapping", async () => {
			const parser = new CsvStreamParser({
				columnMapping: { FirstName: "first_name" },
			});

			const results = await collectStream(parser, "FirstName\nJohn");

			expect(results).toHaveLength(1);
			expect(results[0]).toHaveProperty("first_name", "John");
		});

		it("leaves date-looking strings as strings", async () => {
			const parser = new CsvStreamParser();

			const results = await collectStream(parser, "id,created\n1,2024-01-15");

			expect(results).toHaveLength(1);
			expect(results[0]).toHaveProperty("created", "2024-01-15");
		});

		it("should handle null values", async () => {
			const parser = new CsvStreamParser({
				nullValues: ["null"],
				nullRepresentation: "null",
			});

			const results = await collectStream(parser, "id,value\n1,null\n2,test");

			expect(results).toHaveLength(2);
			expect((results[0] as { value: null }).value).toBeNull();
			expect(results[1]).toHaveProperty("value", "test");
		});
	});

	describe("empty value preservation", () => {
		it("should omit unquoted empty values and preserve quoted empties by default", () => {
			const csv = 'id,emptyColumn,emptyQuoted\n1,,""';

			const result = CsvParser.parseString(csv);

			expect(result).toEqual([{ id: 1, emptyQuoted: "" }]);
		});

		it("should preserve only unquoted empty columns", () => {
			const csv = 'id,emptyColumn,emptyQuoted\n1,,""';

			const result = CsvParser.parseString(csv, {
				preserveEmptyColumnAsEmptyString: true,
				preserveEmptyString: false,
			});

			expect(result).toEqual([{ id: 1, emptyColumn: "" }]);
		});

		it("should preserve only quoted empty strings", () => {
			const csv = 'id,emptyColumn,emptyQuoted\n1,,""';

			const result = CsvParser.parseString(csv, {
				preserveEmptyString: true,
			});

			expect(result).toEqual([{ id: 1, emptyQuoted: "" }]);
		});

		it("should preserve both kinds of empty values when both options are enabled", () => {
			const csv = 'id,emptyColumn,emptyQuoted\n1,,""';

			const result = CsvParser.parseString(csv, {
				preserveEmptyColumnAsEmptyString: true,
				preserveEmptyString: true,
			});

			expect(result).toEqual([{ id: 1, emptyColumn: "", emptyQuoted: "" }]);
		});

		it("should apply null handling before preserve options", () => {
			const csv = 'id,emptyColumn,emptyQuoted\n1,,""';

			const result = CsvParser.parseString(csv, {
				nullValues: [""],
				nullRepresentation: "null",
				preserveEmptyColumnAsEmptyString: true,
				preserveEmptyString: true,
			});

			expect(result).toEqual([
				{
					id: 1,
					emptyColumn: null,
					emptyQuoted: null,
				},
			]);
		});

		it("should keep quoted-empty identifier values as continuation rows", () => {
			const csv = 'id,tags[]\n1,a\n"",b\n2,c';

			const result = CsvParser.parseString(csv, {
				preserveEmptyString: true,
			});

			expect(result).toEqual([
				{ id: 1, tags: ["a", "b"] },
				{ id: 2, tags: ["c"] },
			]);
		});

		it("should support quoted-empty preservation with custom quote character", () => {
			const csv = "id,emptyQuoted,emptyColumn\n1,'',\n2,'value',";

			const result = CsvParser.parseString(csv, {
				quote: "'",
				preserveEmptyString: true,
			});

			expect(result).toEqual([
				{ id: 1, emptyQuoted: "" },
				{ id: 2, emptyQuoted: "value" },
			]);
		});

		it("should match CsvStreamParser output for empty preservation scenarios", async () => {
			const csv = 'id,emptyColumn,emptyQuoted\n1,,""\n2,filled,""';
			const options = {
				preserveEmptyString: true,
				preserveEmptyColumnAsEmptyString: false,
			};

			const fromParser = CsvParser.parseString(csv, options);
			const fromStream = await CsvStreamParser.parseStream(Readable.from([csv]), options);

			expect(fromStream).toEqual(fromParser);
		});
	});

	// =============================================================================
	// Combined Features Tests (retained options only)
	// =============================================================================
	describe("Combined Features", () => {
		it("should apply column mapping, null handling, and auto-parse together", () => {
			const csv = "firstName,lastName,status,score\nJohn,Doe,null,95";

			const result = CsvParser.parseString(csv, {
				columnMapping: { firstName: "name.first", lastName: "name.last" },
				nullValues: ["null"],
				nullRepresentation: "null",
			});

			expect(result).toHaveLength(1);
			const record = result[0] as {
				name: { first: string; last: string };
				status: null;
				score: number;
			};
			expect(record.name.first).toBe("John");
			expect(record.name.last).toBe("Doe");
			expect(record.status).toBeNull();
			expect(record.score).toBe(95);
		});
	});
});
