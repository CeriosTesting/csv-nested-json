import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { CsvParser } from "../src/csv-parser";
import { CsvReader } from "../src/csv-reader";
import { CsvStreamParser } from "../src/csv-stream-parser";
import { CsvFileNotFoundError, CsvParseError, CsvValidationError } from "../src/errors";
import { JsonToCsv } from "../src/json-to-csv";
import { TestFolderHelper } from "./test-folder-helper";

describe("Edge Cases", () => {
	describe("BOM Handling", () => {
		it("should handle UTF-8 BOM (\\uFEFF) at start of content", () => {
			const csvWithBom = "\uFEFFid,name\n1,Alice";
			const result = CsvParser.parseString(csvWithBom);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ id: "1", name: "Alice" });
			// Ensure the BOM didn't become part of the first header
			expect(Object.keys(result[0])[0]).toBe("id");
		});

		it("should handle UTF-8 BOM with stripBom: true (default)", () => {
			const csvWithBom = "\uFEFFid,name,city\n1,Bob,NYC";
			const result = CsvParser.parseString(csvWithBom, { stripBom: true });

			expect(result[0]).toEqual({ id: "1", name: "Bob", city: "NYC" });
		});

		it("should preserve BOM when stripBom: false", () => {
			const csvWithBom = "\uFEFFid,name\n1,Alice";
			const result = CsvParser.parseString(csvWithBom, { stripBom: false });

			expect(result).toHaveLength(1);
			// BOM should be part of the first header
			expect(Object.keys(result[0])[0]).toBe("\uFEFFid");
		});

		it("should handle UTF-16 LE BOM marker", () => {
			// UTF-16 LE BOM appears as \uFFFE when incorrectly decoded as UTF-8
			const csvWithBom = "\uFFFEid,name\n1,Test";
			const result = CsvParser.parseString(csvWithBom);

			expect(result).toHaveLength(1);
			expect(Object.keys(result[0])[0]).toBe("id");
		});

		it("should handle content without BOM normally", () => {
			const csv = "id,name\n1,NoB0M";
			const result = CsvParser.parseString(csv);

			expect(result[0]).toEqual({ id: "1", name: "NoB0M" });
		});

		it("should strip BOM using CsvReader.stripBom directly", () => {
			const withBom = "\uFEFFhello";
			const stripped = CsvReader.stripBom(withBom);

			expect(stripped).toBe("hello");
		});

		it("should not modify content without BOM in stripBom", () => {
			const noBom = "hello";
			const result = CsvReader.stripBom(noBom);

			expect(result).toBe("hello");
		});
	});

	describe("Unicode Characters", () => {
		it("should handle CJK (Chinese/Japanese/Korean) characters", () => {
			const csv = "id,name,city\n1,田中太郎,東京\n2,김철수,서울\n3,张伟,北京";
			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ id: "1", name: "田中太郎", city: "東京" });
			expect(result[1]).toEqual({ id: "2", name: "김철수", city: "서울" });
			expect(result[2]).toEqual({ id: "3", name: "张伟", city: "北京" });
		});

		it("should handle emoji characters", () => {
			const csv = "id,reaction,message\n1,🎉,Party time!\n2,👍,Great job!\n3,❤️,Love it!";
			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(3);
			expect(result[0].reaction).toBe("🎉");
			expect(result[1].reaction).toBe("👍");
			expect(result[2].reaction).toBe("❤️");
		});

		it("should handle complex emoji (skin tones, ZWJ sequences)", () => {
			const csv = "id,emoji\n1,👨‍👩‍👧‍👦\n2,👋🏽\n3,🏳️‍🌈";
			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(3);
			expect(result[0].emoji).toBe("👨‍👩‍👧‍👦");
			expect(result[1].emoji).toBe("👋🏽");
			expect(result[2].emoji).toBe("🏳️‍🌈");
		});

		it("should handle RTL (Right-to-Left) text", () => {
			const csv = "id,name,greeting\n1,محمد,مرحبا\n2,יוסי,שלום";
			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ id: "1", name: "محمد", greeting: "مرحبا" });
			expect(result[1]).toEqual({ id: "2", name: "יוסי", greeting: "שלום" });
		});

		it("should handle mixed scripts in same field", () => {
			const csv = "id,text\n1,Hello 世界 🌍 مرحبا";
			const result = CsvParser.parseString(csv);

			expect(result[0].text).toBe("Hello 世界 🌍 مرحبا");
		});

		it("should handle special Unicode characters", () => {
			const csv = "id,symbol\n1,™\n2,©\n3,®\n4,°\n5,µ";
			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(5);
			expect(result[0].symbol).toBe("™");
			expect(result[1].symbol).toBe("©");
			expect(result[2].symbol).toBe("®");
		});
	});

	describe("Very Long Lines", () => {
		it("should handle a field with 100,000 characters", () => {
			const longValue = "a".repeat(100000);
			const csv = `id,data\n1,${longValue}`;
			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(1);
			expect(result[0].data).toBe(longValue);
			expect((result[0].data as string).length).toBe(100000);
		});

		it("should handle multiple long fields in same row", () => {
			const long1 = "x".repeat(50000);
			const long2 = "y".repeat(50000);
			const csv = `id,field1,field2\n1,${long1},${long2}`;
			const result = CsvParser.parseString(csv);

			expect(result[0].field1).toBe(long1);
			expect(result[0].field2).toBe(long2);
		});

		it("should handle quoted field with 100,000 characters", () => {
			const longValue = "b".repeat(100000);
			const csv = `id,data\n1,"${longValue}"`;
			const result = CsvParser.parseString(csv);

			expect(result[0].data).toBe(longValue);
		});

		it("should handle many columns (1000 columns)", () => {
			const headers = Array.from({ length: 1000 }, (_, i) => `col${i}`).join(",");
			const values = Array.from({ length: 1000 }, (_, i) => `val${i}`).join(",");
			const csv = `${headers}\n${values}`;

			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(1);
			expect(Object.keys(result[0])).toHaveLength(1000);
			expect(result[0].col0).toBe("val0");
			expect(result[0].col999).toBe("val999");
		});
	});

	describe("Null Bytes and Special Characters", () => {
		it("should handle null bytes in data", () => {
			const csv = "id,data\n1,before\x00after";
			const result = CsvParser.parseString(csv);

			expect(result[0].data).toBe("before\x00after");
			expect((result[0].data as string).length).toBe(12);
		});

		it("should handle tab characters", () => {
			const csv = "id,data\n1,hello\tworld";
			const result = CsvParser.parseString(csv);

			expect(result[0].data).toBe("hello\tworld");
		});

		it("should handle form feed and other control characters", () => {
			const csv = "id,data\n1,line1\fline2";
			const result = CsvParser.parseString(csv);

			expect(result[0].data).toBe("line1\fline2");
		});

		it("should handle backslash characters", () => {
			const csv = "id,path\n1,C:\\Users\\Test\\file.txt";
			const result = CsvParser.parseString(csv);

			expect(result[0].path).toBe("C:\\Users\\Test\\file.txt");
		});
	});

	describe("Line Endings", () => {
		it("should handle CRLF (Windows) line endings", () => {
			const csv = "id,name\r\n1,Alice\r\n2,Bob";
			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("Alice");
			expect(result[1].name).toBe("Bob");
		});

		it("should handle LF (Unix) line endings", () => {
			const csv = "id,name\n1,Alice\n2,Bob";
			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(2);
		});

		it("should handle CR (old Mac) line endings", () => {
			const csv = "id,name\r1,Alice\r2,Bob";
			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(2);
		});

		it("should handle mixed line endings in same file", () => {
			const csv = "id,name\n1,Alice\r\n2,Bob\r3,Charlie";
			const result = CsvParser.parseString(csv);

			expect(result).toHaveLength(3);
			expect(result[0].name).toBe("Alice");
			expect(result[1].name).toBe("Bob");
			expect(result[2].name).toBe("Charlie");
		});

		it("should handle newlines inside quoted fields", () => {
			const csv = 'id,note\n1,"Line 1\nLine 2\nLine 3"';
			const result = CsvParser.parseString(csv);

			expect(result[0].note).toBe("Line 1\nLine 2\nLine 3");
		});

		it("should handle CRLF inside quoted fields", () => {
			const csv = 'id,note\n1,"Line 1\r\nLine 2"';
			const result = CsvParser.parseString(csv);

			expect(result[0].note).toBe("Line 1\r\nLine 2");
		});
	});

	describe("Value Transformation", () => {
		it("should auto-parse integers", () => {
			const csv = "id,count,name\n1,42,Alice\n2,100,Bob";
			const result = CsvParser.parseString(csv, { autoParseNumbers: true });

			expect(result[0].id).toBe(1);
			expect(result[0].count).toBe(42);
			expect(result[0].name).toBe("Alice");
		});

		it("should auto-parse floating point numbers", () => {
			const csv = "id,price,rate\n1,19.99,0.05";
			const result = CsvParser.parseString(csv, { autoParseNumbers: true });

			expect(result[0].price).toBe(19.99);
			expect(result[0].rate).toBe(0.05);
		});

		it("should auto-parse negative numbers", () => {
			const csv = "id,value\n1,-42\n2,-3.14";
			const result = CsvParser.parseString(csv, { autoParseNumbers: true });

			expect(result[0].value).toBe(-42);
			expect(result[1].value).toBe(-3.14);
		});

		it("should NOT parse numbers with leading zeros (like IDs)", () => {
			const csv = "id,code\n1,007\n2,00123";
			const result = CsvParser.parseString(csv, { autoParseNumbers: true });

			// Leading zeros suggest these are codes/IDs, not numbers
			expect(result[0].code).toBe("007");
			expect(result[1].code).toBe("00123");
		});

		it("should auto-parse booleans (case-insensitive)", () => {
			const csv = "id,active,verified\n1,true,FALSE\n2,True,false";
			const result = CsvParser.parseString(csv, { autoParseBooleans: true });

			expect(result[0].active).toBe(true);
			expect(result[0].verified).toBe(false);
			expect(result[1].active).toBe(true);
			expect(result[1].verified).toBe(false);
		});

		it("should combine autoParseNumbers and autoParseBooleans", () => {
			const csv = "id,count,active\n1,42,true";
			const result = CsvParser.parseString(csv, {
				autoParseNumbers: true,
				autoParseBooleans: true,
			});

			expect(result[0].id).toBe(1);
			expect(result[0].count).toBe(42);
			expect(result[0].active).toBe(true);
		});

		it("should apply custom valueTransformer", () => {
			const csv = "id,name,city\n1,alice,new york";
			const result = CsvParser.parseString(csv, {
				valueTransformer: (value, header) => {
					if (header === "name" && typeof value === "string") {
						return value.toUpperCase();
					}
					return value;
				},
			});

			expect(result[0].name).toBe("ALICE");
			expect(result[0].city).toBe("new york");
		});

		it("should apply valueTransformer after auto-parsing", () => {
			const csv = "id,value\n1,100";
			const result = CsvParser.parseString(csv, {
				autoParseNumbers: true,
				valueTransformer: (value, header) => {
					if (header === "value" && typeof value === "number") {
						return value * 2;
					}
					return value;
				},
			});

			expect(result[0].value).toBe(200);
		});

		it("should not transform empty values", () => {
			const csv = "id,name,city\n1,,NYC";
			const result = CsvParser.parseString(csv, {
				autoParseNumbers: true,
				autoParseBooleans: true,
			});

			// Empty values are omitted during nested conversion (by design)
			expect(result[0].name).toBeUndefined();
			expect(result[0].city).toBe("NYC");
		});
	});

	describe("Skip Rows", () => {
		it("should skip specified number of rows before header", () => {
			const csv = "Metadata row 1\nMetadata row 2\nid,name\n1,Alice";
			const result = CsvParser.parseString(csv, { skipRows: 2 });

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ id: "1", name: "Alice" });
		});

		it("should skip zero rows by default", () => {
			const csv = "id,name\n1,Alice";
			const result = CsvParser.parseString(csv);

			expect(result[0]).toEqual({ id: "1", name: "Alice" });
		});

		it("should handle skipRows larger than file", () => {
			const csv = "id,name\n1,Alice";
			const result = CsvParser.parseString(csv, { skipRows: 10 });

			expect(result).toHaveLength(0);
		});

		it("should skip exactly to header row", () => {
			const csv = "Skip this\nid,name\n1,Test";
			const result = CsvParser.parseString(csv, { skipRows: 1 });

			expect(result[0]).toEqual({ id: "1", name: "Test" });
		});
	});

	describe("Error Classes", () => {
		it("should throw CsvFileNotFoundError for missing files", () => {
			expect(() => {
				CsvParser.parseFileSync("/nonexistent/path/file.csv");
			}).toThrow(CsvFileNotFoundError);
		});

		it("should include filePath in CsvFileNotFoundError", () => {
			try {
				CsvParser.parseFileSync("/nonexistent/file.csv");
			} catch (error) {
				expect(error).toBeInstanceOf(CsvFileNotFoundError);
				expect((error as CsvFileNotFoundError).filePath).toBe("/nonexistent/file.csv");
			}
		});

		it("should throw CsvValidationError when validationMode is error", () => {
			const csv = "id,name\n1,Alice,Extra,Values";
			expect(() => {
				CsvParser.parseString(csv, { validationMode: "error" });
			}).toThrow(CsvValidationError);
		});

		it("should include column counts in CsvValidationError", () => {
			const csv = "id,name\n1,Alice,Extra,Values";
			try {
				CsvParser.parseString(csv, { validationMode: "error" });
			} catch (error) {
				expect(error).toBeInstanceOf(CsvValidationError);
				const valError = error as CsvValidationError;
				expect(valError.expectedColumns).toBe(2);
				expect(valError.actualColumns).toBe(4);
				expect(valError.row).toBe(2);
			}
		});

		it("should have proper inheritance chain for errors", () => {
			const parseError = new CsvParseError("test");
			const fileError = new CsvFileNotFoundError("/path");
			const validationError = new CsvValidationError("test", 1, 2, 3);

			expect(parseError).toBeInstanceOf(Error);
			expect(fileError).toBeInstanceOf(CsvParseError);
			expect(fileError).toBeInstanceOf(Error);
			expect(validationError).toBeInstanceOf(CsvParseError);
			expect(validationError).toBeInstanceOf(Error);
		});
	});

	describe("Streaming Parser Edge Cases", () => {
		it("should handle BOM in streamed content", async () => {
			const csv = "\uFEFFid,name\n1,StreamTest";
			const stream = Readable.from([csv]);
			const parser = new CsvStreamParser();

			const records: unknown[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record);
			}

			expect(records).toHaveLength(1);
			expect(Object.keys(records[0] as object)[0]).toBe("id");
		});

		it("should handle chunks split in middle of field", async () => {
			const chunk1 = "id,name\n1,Hel";
			const chunk2 = "lo World";

			const stream = Readable.from([chunk1, chunk2]);
			const parser = new CsvStreamParser();

			const records: unknown[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record);
			}

			expect(records).toHaveLength(1);
			expect((records[0] as { name: string }).name).toBe("Hello World");
		});

		it("should handle chunks split in middle of quoted field", async () => {
			const chunk1 = 'id,name\n1,"Hello, ';
			const chunk2 = 'World"';

			const stream = Readable.from([chunk1, chunk2]);
			const parser = new CsvStreamParser();

			const records: unknown[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record);
			}

			expect(records).toHaveLength(1);
			expect((records[0] as { name: string }).name).toBe("Hello, World");
		});

		it("should apply value transformations in streaming mode", async () => {
			const csv = "id,count,active\n1,42,true";
			const stream = Readable.from([csv]);
			const parser = new CsvStreamParser({
				autoParseNumbers: true,
				autoParseBooleans: true,
			});

			const records: unknown[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record);
			}

			const rec = records[0] as { id: number; count: number; active: boolean };
			expect(rec.id).toBe(1);
			expect(rec.count).toBe(42);
			expect(rec.active).toBe(true);
		});

		it("should skip rows in streaming mode", async () => {
			const csv = "Skip this\nid,name\n1,Test";
			const stream = Readable.from([csv]);
			const parser = new CsvStreamParser({ skipRows: 1 });

			const records: unknown[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record);
			}

			expect(records).toHaveLength(1);
			expect((records[0] as { id: string }).id).toBe("1");
		});
	});

	describe("JSON to CSV Edge Cases", () => {
		it("should handle empty array input", () => {
			const result = JsonToCsv.stringify([]);
			expect(result).toBe("");
		});

		it("should handle nested objects with dot notation", () => {
			const data = [{ id: "1", person: { name: "Alice", address: { city: "NYC" } } }];

			const csv = JsonToCsv.stringify(data);

			expect(csv).toContain("id");
			expect(csv).toContain("person.name");
			expect(csv).toContain("person.address.city");
			expect(csv).toContain("Alice");
			expect(csv).toContain("NYC");
		});

		it("should handle arrays in rows mode (continuation rows)", () => {
			const data = [{ id: "1", tags: ["js", "ts", "node"] }];

			const csv = JsonToCsv.stringify(data, { arrayMode: "rows" });
			const lines = csv.split("\n");

			expect(lines).toHaveLength(4); // header + 3 data rows
			expect(lines[0]).toBe("id,tags");
			expect(lines[1]).toBe("1,js");
			expect(lines[2]).toBe(",ts");
			expect(lines[3]).toBe(",node");
		});

		it("should handle arrays in json mode", () => {
			const data = [{ id: "1", tags: ["js", "ts"] }];

			const csv = JsonToCsv.stringify(data, { arrayMode: "json" });

			// JSON arrays are stringified and then escaped for CSV
			// The double quotes in JSON get escaped as "" in CSV
			expect(csv).toContain('"[""js"",""ts""]"');
		});

		it("should escape values containing delimiter", () => {
			const data = [{ id: "1", name: "Hello, World" }];

			const csv = JsonToCsv.stringify(data);

			expect(csv).toContain('"Hello, World"');
		});

		it("should escape values containing quotes", () => {
			const data = [{ id: "1", quote: 'Say "Hello"' }];

			const csv = JsonToCsv.stringify(data);

			expect(csv).toContain('"Say ""Hello"""');
		});

		it("should escape values containing newlines", () => {
			const data = [{ id: "1", note: "Line 1\nLine 2" }];

			const csv = JsonToCsv.stringify(data);

			expect(csv).toContain('"Line 1\nLine 2"');
		});

		it("should handle custom delimiter", () => {
			const data = [{ id: "1", name: "Alice" }];

			const csv = JsonToCsv.stringify(data, { delimiter: ";" });

			expect(csv).toBe("id;name\n1;Alice");
		});

		it("should handle custom line ending", () => {
			const data = [{ id: "1" }, { id: "2" }];

			const csv = JsonToCsv.stringify(data, { lineEnding: "\r\n" });

			expect(csv).toBe("id\r\n1\r\n2");
		});

		it("should handle includeHeader: false", () => {
			const data = [{ id: "1", name: "Alice" }];

			const csv = JsonToCsv.stringify(data, { includeHeader: false });

			expect(csv).toBe("1,Alice");
		});

		it("should handle Unicode in output", () => {
			const data = [{ id: "1", name: "田中", emoji: "🎉" }];

			const csv = JsonToCsv.stringify(data);

			expect(csv).toContain("田中");
			expect(csv).toContain("🎉");
		});
	});

	describe("Round-trip (CSV → JSON → CSV)", () => {
		it("should round-trip simple flat data", () => {
			const originalCsv = "id,name,city\n1,Alice,NYC\n2,Bob,LA";
			const json = CsvParser.parseString(originalCsv);
			const resultCsv = JsonToCsv.stringify(json as { id: string; name: string; city: string }[]);

			// Headers may be reordered (sorted), but data should be preserved
			const resultJson = CsvParser.parseString(resultCsv);
			expect(resultJson).toEqual(json);
		});

		it("should round-trip nested data", () => {
			const originalCsv = "id,person.name,person.city\n1,Alice,NYC";
			const json = CsvParser.parseString(originalCsv);
			const resultCsv = JsonToCsv.stringify(json as { id: string; person: { name: string; city: string } }[]);

			// Headers may be reordered (sorted), but data should be preserved
			const resultJson = CsvParser.parseString(resultCsv);
			expect(resultJson).toEqual(json);
		});
	});
});

