import fs from "node:fs";
import path from "node:path";
import { CsvParser } from "../src/csv-parser";
import { JsonToCsv } from "../src/json-to-csv";
import type { NestedObject } from "../src/types";
import { TestFolderHelper } from "./test-folder-helper";

describe("JsonToCsv", () => {
	describe("stringify - Basic functionality", () => {
		it("should convert simple flat objects to CSV", () => {
			const data = [
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
			];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("id");
			expect(result).toContain("name");
			expect(result).toContain("age");
			// Headers are sorted, so check individual values exist
			expect(result).toContain("Alice");
			expect(result).toContain("Bob");
			expect(result).toContain("25");
			expect(result).toContain("30");
		});

		it("should return empty string for empty array", () => {
			const result = JsonToCsv.stringify([]);
			expect(result).toBe("");
		});

		it("should handle single object", () => {
			const data = [{ id: "1", name: "Alice" }];

			const result = JsonToCsv.stringify(data);
			const lines = result.split("\n");

			expect(lines).toHaveLength(2);
			expect(lines[0]).toContain("id");
			expect(lines[0]).toContain("name");
			expect(lines[1]).toContain("1");
			expect(lines[1]).toContain("Alice");
		});

		it("should handle numeric values", () => {
			const data = [{ id: 1, price: 19.99, quantity: 5 }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("1");
			expect(result).toContain("19.99");
			expect(result).toContain("5");
		});

		it("should handle boolean values", () => {
			const data = [{ id: "1", active: true, verified: false }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("true");
			expect(result).toContain("false");
		});

		it("should handle null and undefined values", () => {
			const data = [{ id: "1", name: null as unknown as string, email: undefined as unknown as string }];

			const result = JsonToCsv.stringify(data);

			// null/undefined should result in empty values
			expect(result).toContain("id");
		});
	});

	describe("stringify - Nested objects", () => {
		it("should handle nested objects with dot notation", () => {
			const data = [
				{ id: "1", person: { name: "Alice", age: "25" } },
				{ id: "2", person: { name: "Bob", age: "30" } },
			];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("person.name");
			expect(result).toContain("person.age");
			expect(result).toContain("Alice");
			expect(result).toContain("Bob");
		});

		it("should handle deeply nested objects", () => {
			const data = [
				{
					id: "1",
					level1: {
						level2: {
							value: "deep",
						},
					},
				},
			];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("level1.level2.value");
			expect(result).toContain("deep");
		});

		it("should handle mixed nested and flat properties", () => {
			const data = [
				{
					id: "1",
					name: "Alice",
					address: {
						city: "NYC",
						zip: "10001",
					},
					email: "alice@example.com",
				},
			];

			const result = JsonToCsv.stringify(data);
			const headers = result.split("\n")[0];

			expect(headers).toContain("id");
			expect(headers).toContain("name");
			expect(headers).toContain("address.city");
			expect(headers).toContain("address.zip");
			expect(headers).toContain("email");
		});

		it("should handle objects with different structures", () => {
			const data: NestedObject[] = [
				{ id: "1", person: { name: "Alice" } },
				{ id: "2", person: { name: "Bob", age: "30" } },
			];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("person.name");
			expect(result).toContain("person.age");
		});
	});

	describe("stringify - Arrays", () => {
		it("should handle arrays as multiple rows (default rows mode)", () => {
			const data = [
				{
					id: "1",
					name: "Alice",
					tags: ["javascript", "typescript"],
				},
			];

			const result = JsonToCsv.stringify(data);
			const lines = result.split("\n");

			expect(lines.length).toBeGreaterThanOrEqual(2);
			expect(result).toContain("javascript");
			expect(result).toContain("typescript");
		});

		it("should handle arrays in rows mode explicitly", () => {
			const data = [{ id: "1", tags: ["js", "ts", "node"] }];

			const result = JsonToCsv.stringify(data, { arrayMode: "rows" });
			const lines = result.split("\n");

			expect(lines).toHaveLength(4); // header + 3 data rows
			expect(lines[0]).toBe("id,tags");
			expect(lines[1]).toBe("1,js");
			expect(lines[2]).toBe(",ts");
			expect(lines[3]).toBe(",node");
		});

		it("should handle arrays in json mode", () => {
			const data = [{ id: "1", tags: ["js", "ts"] }];

			const result = JsonToCsv.stringify(data, { arrayMode: "json" });

			// JSON arrays are stringified and then escaped for CSV
			expect(result).toContain('"[""js"",""ts""]"');
		});

		it("should handle nested arrays of objects", () => {
			const data = [
				{
					id: "1",
					phones: [
						{ type: "mobile", number: "555-0001" },
						{ type: "home", number: "555-0002" },
					],
				},
			];

			const result = JsonToCsv.stringify(data);

			// Check headers and values are emitted for object-array rows
			expect(result).toContain("phones.type");
			expect(result).toContain("phones.number");
			expect(result).toContain("mobile");
			expect(result).toContain("home");
			expect(result).toContain("555-0001");
			expect(result).toContain("555-0002");
		});

		it("should include headers that only appear in later object-array elements", () => {
			const data = [
				{
					id: "1",
					phones: [
						{ type: "mobile", number: "555-0001", extension: "" },
						{ type: "home", number: "555-0002", extension: "123" },
					],
				},
			];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("phones.extension");
			expect(result).toContain("123");
		});

		it("should handle empty arrays", () => {
			const data = [{ id: "1", tags: [] }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("tags");
		});

		it("should handle multiple arrays of different lengths", () => {
			const data = [
				{
					id: "1",
					tags: ["a", "b", "c"],
					categories: ["x", "y"],
				},
			];

			const result = JsonToCsv.stringify(data, { arrayMode: "rows" });
			const lines = result.split("\n");

			// Should have rows for the longest array
			expect(lines.length).toBeGreaterThanOrEqual(4);
		});
	});

	describe("stringify - Escaping", () => {
		it("should quote values containing delimiter", () => {
			const data = [{ id: "1", description: "Hello, World" }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain('"Hello, World"');
		});

		it("should escape quotes in values", () => {
			const data = [{ id: "1", quote: 'He said "Hello"' }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain('"He said ""Hello"""');
		});

		it("should quote values containing newlines", () => {
			const data = [{ id: "1", bio: "Line 1\nLine 2" }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain('"Line 1\nLine 2"');
		});

		it("should quote values containing carriage return", () => {
			const data = [{ id: "1", bio: "Line 1\rLine 2" }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain('"Line 1\rLine 2"');
		});

		it("should handle values with multiple special characters", () => {
			const data = [{ id: "1", text: 'Hello, "World"\nNew line' }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain('"Hello, ""World""\nNew line"');
		});

		it("should not quote values without special characters", () => {
			const data = [{ id: "1", name: "Alice" }];

			const result = JsonToCsv.stringify(data);

			// "Alice" should not be quoted
			expect(result).not.toContain('"Alice"');
		});
	});

	describe("stringify - Options", () => {
		it("should use custom delimiter", () => {
			const data = [{ id: "1", name: "Alice" }];

			const result = JsonToCsv.stringify(data, { delimiter: ";" });

			expect(result).toBe("id;name\n1;Alice");
		});

		it("should quote values containing custom delimiter", () => {
			const data = [{ id: "1", description: "Hello;World" }];

			const result = JsonToCsv.stringify(data, { delimiter: ";" });

			expect(result).toContain('"Hello;World"');
		});

		it("should use custom quote character", () => {
			const data = [{ id: "1", description: "Hello, World" }];

			const result = JsonToCsv.stringify(data, { quote: "'" });

			expect(result).toContain("'Hello, World'");
		});

		it("should use custom line ending", () => {
			const data = [{ id: "1" }, { id: "2" }];

			const result = JsonToCsv.stringify(data, { lineEnding: "\r\n" });

			expect(result).toBe("id\r\n1\r\n2");
		});

		it("should exclude header when includeHeader is false", () => {
			const data = [{ id: "1", name: "Alice" }];

			const result = JsonToCsv.stringify(data, { includeHeader: false });

			expect(result).toBe("1,Alice");
		});

		it("should include header by default", () => {
			const data = [{ id: "1", name: "Alice" }];

			const result = JsonToCsv.stringify(data);
			const lines = result.split("\n");

			expect(lines[0]).toContain("id");
			expect(lines[0]).toContain("name");
		});
	});

	describe("stringify - Unicode", () => {
		it("should handle CJK characters", () => {
			const data = [{ id: "1", name: "田中太郎", city: "東京" }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("田中太郎");
			expect(result).toContain("東京");
		});

		it("should handle emoji characters", () => {
			const data = [{ id: "1", reaction: "🎉", message: "Party!" }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("🎉");
		});

		it("should handle RTL text", () => {
			const data = [{ id: "1", name: "محمد", greeting: "مرحبا" }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("محمد");
			expect(result).toContain("مرحبا");
		});

		it("should handle mixed scripts", () => {
			const data = [{ id: "1", text: "Hello 世界 🌍 مرحبا" }];

			const result = JsonToCsv.stringify(data);

			expect(result).toContain("Hello 世界 🌍 مرحبا");
		});
	});

	describe("stringify - Header ordering", () => {
		it("should sort headers with primary keys first", () => {
			const data = [{ id: "1", person: { name: "Alice" }, status: "active" }];

			const result = JsonToCsv.stringify(data);
			const headers = result.split("\n")[0].split(",");

			// Primary keys (no dots) should come before nested keys
			const idIndex = headers.indexOf("id");
			const statusIndex = headers.indexOf("status");
			const personNameIndex = headers.indexOf("person.name");

			expect(idIndex).toBeLessThan(personNameIndex);
			expect(statusIndex).toBeLessThan(personNameIndex);
		});
	});
});

describe("JsonToCsv - File I/O", () => {
	const testFolder = new TestFolderHelper("json-to-csv-io");

	beforeAll(() => {
		testFolder.setupTestDir();
	});

	afterAll(() => {
		testFolder.cleanupTestDir();
	});

	describe("writeFileSync", () => {
		it("should write CSV to file synchronously", () => {
			const data = [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			];

			const filePath = path.join(testFolder.testFolder, "sync-output.csv");
			JsonToCsv.writeFileSync(filePath, data);

			const content = fs.readFileSync(filePath, "utf-8");
			expect(content).toContain("id");
			expect(content).toContain("name");
			expect(content).toContain("Alice");
			expect(content).toContain("Bob");
		});

		it("should use custom options when writing", () => {
			const data = [{ id: "1", name: "Alice" }];

			const filePath = path.join(testFolder.testFolder, "custom-options.csv");
			JsonToCsv.writeFileSync(filePath, data, { delimiter: ";" });

			const content = fs.readFileSync(filePath, "utf-8");
			expect(content).toBe("id;name\n1;Alice");
		});

		it("should overwrite existing file", () => {
			const filePath = path.join(testFolder.testFolder, "overwrite.csv");

			JsonToCsv.writeFileSync(filePath, [{ id: "1" }]);
			JsonToCsv.writeFileSync(filePath, [{ id: "2" }]);

			const content = fs.readFileSync(filePath, "utf-8");
			expect(content).toContain("2");
			expect(content).not.toContain("1\n2");
		});
	});

	describe("writeFile", () => {
		it("should write CSV to file asynchronously", async () => {
			const data = [{ id: "1", name: "Async Test" }];

			const filePath = path.join(testFolder.testFolder, "async-output.csv");
			await JsonToCsv.writeFile(filePath, data);

			const content = fs.readFileSync(filePath, "utf-8");
			expect(content).toBe("id,name\n1,Async Test");
		});

		it("should return a Promise", () => {
			const data = [{ id: "1" }];
			const filePath = path.join(testFolder.testFolder, "promise-test.csv");

			const result = JsonToCsv.writeFile(filePath, data);

			expect(result).toBeInstanceOf(Promise);
		});

		it("should use custom options when writing asynchronously", async () => {
			const data = [{ id: "1", name: "Alice" }];

			const filePath = path.join(testFolder.testFolder, "async-custom.csv");
			await JsonToCsv.writeFile(filePath, data, { delimiter: "|" });

			const content = fs.readFileSync(filePath, "utf-8");
			expect(content).toBe("id|name\n1|Alice");
		});
	});
});

describe("JsonToCsv - Round-trip", () => {
	it("should round-trip simple flat data", () => {
		const originalData = [
			{ id: "1", name: "Alice", city: "NYC" },
			{ id: "2", name: "Bob", city: "LA" },
		];

		const csv = JsonToCsv.stringify(originalData);
		const parsedData = CsvParser.parseString(csv);

		expect(parsedData).toEqual(originalData);
	});

	it("should round-trip nested data", () => {
		const originalData = [{ id: "1", person: { name: "Alice", city: "NYC" } }];

		const csv = JsonToCsv.stringify(originalData);
		const parsedData = CsvParser.parseString(csv);

		expect(parsedData).toEqual(originalData);
	});

	it("should round-trip data with special characters", () => {
		const originalData = [{ id: "1", description: 'Hello, "World"' }];

		const csv = JsonToCsv.stringify(originalData);
		const parsedData = CsvParser.parseString(csv);

		expect(parsedData).toEqual(originalData);
	});

	it("should round-trip data with newlines", () => {
		const originalData = [{ id: "1", bio: "Line 1\nLine 2" }];

		const csv = JsonToCsv.stringify(originalData);
		const parsedData = CsvParser.parseString(csv);

		expect(parsedData).toEqual(originalData);
	});

	it("should round-trip numeric and boolean values with auto-parsing", () => {
		const originalData = [{ id: 1, price: 19.99, active: true }];

		const csv = JsonToCsv.stringify(originalData);
		const parsedData = CsvParser.parseString(csv, {
			autoParseNumbers: true,
			autoParseBooleans: true,
		});

		expect(parsedData).toEqual(originalData);
	});
});
