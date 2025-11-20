import { CsvReader } from "../src/csv-reader";

describe("CsvReader", () => {
	describe("parse", () => {
		it("should return empty array for empty content", () => {
			const result = CsvReader.parse("");
			expect(result).toEqual([]);
		});

		it("should return empty array for whitespace-only content", () => {
			const result = CsvReader.parse("   \n  \n  ");
			expect(result).toEqual([]);
		});

		it("should return empty array for CSV with only headers", () => {
			const content = "id,name,email\n";
			const result = CsvReader.parse(content);
			expect(result).toEqual([]);
		});

		it("should parse simple CSV with single record", () => {
			const content = "id,name,email\n1,John Doe,john@example.com";
			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{
					id: "1",
					name: "John Doe",
					email: "john@example.com",
				},
			]);
		});

		it("should parse CSV with multiple records", () => {
			const content = "id,name,age\n1,Alice,25\n2,Bob,30\n3,Charlie,35";
			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
				{ id: "3", name: "Charlie", age: "35" },
			]);
		});

		it("should skip empty lines", () => {
			const content = "id,name\n1,Alice\n\n2,Bob\n\n";
			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("should handle empty values correctly", () => {
			const content = "id,name,email,phone\n1,Alice,alice@example.com,\n2,Bob,,555-1234";
			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{ id: "1", name: "Alice", email: "alice@example.com", phone: "" },
				{ id: "2", name: "Bob", email: "", phone: "555-1234" },
			]);
		});

		it("should use custom delimiter", () => {
			const content = "id;name;age\n1;Alice;25\n2;Bob;30";
			const result = CsvReader.parse(content, { delimiter: ";" });

			expect(result).toEqual([
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
			]);
		});

		it("should use custom quote character", () => {
			const content = "id,name,description\n1,John,'A developer, designer'";
			const result = CsvReader.parse(content, { quote: "'" });

			expect(result).toEqual([{ id: "1", name: "John", description: "A developer, designer" }]);
		});
	});

	describe("parse - quoted fields", () => {
		it("should handle quoted fields with commas", () => {
			const content = 'id,name,description\n1,John,"A developer, designer, and writer"';
			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					description: "A developer, designer, and writer",
				},
			]);
		});

		it("should handle quoted fields with newlines", () => {
			const content = 'id,name,bio\n1,Alice,"Line 1\nLine 2\nLine 3"';
			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{
					id: "1",
					name: "Alice",
					bio: "Line 1\nLine 2\nLine 3",
				},
			]);
		});

		it("should handle escaped quotes in fields", () => {
			const content = 'id,name,quote\n1,Bob,"He said ""Hello"" to me"';
			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{
					id: "1",
					name: "Bob",
					quote: 'He said "Hello" to me',
				},
			]);
		});
	});

	describe("parse - line endings", () => {
		it("should handle Windows line endings (CRLF)", () => {
			const content = "id,name\r\n1,Alice\r\n2,Bob\r\n";
			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("should handle Unix line endings (LF)", () => {
			const content = "id,name\n1,Alice\n2,Bob\n";
			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("should handle Mac line endings (CR)", () => {
			const content = "id,name\r1,Alice\r2,Bob\r";
			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});
	});

	describe("parse - validation modes", () => {
		it("should warn about extra values (default)", () => {
			const content = "id,name,email\n1,Alice,alice@example.com,extra1,extra2\n2,Bob,bob@example.com,extra3";
			const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

			const result = CsvReader.parse(content);

			expect(result).toEqual([
				{ id: "1", name: "Alice", email: "alice@example.com" },
				{ id: "2", name: "Bob", email: "bob@example.com" },
			]);
			expect(consoleWarnSpy).toHaveBeenCalledTimes(2);

			consoleWarnSpy.mockRestore();
		});

		it("should ignore extra values when validationMode is 'ignore'", () => {
			const content = "id,name\n1,Alice,extra1\n2,Bob,extra2";
			const result = CsvReader.parse(content, { validationMode: "ignore" });

			expect(result).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);
		});

		it("should warn about extra values when validationMode is 'warn'", () => {
			const content = "id,name\n1,Alice,extra1\n2,Bob,extra2,extra3";
			const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

			const result = CsvReader.parse(content, { validationMode: "warn" });

			expect(result).toEqual([
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			]);

			expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				"Warning: Row 2 has 3 values but only 2 columns defined. Extra values will be ignored."
			);
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				"Warning: Row 3 has 4 values but only 2 columns defined. Extra values will be ignored."
			);

			consoleWarnSpy.mockRestore();
		});

		it("should throw error about extra values when validationMode is 'error'", () => {
			const content = "id,name\n1,Alice,extra1\n2,Bob";

			expect(() => {
				CsvReader.parse(content, { validationMode: "error" });
			}).toThrow("Row 2 has 3 values but only 2 columns defined.");
		});
	});

	describe("splitLines", () => {
		it("should split lines by LF", () => {
			const content = "line1\nline2\nline3";
			const result = CsvReader.splitLines(content);
			expect(result).toEqual(["line1", "line2", "line3"]);
		});

		it("should split lines by CRLF", () => {
			const content = "line1\r\nline2\r\nline3";
			const result = CsvReader.splitLines(content);
			expect(result).toEqual(["line1", "line2", "line3"]);
		});

		it("should split lines by CR", () => {
			const content = "line1\rline2\rline3";
			const result = CsvReader.splitLines(content);
			expect(result).toEqual(["line1", "line2", "line3"]);
		});

		it("should not split quoted text with newlines", () => {
			const content = 'line1,"text\nwith\nnewlines",line2';
			const result = CsvReader.splitLines(content);
			expect(result).toEqual(['line1,"text\nwith\nnewlines",line2']);
		});

		it("should handle empty content", () => {
			const result = CsvReader.splitLines("");
			expect(result).toEqual([]);
		});
	});

	describe("parseLine", () => {
		it("should parse simple line", () => {
			const line = "value1,value2,value3";
			const result = CsvReader.parseLine(line);
			expect(result).toEqual(["value1", "value2", "value3"]);
		});

		it("should handle quoted values with commas", () => {
			const line = 'value1,"value2,with,commas",value3';
			const result = CsvReader.parseLine(line);
			expect(result).toEqual(["value1", "value2,with,commas", "value3"]);
		});

		it("should handle escaped quotes", () => {
			const line = 'value1,"value with ""quotes""",value3';
			const result = CsvReader.parseLine(line);
			expect(result).toEqual(["value1", 'value with "quotes"', "value3"]);
		});

		it("should handle custom delimiter", () => {
			const line = "value1;value2;value3";
			const result = CsvReader.parseLine(line, ";");
			expect(result).toEqual(["value1", "value2", "value3"]);
		});

		it("should handle custom quote character", () => {
			const line = "value1,'value2,with,commas',value3";
			const result = CsvReader.parseLine(line, ",", "'");
			expect(result).toEqual(["value1", "value2,with,commas", "value3"]);
		});

		it("should handle empty values", () => {
			const line = "value1,,value3";
			const result = CsvReader.parseLine(line);
			expect(result).toEqual(["value1", "", "value3"]);
		});

		it("should handle trailing empty value", () => {
			const line = "value1,value2,";
			const result = CsvReader.parseLine(line);
			expect(result).toEqual(["value1", "value2", ""]);
		});
	});
});