describe("File I/O Edge Cases", () => {
	const testFolder = new TestFolderHelper("edge-cases-io");

	beforeAll(() => {
		testFolder.setupTestDir();
	});

	afterAll(() => {
		testFolder.cleanupTestDir();
	});

	it("should read file with UTF-8 BOM", () => {
		const filePath = path.join(testFolder.testFolder, "bom-test.csv");
		fs.writeFileSync(filePath, "\uFEFFid,name\n1,Test", "utf-8");
		const result = CsvParser.parseFileSync(filePath);

		expect(result[0]).toEqual({ id: "1", name: "Test" });
	});

	it("should write and read back CSV with JsonToCsv", () => {
		const data = [
			{ id: "1", name: "Alice" },
			{ id: "2", name: "Bob" },
		];

		const filePath = path.join(testFolder.testFolder, "output.csv");
		JsonToCsv.writeFileSync(filePath, data);

		const result = CsvParser.parseFileSync(filePath);
		expect(result).toEqual(data);
	});

	it("should write CSV asynchronously", async () => {
		const data = [{ id: "1", name: "Async Test" }];

		const filePath = path.join(testFolder.testFolder, "async-output.csv");
		await JsonToCsv.writeFile(filePath, data);

		const content = fs.readFileSync(filePath, "utf-8");
		expect(content).toBe("id,name\n1,Async Test");
	});
});
