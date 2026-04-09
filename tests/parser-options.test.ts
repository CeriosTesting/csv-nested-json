import { Readable } from "node:stream";
import type { HeaderTransformer, RowFilter } from "../src";
import { CsvParser, CsvStreamParser } from "../src";

describe("Parser Options - New Features", () => {
	// =============================================================================
	// Header Transformer Tests
	// =============================================================================
	describe("headerTransformer", () => {
		it("should transform headers to lowercase", () => {
			const csv = "ID,NAME,EMAIL\n1,John,john@example.com";
			const transformer: HeaderTransformer = h => h.toLowerCase();

			const result = CsvParser.parseString(csv, { headerTransformer: transformer });

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("id", "1");
			expect(result[0]).toHaveProperty("name", "John");
			expect(result[0]).toHaveProperty("email", "john@example.com");
		});

		it("should transform headers to camelCase", () => {
			const csv = "first_name,last_name,email_address\nJohn,Doe,john@example.com";
			const transformer: HeaderTransformer = h => h.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

			const result = CsvParser.parseString(csv, { headerTransformer: transformer });

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("firstName", "John");
			expect(result[0]).toHaveProperty("lastName", "Doe");
			expect(result[0]).toHaveProperty("emailAddress", "john@example.com");
		});

		it("should trim whitespace from headers", () => {
			const csv = " id , name , email \n1,John,john@example.com";
			const transformer: HeaderTransformer = h => h.trim();

			const result = CsvParser.parseString(csv, { headerTransformer: transformer });

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("id", "1");
			expect(result[0]).toHaveProperty("name", "John");
			expect(result[0]).toHaveProperty("email", "john@example.com");
		});

		it("should work with nested paths", () => {
			const csv = "ID,Person.Name,Person.Age\n1,John,30";
			const transformer: HeaderTransformer = h => h.toLowerCase();

			const result = CsvParser.parseString(csv, { headerTransformer: transformer });

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("id", "1");
			expect(result[0]).toHaveProperty("person");
			expect((result[0] as { person: { name: string; age: string } }).person).toHaveProperty("name", "John");
			expect((result[0] as { person: { name: string; age: string } }).person).toHaveProperty("age", "30");
		});

		it("should apply before column mapping", () => {
			const csv = "First Name,Last Name\nJohn,Doe";
			const transformer: HeaderTransformer = h => h.toLowerCase().replace(/ /g, "_");
			const mapping = { first_name: "firstName", last_name: "lastName" };

			const result = CsvParser.parseString(csv, {
				headerTransformer: transformer,
				columnMapping: mapping,
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("firstName", "John");
			expect(result[0]).toHaveProperty("lastName", "Doe");
		});
	});

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
			expect(result[0]).toHaveProperty("id", "1");
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
	// Row Filter Tests
	// =============================================================================
	describe("rowFilter", () => {
		it("should filter rows based on value", () => {
			const csv = "id,status\n1,active\n2,deleted\n3,active\n4,deleted";
			const filter: RowFilter = record => record.status === "active";

			const result = CsvParser.parseString(csv, { rowFilter: filter });

			expect(result).toHaveLength(2);
			expect(result[0]).toHaveProperty("id", "1");
			expect(result[1]).toHaveProperty("id", "3");
		});

		it("should provide row index to filter function", () => {
			const csv = "id,name\n1,First\n2,Second\n3,Third\n4,Fourth";
			const rowIndices: number[] = [];
			const filter: RowFilter = (_record, index) => {
				rowIndices.push(index);
				return index % 2 === 0; // Keep even indices (0, 2)
			};

			const result = CsvParser.parseString(csv, { rowFilter: filter });

			expect(rowIndices).toEqual([0, 1, 2, 3]);
			expect(result).toHaveLength(2);
			expect(result[0]).toHaveProperty("name", "First");
			expect(result[1]).toHaveProperty("name", "Third");
		});

		it("should filter out all rows when filter returns false", () => {
			const csv = "id,name\n1,John\n2,Jane";
			const filter: RowFilter = () => false;

			const result = CsvParser.parseString(csv, { rowFilter: filter });

			expect(result).toHaveLength(0);
		});

		it("should keep all rows when filter returns true", () => {
			const csv = "id,name\n1,John\n2,Jane";
			const filter: RowFilter = () => true;

			const result = CsvParser.parseString(csv, { rowFilter: filter });

			expect(result).toHaveLength(2);
		});

		it("should filter with multiple conditions", () => {
			const csv = "id,age,status\n1,25,active\n2,17,active\n3,30,deleted\n4,22,active";
			const filter: RowFilter = record => parseInt(record.age, 10) >= 18 && record.status === "active";

			const result = CsvParser.parseString(csv, { rowFilter: filter });

			expect(result).toHaveLength(2);
			expect(result[0]).toHaveProperty("id", "1");
			expect(result[1]).toHaveProperty("id", "4");
		});
	});

	// =============================================================================
	// Default Values Tests
	// =============================================================================
	describe("defaultValues", () => {
		it("should apply default value to empty cells", () => {
			const csv = "id,status\n1,active\n2,\n3,inactive";

			const result = CsvParser.parseString(csv, {
				defaultValues: { status: "pending" },
			});

			expect(result).toHaveLength(3);
			expect(result[0]).toHaveProperty("status", "active");
			expect(result[1]).toHaveProperty("status", "pending");
			expect(result[2]).toHaveProperty("status", "inactive");
		});

		it("should apply multiple default values", () => {
			const csv = "id,status,count\n1,,\n2,active,";

			const result = CsvParser.parseString(csv, {
				defaultValues: { status: "pending", count: "0" },
			});

			expect(result).toHaveLength(2);
			expect(result[0]).toHaveProperty("status", "pending");
			expect(result[0]).toHaveProperty("count", "0");
			expect(result[1]).toHaveProperty("status", "active");
			expect(result[1]).toHaveProperty("count", "0");
		});

		it("should work with auto-parse numbers", () => {
			const csv = "id,count\n1,\n2,5";

			const result = CsvParser.parseString(csv, {
				defaultValues: { count: "0" },
				autoParseNumbers: true,
			});

			expect(result).toHaveLength(2);
			expect(result[0]).toHaveProperty("count", 0);
			expect(result[1]).toHaveProperty("count", 5);
		});

		it("should use column names after transformation", () => {
			const csv = "ID,STATUS\n1,";
			const transformer: HeaderTransformer = h => h.toLowerCase();

			const result = CsvParser.parseString(csv, {
				headerTransformer: transformer,
				defaultValues: { status: "pending" },
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("status", "pending");
		});
	});

	// =============================================================================
	// Date Parsing Tests
	// =============================================================================
	describe("autoParseDates", () => {
		it("should parse ISO date strings", () => {
			const csv = "id,created\n1,2024-01-15";

			const result = CsvParser.parseString(csv, { autoParseDates: true });

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("created");
			const created = (result[0] as { created: Date }).created;
			expect(created).toBeInstanceOf(Date);
			expect(created.getFullYear()).toBe(2024);
			expect(created.getMonth()).toBe(0); // January
			expect(created.getDate()).toBe(15);
		});

		it("should parse ISO datetime strings", () => {
			const csv = "id,timestamp\n1,2024-01-15T10:30:00Z";

			const result = CsvParser.parseString(csv, { autoParseDates: true });

			expect(result).toHaveLength(1);
			const timestamp = (result[0] as { timestamp: Date }).timestamp;
			expect(timestamp).toBeInstanceOf(Date);
			expect(timestamp.getFullYear()).toBe(2024);
		});

		it("should not parse pure numbers as dates", () => {
			const csv = "id,value\n1,12345";

			const result = CsvParser.parseString(csv, {
				autoParseDates: true,
				autoParseNumbers: false,
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("value", "12345");
		});

		it("should leave non-date strings unchanged", () => {
			const csv = "id,name\n1,John Doe";

			const result = CsvParser.parseString(csv, { autoParseDates: true });

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("name", "John Doe");
		});

		it("should work with autoParseNumbers", () => {
			const csv = "id,created,count\n1,2024-01-15,42";

			const result = CsvParser.parseString(csv, {
				autoParseDates: true,
				autoParseNumbers: true,
			});

			expect(result).toHaveLength(1);
			expect((result[0] as { created: Date }).created).toBeInstanceOf(Date);
			expect(result[0]).toHaveProperty("count", 42);
		});

		it("should not parse numbers when autoParseNumbers is also enabled", () => {
			const csv = "id,value\n1,42";

			const result = CsvParser.parseString(csv, {
				autoParseDates: true,
				autoParseNumbers: true,
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty("value", 42);
			expect(typeof (result[0] as { value: number }).value).toBe("number");
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

		it("should apply headerTransformer", async () => {
			const parser = new CsvStreamParser({
				headerTransformer: h => h.toLowerCase(),
			});

			const results = await collectStream(parser, "ID,NAME\n1,John");

			expect(results).toHaveLength(1);
			expect(results[0]).toHaveProperty("id", "1");
			expect(results[0]).toHaveProperty("name", "John");
		});

		it("should apply columnMapping", async () => {
			const parser = new CsvStreamParser({
				columnMapping: { FirstName: "first_name" },
			});

			const results = await collectStream(parser, "FirstName\nJohn");

			expect(results).toHaveLength(1);
			expect(results[0]).toHaveProperty("first_name", "John");
		});

		it("should apply rowFilter", async () => {
			const parser = new CsvStreamParser({
				rowFilter: record => record.status === "active",
			});

			const results = await collectStream(parser, "id,status\n1,active\n2,deleted\n3,active");

			expect(results).toHaveLength(2);
		});

		it("should apply defaultValues", async () => {
			const parser = new CsvStreamParser({
				defaultValues: { status: "pending" },
			});

			const results = await collectStream(parser, "id,status\n1,\n2,active");

			expect(results).toHaveLength(2);
			expect(results[0]).toHaveProperty("status", "pending");
			expect(results[1]).toHaveProperty("status", "active");
		});

		it("should parse dates", async () => {
			const parser = new CsvStreamParser({
				autoParseDates: true,
			});

			const results = await collectStream(parser, "id,created\n1,2024-01-15");

			expect(results).toHaveLength(1);
			expect((results[0] as { created: Date }).created).toBeInstanceOf(Date);
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

			expect(result).toEqual([{ id: "1", emptyQuoted: "" }]);
		});

		it("should preserve only unquoted empty columns", () => {
			const csv = 'id,emptyColumn,emptyQuoted\n1,,""';

			const result = CsvParser.parseString(csv, {
				preserveEmptyColumnAsEmptyString: true,
				preserveEmptyString: false,
			});

			expect(result).toEqual([{ id: "1", emptyColumn: "" }]);
		});

		it("should preserve only quoted empty strings", () => {
			const csv = 'id,emptyColumn,emptyQuoted\n1,,""';

			const result = CsvParser.parseString(csv, {
				preserveEmptyString: true,
			});

			expect(result).toEqual([{ id: "1", emptyQuoted: "" }]);
		});

		it("should preserve both kinds of empty values when both options are enabled", () => {
			const csv = 'id,emptyColumn,emptyQuoted\n1,,""';

			const result = CsvParser.parseString(csv, {
				preserveEmptyColumnAsEmptyString: true,
				preserveEmptyString: true,
			});

			expect(result).toEqual([{ id: "1", emptyColumn: "", emptyQuoted: "" }]);
		});

		it("should keep defaultValues precedence over preserve options", () => {
			const csv = 'id,emptyColumn,emptyQuoted\n1,,""';

			const result = CsvParser.parseString(csv, {
				defaultValues: {
					emptyColumn: "fallback-column",
					emptyQuoted: "fallback-quoted",
				},
				preserveEmptyColumnAsEmptyString: true,
				preserveEmptyString: true,
			});

			expect(result).toEqual([
				{
					id: "1",
					emptyColumn: "fallback-column",
					emptyQuoted: "fallback-quoted",
				},
			]);
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
					id: "1",
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
				{ id: "1", tags: ["a", "b"] },
				{ id: "2", tags: ["c"] },
			]);
		});

		it("should support quoted-empty preservation with custom quote character", () => {
			const csv = "id,emptyQuoted,emptyColumn\n1,'',\n2,'value',";

			const result = CsvParser.parseString(csv, {
				quote: "'",
				preserveEmptyString: true,
			});

			expect(result).toEqual([
				{ id: "1", emptyQuoted: "" },
				{ id: "2", emptyQuoted: "value" },
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
	// Combined Features Tests
	// =============================================================================
	describe("Combined Features", () => {
		it("should apply all transformations in correct order", () => {
			const csv = "FIRST_NAME,LAST_NAME,STATUS,SCORE,CREATED\nJohn,Doe,null,95,2024-01-15";

			const result = CsvParser.parseString(csv, {
				headerTransformer: h => h.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
				columnMapping: { firstName: "name.first", lastName: "name.last" },
				nullValues: ["null"],
				nullRepresentation: "null",
				autoParseNumbers: true,
				autoParseDates: true,
			});

			expect(result).toHaveLength(1);
			const record = result[0] as {
				name: { first: string; last: string };
				status: null;
				score: number;
				created: Date;
			};
			expect(record.name.first).toBe("John");
			expect(record.name.last).toBe("Doe");
			expect(record.status).toBeNull();
			expect(record.score).toBe(95);
			expect(record.created).toBeInstanceOf(Date);
		});

		it("should work with default values and filtering", () => {
			const csv = "id,status\n1,\n2,deleted\n3,\n4,active";

			const result = CsvParser.parseString(csv, {
				defaultValues: { status: "pending" },
				rowFilter: record => record.status !== "deleted",
			});

			expect(result).toHaveLength(3);
			expect(result[0]).toHaveProperty("status", "pending");
			expect(result[1]).toHaveProperty("status", "pending");
			expect(result[2]).toHaveProperty("status", "active");
		});
	});
});
