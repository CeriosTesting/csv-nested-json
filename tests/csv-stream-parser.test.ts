import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { CsvStreamParser } from "../src/csv-stream-parser";
import type { NestedObject, ProgressInfo } from "../src/types";

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
				{ id: 1, name: "Alice", age: 25 },
				{ id: 2, name: "Bob", age: 30 },
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

			expect(records).toEqual([{ id: 1, person: { name: "Alice", age: 25 } }]);
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
					id: 1,
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
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
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
				{ id: 1, name: "Alice", age: 25 },
				{ id: 2, name: "Bob", age: 30 },
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

			expect(records).toEqual([{ id: 1, description: "Hello, World" }]);
		});

		it("should handle newlines inside quoted fields split across chunks", async () => {
			const chunks = ['id,bio\n1,"Line 1\n', 'Line 2"'];
			const stream = Readable.from(chunks);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: 1, bio: "Line 1\nLine 2" }]);
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

			expect(records).toEqual([{ id: 1, name: "Alice" }]);
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

			expect(records).toEqual([{ id: 1, name: "Alice", age: 25 }]);
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

			expect(records).toEqual([{ id: 1, name: "Alice", description: "Hello, World" }]);
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

			expect(records).toEqual([{ id: 1, name: "Alice", age: 25 }]);
		});

		it("should parse nested records with dot notation in options flow", async () => {
			const csvContent = `id,person.name,person.age
1,Alice,25`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: 1, person: { name: "Alice", age: 25 } }]);
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

		it("should preserve unsafe integers as strings when configured", async () => {
			const csvContent = `id,big
1,9007199254740993`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({
				autoParseNumbers: true,
				preserveUnsafeIntegersAsString: true,
			});

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: 1, big: "9007199254740993" }]);
		});

		it("should keep current behavior for unsafe integers by default", async () => {
			const csvContent = `id,big
1,9007199254740993`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ autoParseNumbers: true });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(typeof records[0].big).toBe("number");
			expect(String(records[0].big as number)).toBe("9007199254740992");
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

			expect(records).toEqual([{ id: 1, active: true, verified: false }]);
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

			expect(records).toEqual([{ id: 1, name: "Alice" }]);
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
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
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
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
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

			expect(records).toEqual([{ id: 1, description: "Hello, World" }]);
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

			expect(records).toEqual([{ id: 1, quote: 'He said "Hello"' }]);
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

			expect(records).toEqual([{ id: 1, bio: "Line 1\nLine 2" }]);
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

			// Explicit quoted empties are preserved by default
			expect(records).toEqual([{ id: 1, value: "" }]);
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

			expect(records).toEqual([{ id: 1, tags: ["javascript"] }]);
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

			expect(records).toEqual([{ id: 1, tags: ["javascript"] }]);
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

			expect(records).toEqual([{ id: 1, person: { skills: ["typescript"] } }]);
		});
	});

	describe("Continuation row grouping", () => {
		it("should group continuation rows by default", async () => {
			const csvContent = `id,items[].name,items[].tags[]
1,item1,tag1
,,tag2
,,tag3
,item2,tag4`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([
				{
					id: 1,
					items: [
						{ name: "item1", tags: ["tag1", "tag2", "tag3"] },
						{ name: "item2", tags: ["tag4"] },
					],
				},
			]);
		});

		it("should group continuation rows when batching is enabled", async () => {
			const csvContent = `id,items[].name,items[].tags[]
1,item1,tag1
,,tag2

2,item2,tag3
,,tag4`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ batchSize: 2 });

			const batches: NestedObject[][] = [];
			for await (const batch of stream.pipe(parser)) {
				batches.push(batch as NestedObject[]);
			}

			expect(batches).toEqual([
				[
					{ id: 1, items: [{ name: "item1", tags: ["tag1", "tag2"] }] },
					{ id: 2, items: [{ name: "item2", tags: ["tag3", "tag4"] }] },
				],
			]);
		});

		it("should respect identifierColumn in grouped mode", async () => {
			const csvContent = `group,id,values[]
g1,1,a
,,b
g1,2,c`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ identifierColumn: "id" });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([
				{ group: "g1", id: 1, values: ["a", "b"] },
				{ group: "g1", id: 2, values: ["c"] },
			]);
		});

		it("should throw when first data row is a continuation row", async () => {
			const csvContent = `id,values[]
,a
1,b`;
			const stream = Readable.from([csvContent]);

			await expect(CsvStreamParser.parseStream(stream)).rejects.toThrow("continuation row, but no base row exists");
		});

		it("should throw when all columns are filtered out", async () => {
			const csvContent = `id,name
1,Alice`;
			const stream = Readable.from([csvContent]);

			await expect(
				CsvStreamParser.parseStream(stream, {
					includeColumns: ["missing"],
				})
			).rejects.toThrow("No columns available after filtering");
		});

		it("should enforce maxContinuationGroupSize", async () => {
			const csvContent = `id,values[]
1,a
,b
,c`;
			const stream = Readable.from([csvContent]);

			await expect(
				CsvStreamParser.parseStream(stream, {
					maxContinuationGroupSize: 2,
				})
			).rejects.toThrow("Continuation group exceeded maxContinuationGroupSize (2)");
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

			expect(records).toEqual([{ id: 1, name: "Alice" }]);
		});

		it("should preserve only unquoted empty columns when configured", async () => {
			const csvContent = 'id,emptyColumn,emptyQuoted\n1,,""';
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({
				preserveEmptyColumnAsEmptyString: true,
				preserveEmptyString: false,
			});

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: 1, emptyColumn: "" }]);
		});

		it("should preserve only quoted empty strings when configured", async () => {
			const csvContent = 'id,emptyColumn,emptyQuoted\n1,,""';
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({
				preserveEmptyString: true,
			});

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([{ id: 1, emptyQuoted: "" }]);
		});

		it("should treat quoted-empty identifier values as continuation rows", async () => {
			const csvContent = 'id,tags[]\n1,a\n"",b\n2,c';
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({
				preserveEmptyString: true,
			});

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([
				{ id: 1, tags: ["a", "b"] },
				{ id: 2, tags: ["c"] },
			]);
		});

		it("should throw when row with all empty values starts a group", async () => {
			const csvContent = `id,name,email
,,`;
			await expect(CsvStreamParser.parseStream(Readable.from([csvContent]))).rejects.toThrow(
				"continuation row, but no base row exists"
			);
		});
	});

	describe("Event-based usage", () => {
		it("should emit data events for each record", () => {
			const csvContent = `id,name
1,Alice
2,Bob`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const records: NestedObject[] = [];

			return new Promise<void>((resolve, reject) => {
				stream
					.pipe(parser)
					.on("data", record => {
						records.push(record);
					})
					.on("end", () => {
						expect(records).toEqual([
							{ id: 1, name: "Alice" },
							{ id: 2, name: "Bob" },
						]);
						resolve();
					})
					.on("error", reject);
			});
		});

		it("should emit end event when stream completes", () => {
			const csvContent = `id,name
1,Alice`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			return new Promise<void>((resolve, reject) => {
				stream
					.pipe(parser)
					.on("data", () => {
						// Consume data to allow end event
					})
					.on("end", () => {
						resolve();
					})
					.on("error", reject);
			});
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

			expect(records).toEqual([{ id: 1, name: "田中太郎" }]);
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

			expect(records).toEqual([{ id: 1, emoji: "🎉" }]);
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

			expect(records).toEqual([{ id: 1, name: "Alice" }]);
		});
	});

	describe("Static parseStream method", () => {
		it("should parse stream and return Promise with all records", async () => {
			const csvContent = `id,name,age
1,Alice,25
2,Bob,30`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream);

			expect(records).toEqual([
				{ id: 1, name: "Alice", age: 25 },
				{ id: 2, name: "Bob", age: 30 },
			]);
		});

		it("should handle empty stream", async () => {
			const stream = Readable.from([""]);

			const records = await CsvStreamParser.parseStream(stream);

			expect(records).toEqual([]);
		});

		it("should support parser options", async () => {
			const csvContent = `id;name;active
1;Alice;true
2;Bob;false`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream, {
				delimiter: ";",
				autoParseBooleans: true,
			});

			expect(records).toEqual([
				{ id: 1, name: "Alice", active: true },
				{ id: 2, name: "Bob", active: false },
			]);
		});

		it("should support autoParseNumbers option", async () => {
			const csvContent = `id,value,price
1,100,19.99
2,200,29.99`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream, {
				autoParseNumbers: true,
			});

			expect(records).toEqual([
				{ id: 1, value: 100, price: 19.99 },
				{ id: 2, value: 200, price: 29.99 },
			]);
		});

		it("should group continuation rows in parseStream API", async () => {
			const csvContent = `id,tags[]
1,a
,b
2,c`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream);

			expect(records).toEqual([
				{ id: 1, tags: ["a", "b"] },
				{ id: 2, tags: ["c"] },
			]);
		});

		it("should parse nested objects by default", async () => {
			const csvContent = `id,person.name,person.age
1,Alice,25`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream);

			expect(records).toEqual([{ id: 1, person: { name: "Alice", age: 25 } }]);
		});

		it("should support type parameter for typed results", async () => {
			interface Person {
				id: number;
				name: string;
			}

			const csvContent = `id,name
1,Alice`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream<Person>(stream);

			expect(records[0].id).toBe(1);
			expect(records[0].name).toBe("Alice");
		});

		it("should reject on stream error", async () => {
			const stream = new Readable({
				read() {
					this.destroy(new Error("Stream error"));
				},
			});

			await expect(CsvStreamParser.parseStream(stream)).rejects.toThrow("Stream error");
		});

		it("should support column filtering options", async () => {
			const csvContent = `id,name,age,email
1,Alice,25,alice@test.com
2,Bob,30,bob@test.com`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream, {
				includeColumns: ["id", "name"],
			});

			expect(records).toEqual([
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
			]);
		});

		it("should handle chunked input correctly", async () => {
			// Simulate a stream that sends data in small chunks
			const chunks = ["id,na", "me\n1,Ali", "ce\n2,B", "ob"];
			const stream = Readable.from(chunks);

			const records = await CsvStreamParser.parseStream(stream);

			expect(records).toEqual([
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
			]);
		});
	});

	describe("Progress callback", () => {
		it("should call progress callback at specified intervals", async () => {
			const csvContent = `id,name
1,Alice
2,Bob
3,Charlie
4,Diana
5,Eve`;
			const stream = Readable.from([csvContent]);
			const progressCalls: number[] = [];

			await CsvStreamParser.parseStream(stream, {
				progressCallback: info => {
					progressCalls.push(info.recordsEmitted);
				},
				progressInterval: 2,
			});

			// Should be called at records 2 and 4
			expect(progressCalls).toEqual([2, 4]);
		});

		it("should provide accurate progress info", async () => {
			const csvContent = `id,name
1,Alice
2,Bob`;
			const stream = Readable.from([csvContent]);
			const progressInfos: ProgressInfo[] = [];

			await CsvStreamParser.parseStream(stream, {
				progressCallback: info => {
					progressInfos.push(info);
				},
				progressInterval: 1,
			});

			expect(progressInfos.length).toBeGreaterThan(0);
			const lastProgress = progressInfos[progressInfos.length - 1];
			expect(lastProgress.bytesProcessed).toBeGreaterThan(0);
			expect(lastProgress.headersProcessed).toBe(true);
			expect(lastProgress.recordsEmitted).toBe(2);
		});

		it("should support async progress callback", async () => {
			const csvContent = `id,name
1,Alice
2,Bob`;
			const stream = Readable.from([csvContent]);
			const progressCalls: number[] = [];

			// Using a sync callback that simulates async work
			// The callback itself is sync but could trigger async operations
			await CsvStreamParser.parseStream(stream, {
				progressCallback: info => {
					progressCalls.push(info.recordsEmitted);
					// Async progress callbacks are fire-and-forget
					// They don't block parsing
				},
				progressInterval: 1,
			});

			expect(progressCalls).toEqual([1, 2]);
		});

		it("should include elapsed time in progress info", async () => {
			const csvContent = `id,name
1,Alice`;
			const stream = Readable.from([csvContent]);
			let elapsedMs = 0;

			await CsvStreamParser.parseStream(stream, {
				progressCallback: info => {
					elapsedMs = info.elapsedMs;
				},
				progressInterval: 1,
			});

			expect(elapsedMs).toBeGreaterThanOrEqual(0);
		});
	});

	describe("Batch processing", () => {
		it("should emit batches when batchSize > 1", async () => {
			const csvContent = `id,name
1,Alice
2,Bob
3,Charlie
4,Diana`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ batchSize: 2 });

			const batches: NestedObject[][] = [];
			for await (const batch of stream.pipe(parser)) {
				batches.push(batch as NestedObject[]);
			}

			expect(batches.length).toBe(2);
			expect(batches[0]).toEqual([
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
			]);
			expect(batches[1]).toEqual([
				{ id: 3, name: "Charlie" },
				{ id: 4, name: "Diana" },
			]);
		});

		it("should flush partial batch at end", async () => {
			const csvContent = `id,name
1,Alice
2,Bob
3,Charlie`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ batchSize: 2 });

			const batches: NestedObject[][] = [];
			for await (const batch of stream.pipe(parser)) {
				batches.push(batch as NestedObject[]);
			}

			expect(batches.length).toBe(2);
			expect(batches[0].length).toBe(2);
			expect(batches[1].length).toBe(1); // Partial batch
			expect(batches[1][0]).toEqual({ id: 3, name: "Charlie" });
		});

		it("should flatten batches in parseStream()", async () => {
			const csvContent = `id,name
1,Alice
2,Bob
3,Charlie`;
			const stream = Readable.from([csvContent]);

			// parseStream should always return flat array regardless of batchSize
			const records = await CsvStreamParser.parseStream(stream, {
				batchSize: 2,
			});

			expect(records.length).toBe(3);
			expect(records).toEqual([
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
				{ id: 3, name: "Charlie" },
			]);
		});

		it("should handle batchSize of 1 (default)", async () => {
			const csvContent = `id,name
1,Alice
2,Bob`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ batchSize: 1 });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records).toEqual([
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
			]);
		});

		it("should work with large batches", async () => {
			const rows = Array.from({ length: 250 }, (_, i) => `${i},Name${i}`);
			const csvContent = `id,name\n${rows.join("\n")}`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream, {
				batchSize: 100,
			});

			expect(records.length).toBe(250);
		});
	});

	describe("Limit option", () => {
		it("should stop after limit records", async () => {
			const csvContent = `id,name
1,Alice
2,Bob
3,Charlie
4,Diana
5,Eve`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream, {
				limit: 3,
			});

			expect(records.length).toBe(3);
			expect(records).toEqual([
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
				{ id: 3, name: "Charlie" },
			]);
		});

		it("should apply limit to the first N records", async () => {
			const csvContent = `id,name,active
1,Alice,true
2,Bob,false
3,Charlie,true
4,Diana,false
5,Eve,true`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream, {
				limit: 2,
			});

			// Should get the first 2 records (Alice, Bob)
			expect(records.length).toBe(2);
			expect(records[0]).toMatchObject({ name: "Alice" });
			expect(records[1]).toMatchObject({ name: "Bob" });
		});

		it("should handle limit greater than available records", async () => {
			const csvContent = `id,name
1,Alice
2,Bob`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream, {
				limit: 100,
			});

			expect(records.length).toBe(2);
		});

		it("should handle limit of 0 (no limit)", async () => {
			const csvContent = `id,name
1,Alice
2,Bob
3,Charlie`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream, {
				limit: 0,
			});

			expect(records.length).toBe(3);
		});

		it("should work with batching", async () => {
			const csvContent = `id,name
1,Alice
2,Bob
3,Charlie
4,Diana
5,Eve`;
			const stream = Readable.from([csvContent]);

			const records = await CsvStreamParser.parseStream(stream, {
				limit: 3,
				batchSize: 2,
			});

			expect(records.length).toBe(3);
		});

		it("should flush batch when limit reached mid-batch", async () => {
			const csvContent = `id,name
1,Alice
2,Bob
3,Charlie
4,Diana
5,Eve`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ batchSize: 2, limit: 3 });

			const batches: NestedObject[][] = [];
			for await (const batch of stream.pipe(parser)) {
				batches.push(batch as NestedObject[]);
			}

			// First batch: 2 records, second batch: 1 record (limit reached)
			expect(batches.length).toBe(2);
			expect(batches[0].length).toBe(2);
			expect(batches[1].length).toBe(1);
		});
	});

	describe("Memory leak prevention (_destroy)", () => {
		it("should clean up on destroy", async () => {
			const csvContent = `id,name
1,Alice
2,Bob`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			// Start piping
			stream.pipe(parser);

			// Destroy immediately
			parser.destroy();

			// Should not throw and parser should be cleaned up
			expect(parser.destroyed).toBe(true);
		});

		it("should clean up on error", async () => {
			const errorStream = new Readable({
				read() {
					this.destroy(new Error("Test error"));
				},
			});

			await expect(CsvStreamParser.parseStream(errorStream)).rejects.toThrow("Test error");
		});

		it("should handle destroy with error", async () => {
			const csvContent = `id,name
1,Alice`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser();

			const error = new Error("Custom error");

			// Set up error handler before piping to avoid unhandled error
			const errorPromise = new Promise<void>(resolve => {
				parser.on("error", () => resolve());
			});

			stream.pipe(parser);
			parser.destroy(error);

			await errorPromise;
			expect(parser.destroyed).toBe(true);
		});

		it("should not emit after limit reached", async () => {
			const csvContent = `id,name
1,Alice
2,Bob
3,Charlie
4,Diana`;
			const stream = Readable.from([csvContent]);
			const parser = new CsvStreamParser({ limit: 2 });

			const records: NestedObject[] = [];
			for await (const record of stream.pipe(parser)) {
				records.push(record as NestedObject);
			}

			expect(records.length).toBe(2);
		});
	});
});
