import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { CsvParser } from "../src/csv-parser";
import { TestFolderHelper } from "./test-folder-helper";

const testFolderHelper = new TestFolderHelper("csv-parser-integration-tests");

describe("CsvParser - Integration Tests", () => {
	beforeAll(() => testFolderHelper.setupTestDir());
	afterAll(() => testFolderHelper.cleanupTestDir());

	describe("parseFileSync", () => {
		it("should parse CSV file synchronously", () => {
			const csvPath = path.join(testFolderHelper.testFolder, "integration-sync.csv");
			const csvContent = `id,name,address.city
1,Alice,NYC
2,Bob,LA`;
			fs.writeFileSync(csvPath, csvContent);

			const result = CsvParser.parseFileSync(csvPath);

			expect(result).toEqual([
				{ id: "1", name: "Alice", address: { city: "NYC" } },
				{ id: "2", name: "Bob", address: { city: "LA" } },
			]);
		});

		it("should throw error when file does not exist", () => {
			expect(() => {
				CsvParser.parseFileSync("non-existent-file.csv");
			}).toThrow("CSV file not found: non-existent-file.csv");
		});

		it("should handle custom options", () => {
			const csvPath = path.join(testFolderHelper.testFolder, "integration-semicolon.csv");
			const csvContent = `id;name;age
1;Alice;25
2;Bob;30`;
			fs.writeFileSync(csvPath, csvContent);

			const result = CsvParser.parseFileSync(csvPath, { delimiter: ";" });

			expect(result).toEqual([
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
			]);
		});
	});

	describe("parseFile", () => {
		it("should parse CSV file asynchronously", async () => {
			const csvPath = path.join(testFolderHelper.testFolder, "integration-async.csv");
			const csvContent = `id,name,address.city
1,Alice,NYC
2,Bob,LA`;
			fs.writeFileSync(csvPath, csvContent);

			const result = await CsvParser.parseFile(csvPath);

			expect(result).toEqual([
				{ id: "1", name: "Alice", address: { city: "NYC" } },
				{ id: "2", name: "Bob", address: { city: "LA" } },
			]);
		});

		it("should throw error when file does not exist", async () => {
			await expect(CsvParser.parseFile("non-existent-file.csv")).rejects.toThrow(
				"CSV file not found: non-existent-file.csv"
			);
		});

		it("should handle custom options", async () => {
			const csvPath = path.join(testFolderHelper.testFolder, "integration-async-semicolon.csv");
			const csvContent = `id;name;age
1;Alice;25
2;Bob;30`;
			fs.writeFileSync(csvPath, csvContent);

			const result = await CsvParser.parseFile(csvPath, { delimiter: ";" });

			expect(result).toEqual([
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
			]);
		});
	});

	describe("parseString", () => {
		it("should parse CSV string content", () => {
			const csvContent = `id,name,address.city
1,Alice,NYC
2,Bob,LA`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{ id: "1", name: "Alice", address: { city: "NYC" } },
				{ id: "2", name: "Bob", address: { city: "LA" } },
			]);
		});

		it("should return empty array for empty string", () => {
			const result = CsvParser.parseString("");
			expect(result).toEqual([]);
		});

		it("should handle custom options", () => {
			const csvContent = `id;name;age
1;Alice;25
2;Bob;30`;

			const result = CsvParser.parseString(csvContent, { delimiter: ";" });

			expect(result).toEqual([
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
			]);
		});

		it("should handle arrays in continuation rows", () => {
			const csvContent = `id,name,skills
1,Alice,JavaScript
,,TypeScript
,,React`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					name: "Alice",
					skills: ["JavaScript", "TypeScript", "React"],
				},
			]);
		});
	});

	describe("parseStream", () => {
		it("should parse CSV from readable stream", async () => {
			const csvPath = path.join(testFolderHelper.testFolder, "integration-stream.csv");
			const csvContent = `id,name,address.city
1,Alice,NYC
2,Bob,LA`;
			fs.writeFileSync(csvPath, csvContent);

			const stream = fs.createReadStream(csvPath);
			const result = await CsvParser.parseStream(stream);

			expect(result).toEqual([
				{ id: "1", name: "Alice", address: { city: "NYC" } },
				{ id: "2", name: "Bob", address: { city: "LA" } },
			]);
		});

		it("should parse CSV from string stream", async () => {
			const csvContent = `id,name,address.city
1,Alice,NYC
2,Bob,LA`;
			const stream = Readable.from([csvContent]);

			const result = await CsvParser.parseStream(stream);

			expect(result).toEqual([
				{ id: "1", name: "Alice", address: { city: "NYC" } },
				{ id: "2", name: "Bob", address: { city: "LA" } },
			]);
		});

		it("should handle stream errors", async () => {
			const stream = fs.createReadStream("non-existent-file.csv");
			await expect(CsvParser.parseStream(stream)).rejects.toThrow();
		});

		it("should handle custom options", async () => {
			const csvContent = `id;name;age
1;Alice;25
2;Bob;30`;
			const stream = Readable.from([csvContent]);

			const result = await CsvParser.parseStream(stream, { delimiter: ";" });

			expect(result).toEqual([
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
			]);
		});
	});

	describe("End-to-end complex scenarios", () => {
		it("should handle realistic user data with all features", () => {
			const csvContent = `id,username,email,profile.firstName,profile.lastName,addresses.type,addresses.street,addresses.city
1,johndoe,john@example.com,John,Doe,home,123 Main St,NYC
,,,,,work,456 Office Blvd,NYC
2,janedoe,jane@example.com,Jane,Doe,home,789 Park Ave,Boston`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					username: "johndoe",
					email: "john@example.com",
					profile: {
						firstName: "John",
						lastName: "Doe",
					},
					addresses: [
						{ type: "home", street: "123 Main St", city: "NYC" },
						{ type: "work", street: "456 Office Blvd", city: "NYC" },
					],
				},
				{
					id: "2",
					username: "janedoe",
					email: "jane@example.com",
					profile: {
						firstName: "Jane",
						lastName: "Doe",
					},
					addresses: [{ type: "home", street: "789 Park Ave", city: "Boston" }],
				},
			]);
		});

		it("should handle European CSV format (semicolon delimiter)", () => {
			const csvContent = `id;name;price;description
1;Product A;19,99;"A great product, very useful"
2;Product B;29,99;"Another product, even better"`;

			const result = CsvParser.parseString(csvContent, { delimiter: ";" });

			expect(result).toEqual([
				{ id: "1", name: "Product A", price: "19,99", description: "A great product, very useful" },
				{ id: "2", name: "Product B", price: "29,99", description: "Another product, even better" },
			]);
		});

		it("should handle mixed nesting and arrays", () => {
			const csvContent = `id,company,projects.name,projects.team.lead,projects.team.size
1,TechCorp,Website,Alice,5
,,Mobile App,Bob,8
2,DesignCo,Dashboard,Charlie,3`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					company: "TechCorp",
					projects: [
						{ name: "Website", team: { lead: "Alice", size: "5" } },
						{ name: "Mobile App", team: { lead: "Bob", size: "8" } },
					],
				},
				{
					id: "2",
					company: "DesignCo",
					projects: [{ name: "Dashboard", team: { lead: "Charlie", size: "3" } }],
				},
			]);
		});
	});
});
