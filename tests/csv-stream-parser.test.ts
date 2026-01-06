import { Readable } from "node:stream";
import { CsvStreamParser } from "../src/csv-stream-parser";
import type { NestedObject } from "../src/types";

describe("CsvStreamParser", () => {
	describe("Basic parsing", () => {
		it("should parse simple CSV from stream", async () => {
			const csvContent = `id,name,age
1,Alice,25
2,Bob,30`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
			]);
		});

		it("should handle empty stream", async () => {
			const stream = Readable.from([""]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([]);
		});

		it("should handle stream with only headers", async () => {
			const csvContent = `id,name,age`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([]);
		});

		it("should parse nested objects with dot notation", async () => {
			const csvContent = `id,person.name,person.age
1,Alice,25`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", person: { name: "Alice", age: "25" } }]);
		});

		it("should handle deeply nested objects", async () => {
			const csvContent = `id,level1.level2.level3.value
1,deep-value`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([
				{
					id: "1",
					level1: {
						level2: {
							level3: {
								value: "deep-value",
							},
						},
					},
				},
			]);
		});

		it("should skip empty lines", async () => {
			const csvContent = `id,name

1,Alice

2,Bob`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});
	});

	describe("Chunked data handling", () => {
		it("should handle data split across multiple chunks", async () => {
			const chunks = ["id,na", "me,age\n1,Ali", "ce,25\n2,Bob,30"];
			const stream = Readable.from(chunks);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
			]);
		});

		it("should handle quoted fields split across chunks", async () => {
			const chunks = ['id,description\n1,"Hello', ', World"'];
			const stream = Readable.from(chunks);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", description: "Hello, World" }]);
		});

		it("should handle newlines inside quoted fields split across chunks", async () => {
			const chunks = ['id,bio\n1,"Line 1\n', 'Line 2"'];
			const stream = Readable.from(chunks);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", bio: "Line 1\nLine 2" }]);
		});

		it("should handle many small chunks", async () => {
			const csvContent = "id,name\n1,Alice";
			const chunks = csvContent.split("").map(c => c); // Single character chunks
			const stream = Readable.from(chunks);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", name: "Alice" }]);
		});
	});

	describe("Options", () => {
		it("should use custom delimiter", async () => {
			const csvContent = `id;name;age
1;Alice;25`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ delimiter: ";" });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", name: "Alice", age: "25" }]);
		});

		it("should use custom quote character", async () => {
			const csvContent = `id,name,description
1,Alice,'Hello, World'`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ quote: "'" });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", name: "Alice", description: "Hello, World" }]);
		});

		it("should skip rows when skipRows is specified", async () => {
			const csvContent = `Metadata row 1
Metadata row 2
id,name,age
1,Alice,25`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ skipRows: 2 });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", name: "Alice", age: "25" }]);
		});

		it("should emit flat records when nested is false", async () => {
			const csvContent = `id,person.name,person.age
1,Alice,25`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ nested: false });

			const records: Record<string, string>[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as Record<string, string>);
			}

			expect(records).toEqual([{ id: "1", "person.name": "Alice", "person.age": "25" }]);
		});

		it("should auto-parse numbers when enabled", async () => {
			const csvContent = `id,price,quantity
1,19.99,5`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ autoParseNumbers: true });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: 1, price: 19.99, quantity: 5 }]);
		});

		it("should not parse numbers with leading zeros", async () => {
			const csvContent = `id,code
1,007`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ autoParseNumbers: true });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: 1, code: "007" }]);
		});

		it("should auto-parse booleans when enabled", async () => {
			const csvContent = `id,active,verified
1,true,FALSE`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ autoParseBooleans: true });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", active: true, verified: false }]);
		});

		it("should apply custom value transformer", async () => {
			const csvContent = `id,name
1,alice`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({
				valueTransformer: (value, header) => {
					if (header === "name" && typeof value === "string") {
						return value.toUpperCase();
					}
					return value;
				},
			});

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", name: "ALICE" }]);
		});

		it("should apply transformations in correct order", async () => {
			const csvContent = `id,value
1,42`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({
				autoParseNumbers: true,
				valueTransformer: value => {
					if (typeof value === "number") {
						return value * 2;
					}
					return value;
				},
			});

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: 2, value: 84 }]);
		});

		it("should combine autoParseNumbers and autoParseBooleans", async () => {
			const csvContent = `id,count,active
1,42,true`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({
				autoParseNumbers: true,
				autoParseBooleans: true,
			});

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: 1, count: 42, active: true }]);
		});
	});

	describe("BOM handling", () => {
		it("should strip UTF-8 BOM by default", async () => {
			const csvContent = `\uFEFFid,name
1,Alice`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", name: "Alice" }]);
		});

		it("should not strip BOM when stripBom is false", async () => {
			const csvContent = `\uFEFFid,name
1,Alice`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ stripBom: false });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			// The BOM should be part of the header
			expect(Object.keys(records[0])[0]).toBe("\uFEFFid");
		});

		it("should strip UTF-16 LE BOM", async () => {
			const csvContent = `\uFFFEid,name
1,Alice`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(Object.keys(records[0])[0]).toBe("id");
		});
	});

	describe("Line ending handling", () => {
		it("should handle CRLF line endings", async () => {
			const csvContent = "id,name\r\n1,Alice\r\n2,Bob";
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("should handle CR line endings", async () => {
			const csvContent = "id,name\r1,Alice\r2,Bob";
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("should handle mixed line endings", async () => {
			const csvContent = "id,name\n1,Alice\r\n2,Bob\r3,Charlie";
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toHaveLength(3);
		});
	});

	describe("Quoted fields", () => {
		it("should handle quoted fields with commas", async () => {
			const csvContent = `id,description
1,"Hello, World"`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", description: "Hello, World" }]);
		});

		it("should handle escaped quotes", async () => {
			const csvContent = `id,quote
1,"He said ""Hello"""`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", quote: 'He said "Hello"' }]);
		});

		it("should handle quoted fields with newlines", async () => {
			const csvContent = `id,bio
1,"Line 1
Line 2"`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", bio: "Line 1\nLine 2" }]);
		});

		it("should handle empty quoted fields", async () => {
			const csvContent = `id,value
1,""`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			// Empty values are omitted
			expect(records).toEqual([{ id: "1" }]);
		});
	});

	describe("Array suffix handling", () => {
		it("should remove array suffix from headers", async () => {
			const csvContent = `id,tags[]
1,javascript`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", tags: "javascript" }]);
		});

		it("should use custom array suffix indicator", async () => {
			const csvContent = `id,tags[*]
1,javascript`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ arraySuffixIndicator: "[*]" });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", tags: "javascript" }]);
		});

		it("should handle nested paths with array suffix", async () => {
			const csvContent = `id,person.skills[]
1,typescript`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", person: { skills: "typescript" } }]);
		});
	});

	describe("Empty values", () => {
		it("should omit empty values from result", async () => {
			const csvContent = `id,name,email
1,Alice,`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", name: "Alice" }]);
		});

		it("should handle row with all empty values", async () => {
			const csvContent = `id,name,email
,,`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			// All empty values result in empty object
			expect(records).toEqual([{}]);
		});
	});

	describe("Event-based usage", () => {
		it("should emit data events for each record", done => {
			const csvContent = `id,name
1,Alice
2,Bob`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];

			stream
				.pipe(parser)
				.on("data", record => {
					records.push(record);
				})
				.on("end", () => {
					expect(records).toEqual([
						{ id: "1", name: "Alice" },
						{ id: "2", name: "Bob" },
					]);
					done();
				})
				.on("error", done);
		});

		it("should emit end event when stream completes", done => {
			const csvContent = `id,name
1,Alice`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			stream
				.pipe(parser)
				.on("data", () => {
					// Consume data to allow end event
				})
				.on("end", () => {
					done();
				})
				.on("error", done);
		});
	});

	describe("Unicode handling", () => {
		it("should handle CJK characters", async () => {
			const csvContent = `id,name
1,田中太郎`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", name: "田中太郎" }]);
		});

		it("should handle emoji characters", async () => {
			const csvContent = `id,emoji
1,🎉`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", emoji: "🎉" }]);
		});
	});

	describe("Buffer handling", () => {
		it("should handle Buffer input", async () => {
			const csvContent = Buffer.from("id,name\n1,Alice");
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: "1", name: "Alice" }]);
		});
	});
});
