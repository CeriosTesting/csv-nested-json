import fs from "node:fs";
import path from "node:path";
import { CsvFileReader } from "../src/csv-file-reader";
import { cleanupTestDir, setupTestDir, TEST_DATA_DIR } from "./test-helpers";

describe("CsvFileReader", () => {
	beforeAll(() => setupTestDir());
	afterAll(() => cleanupTestDir());

	describe("readFileSync", () => {
		it("should throw error when CSV file does not exist", () => {
			expect(() => {
				CsvFileReader.readFileSync("non-existent-file.csv");
			}).toThrow("CSV file non-existent-file.csv not found.");
		});

		it("should read CSV file content synchronously", () => {
			const csvPath = path.join(TEST_DATA_DIR, "simple.csv");
			const content = "id,name\n1,Alice\n2,Bob";
			fs.writeFileSync(csvPath, content);

			const result = CsvFileReader.readFileSync(csvPath);

			expect(result).toBe(content);
		});

		it("should read empty CSV file", () => {
			const csvPath = path.join(TEST_DATA_DIR, "empty.csv");
			fs.writeFileSync(csvPath, "");

			const result = CsvFileReader.readFileSync(csvPath);

			expect(result).toBe("");
		});

		it("should respect encoding option", () => {
			const csvPath = path.join(TEST_DATA_DIR, "utf8.csv");
			const content = "id,name\n1,Café";
			fs.writeFileSync(csvPath, content, "utf-8");

			const result = CsvFileReader.readFileSync(csvPath, { encoding: "utf-8" });

			expect(result).toBe(content);
		});
	});

	describe("readFile", () => {
		it("should throw error when CSV file does not exist", async () => {
			await expect(CsvFileReader.readFile("non-existent-file.csv")).rejects.toThrow(
				"CSV file non-existent-file.csv not found."
			);
		});

		it("should read CSV file content asynchronously", async () => {
			const csvPath = path.join(TEST_DATA_DIR, "async-simple.csv");
			const content = "id,name\n1,Alice\n2,Bob";
			fs.writeFileSync(csvPath, content);

			const result = await CsvFileReader.readFile(csvPath);

			expect(result).toBe(content);
		});

		it("should read empty CSV file asynchronously", async () => {
			const csvPath = path.join(TEST_DATA_DIR, "async-empty.csv");
			fs.writeFileSync(csvPath, "");

			const result = await CsvFileReader.readFile(csvPath);

			expect(result).toBe("");
		});

		it("should respect encoding option", async () => {
			const csvPath = path.join(TEST_DATA_DIR, "async-utf8.csv");
			const content = "id,name\n1,Café";
			fs.writeFileSync(csvPath, content, "utf-8");

			const result = await CsvFileReader.readFile(csvPath, { encoding: "utf-8" });

			expect(result).toBe(content);
		});
	});

	describe("readStream", () => {
		it("should read CSV from readable stream", async () => {
			const csvPath = path.join(TEST_DATA_DIR, "stream-simple.csv");
			const content = "id,name\n1,Alice\n2,Bob";
			fs.writeFileSync(csvPath, content);

			const stream = fs.createReadStream(csvPath);
			const result = await CsvFileReader.readStream(stream);

			expect(result).toBe(content);
		});

		it("should read empty stream", async () => {
			const csvPath = path.join(TEST_DATA_DIR, "stream-empty.csv");
			fs.writeFileSync(csvPath, "");

			const stream = fs.createReadStream(csvPath);
			const result = await CsvFileReader.readStream(stream);

			expect(result).toBe("");
		});

		it("should handle stream errors", async () => {
			const stream = fs.createReadStream("non-existent-file.csv");

			await expect(CsvFileReader.readStream(stream)).rejects.toThrow();
		});

		it("should respect encoding option", async () => {
			const csvPath = path.join(TEST_DATA_DIR, "stream-utf8.csv");
			const content = "id,name\n1,Café";
			fs.writeFileSync(csvPath, content, "utf-8");

			const stream = fs.createReadStream(csvPath);
			const result = await CsvFileReader.readStream(stream, { encoding: "utf-8" });

			expect(result).toBe(content);
		});
	});
});
