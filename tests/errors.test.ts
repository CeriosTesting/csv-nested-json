import { CsvEncodingError, CsvFileNotFoundError, CsvParseError, CsvValidationError } from "../src/errors";

describe("CsvParseError", () => {
	describe("Constructor", () => {
		it("should create error with message only", () => {
			const error = new CsvParseError("Parse error");

			expect(error.message).toBe("Parse error");
			expect(error.name).toBe("CsvParseError");
			expect(error.row).toBeUndefined();
			expect(error.column).toBeUndefined();
		});

		it("should create error with row number", () => {
			const error = new CsvParseError("Parse error", 5);

			expect(error.message).toBe("Parse error");
			expect(error.row).toBe(5);
			expect(error.column).toBeUndefined();
		});

		it("should create error with row and column", () => {
			const error = new CsvParseError("Parse error", 5, 10);

			expect(error.message).toBe("Parse error");
			expect(error.row).toBe(5);
			expect(error.column).toBe(10);
		});

		it("should handle row 0", () => {
			const error = new CsvParseError("Error at row 0", 0);

			expect(error.row).toBe(0);
		});

		it("should handle column 0", () => {
			const error = new CsvParseError("Error at column 0", 1, 0);

			expect(error.column).toBe(0);
		});
	});

	describe("Inheritance", () => {
		it("should be instance of Error", () => {
			const error = new CsvParseError("Parse error");

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(CsvParseError);
		});

		it("should have proper prototype chain", () => {
			const error = new CsvParseError("Parse error");

			expect(Object.getPrototypeOf(error)).toBe(CsvParseError.prototype);
		});
	});

	describe("Stack trace", () => {
		it("should have stack trace", () => {
			const error = new CsvParseError("Parse error");

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain("CsvParseError");
		});
	});

	describe("Throwable", () => {
		it("should be throwable and catchable", () => {
			expect(() => {
				throw new CsvParseError("Test error");
			}).toThrow(CsvParseError);
		});

		it("should be catchable as Error", () => {
			expect(() => {
				throw new CsvParseError("Test error");
			}).toThrow(Error);
		});
	});
});

describe("CsvFileNotFoundError", () => {
	describe("Constructor", () => {
		it("should create error with file path", () => {
			const error = new CsvFileNotFoundError("/path/to/file.csv");

			expect(error.message).toBe("CSV file not found: /path/to/file.csv");
			expect(error.name).toBe("CsvFileNotFoundError");
			expect(error.filePath).toBe("/path/to/file.csv");
		});

		it("should handle Windows-style paths", () => {
			const error = new CsvFileNotFoundError("C:\\Users\\Test\\file.csv");

			expect(error.filePath).toBe("C:\\Users\\Test\\file.csv");
			expect(error.message).toContain("C:\\Users\\Test\\file.csv");
		});

		it("should handle relative paths", () => {
			const error = new CsvFileNotFoundError("./data/file.csv");

			expect(error.filePath).toBe("./data/file.csv");
		});

		it("should handle paths with spaces", () => {
			const error = new CsvFileNotFoundError("/path/to/my file.csv");

			expect(error.filePath).toBe("/path/to/my file.csv");
		});

		it("should handle empty path", () => {
			const error = new CsvFileNotFoundError("");

			expect(error.filePath).toBe("");
			expect(error.message).toBe("CSV file not found: ");
		});
	});

	describe("Inheritance", () => {
		it("should be instance of CsvParseError", () => {
			const error = new CsvFileNotFoundError("/path");

			expect(error).toBeInstanceOf(CsvParseError);
		});

		it("should be instance of Error", () => {
			const error = new CsvFileNotFoundError("/path");

			expect(error).toBeInstanceOf(Error);
		});
	});

	describe("Properties", () => {
		it("should have row and column as undefined", () => {
			const error = new CsvFileNotFoundError("/path");

			// Inherited from CsvParseError but not set
			expect(error.row).toBeUndefined();
			expect(error.column).toBeUndefined();
		});
	});
});

describe("CsvValidationError", () => {
	describe("Constructor", () => {
		it("should create error with all properties", () => {
			const error = new CsvValidationError("Row has wrong number of columns", 3, 5, 7);

			expect(error.message).toBe("Row has wrong number of columns");
			expect(error.name).toBe("CsvValidationError");
			expect(error.row).toBe(3);
			expect(error.expectedColumns).toBe(5);
			expect(error.actualColumns).toBe(7);
		});

		it("should handle fewer columns than expected", () => {
			const error = new CsvValidationError("Too few columns", 2, 5, 3);

			expect(error.expectedColumns).toBe(5);
			expect(error.actualColumns).toBe(3);
		});

		it("should handle more columns than expected", () => {
			const error = new CsvValidationError("Too many columns", 2, 3, 10);

			expect(error.expectedColumns).toBe(3);
			expect(error.actualColumns).toBe(10);
		});

		it("should handle row 1", () => {
			const error = new CsvValidationError("Error at first row", 1, 2, 3);

			expect(error.row).toBe(1);
		});

		it("should handle 0 expected columns", () => {
			const error = new CsvValidationError("Empty header", 1, 0, 5);

			expect(error.expectedColumns).toBe(0);
		});

		it("should handle 0 actual columns", () => {
			const error = new CsvValidationError("Empty row", 2, 5, 0);

			expect(error.actualColumns).toBe(0);
		});
	});

	describe("Inheritance", () => {
		it("should be instance of CsvParseError", () => {
			const error = new CsvValidationError("test", 1, 2, 3);

			expect(error).toBeInstanceOf(CsvParseError);
		});

		it("should be instance of Error", () => {
			const error = new CsvValidationError("test", 1, 2, 3);

			expect(error).toBeInstanceOf(Error);
		});
	});

	describe("Use case", () => {
		it("should provide useful information for debugging", () => {
			const error = new CsvValidationError("Row 5 has 7 columns but expected 4", 5, 4, 7);

			expect(error.message).toContain("5");
			expect(error.message).toContain("7");
			expect(error.message).toContain("4");
			expect(error.row).toBe(5);
			expect(error.expectedColumns).toBe(4);
			expect(error.actualColumns).toBe(7);
		});
	});
});

describe("CsvEncodingError", () => {
	describe("Constructor", () => {
		it("should create error with encoding information", () => {
			const error = new CsvEncodingError("Invalid encoding", "utf-16");

			expect(error.message).toBe("Invalid encoding");
			expect(error.name).toBe("CsvEncodingError");
			expect(error.encoding).toBe("utf-16");
		});

		it("should handle undefined encoding", () => {
			const error = new CsvEncodingError("Unknown encoding issue");

			expect(error.message).toBe("Unknown encoding issue");
			expect(error.encoding).toBeUndefined();
		});

		it("should handle common encodings", () => {
			const encodings = ["utf-8", "utf-16", "ascii", "latin1", "iso-8859-1"];

			for (const encoding of encodings) {
				const error = new CsvEncodingError(`Error with ${encoding}`, encoding);
				expect(error.encoding).toBe(encoding);
			}
		});

		it("should handle empty encoding string", () => {
			const error = new CsvEncodingError("Empty encoding", "");

			expect(error.encoding).toBe("");
		});
	});

	describe("Inheritance", () => {
		it("should be instance of CsvParseError", () => {
			const error = new CsvEncodingError("test", "utf-8");

			expect(error).toBeInstanceOf(CsvParseError);
		});

		it("should be instance of Error", () => {
			const error = new CsvEncodingError("test", "utf-8");

			expect(error).toBeInstanceOf(Error);
		});
	});

	describe("Properties", () => {
		it("should have row and column as undefined", () => {
			const error = new CsvEncodingError("test", "utf-8");

			// Inherited from CsvParseError but not set
			expect(error.row).toBeUndefined();
			expect(error.column).toBeUndefined();
		});
	});

	describe("Use case", () => {
		it("should be useful for BOM-related errors", () => {
			const error = new CsvEncodingError("Unexpected BOM detected for specified encoding", "utf-8");

			expect(error.message).toContain("BOM");
			expect(error.encoding).toBe("utf-8");
		});

		it("should be useful for character encoding errors", () => {
			const error = new CsvEncodingError("Invalid byte sequence for UTF-8", "utf-8");

			expect(error.message).toContain("Invalid byte sequence");
		});
	});
});

describe("Error class relationships", () => {
	it("should maintain proper inheritance hierarchy", () => {
		const parseError = new CsvParseError("base");
		const fileError = new CsvFileNotFoundError("/path");
		const validationError = new CsvValidationError("test", 1, 2, 3);
		const encodingError = new CsvEncodingError("test", "utf-8");

		// CsvParseError -> Error
		expect(parseError).toBeInstanceOf(Error);
		expect(parseError).not.toBeInstanceOf(CsvFileNotFoundError);
		expect(parseError).not.toBeInstanceOf(CsvValidationError);
		expect(parseError).not.toBeInstanceOf(CsvEncodingError);

		// CsvFileNotFoundError -> CsvParseError -> Error
		expect(fileError).toBeInstanceOf(Error);
		expect(fileError).toBeInstanceOf(CsvParseError);
		expect(fileError).not.toBeInstanceOf(CsvValidationError);
		expect(fileError).not.toBeInstanceOf(CsvEncodingError);

		// CsvValidationError -> CsvParseError -> Error
		expect(validationError).toBeInstanceOf(Error);
		expect(validationError).toBeInstanceOf(CsvParseError);
		expect(validationError).not.toBeInstanceOf(CsvFileNotFoundError);
		expect(validationError).not.toBeInstanceOf(CsvEncodingError);

		// CsvEncodingError -> CsvParseError -> Error
		expect(encodingError).toBeInstanceOf(Error);
		expect(encodingError).toBeInstanceOf(CsvParseError);
		expect(encodingError).not.toBeInstanceOf(CsvFileNotFoundError);
		expect(encodingError).not.toBeInstanceOf(CsvValidationError);
	});

	it("should allow catching all CSV errors with CsvParseError", () => {
		const errors = [
			new CsvParseError("base"),
			new CsvFileNotFoundError("/path"),
			new CsvValidationError("test", 1, 2, 3),
			new CsvEncodingError("test", "utf-8"),
		];

		for (const error of errors) {
			expect(error).toBeInstanceOf(CsvParseError);
		}
	});

	it("should have unique error names", () => {
		const parseError = new CsvParseError("test");
		const fileError = new CsvFileNotFoundError("/path");
		const validationError = new CsvValidationError("test", 1, 2, 3);
		const encodingError = new CsvEncodingError("test", "utf-8");

		const names = [parseError.name, fileError.name, validationError.name, encodingError.name];

		const uniqueNames = new Set(names);
		expect(uniqueNames.size).toBe(4);
	});
});

describe("Error handling patterns", () => {
	it("should support try-catch with specific error types", () => {
		try {
			throw new CsvFileNotFoundError("/nonexistent.csv");
		} catch (error) {
			if (error instanceof CsvFileNotFoundError) {
				expect(error.filePath).toBe("/nonexistent.csv");
			} else {
				fail("Should have caught CsvFileNotFoundError");
			}
		}
	});

	it("should support error type checking", () => {
		const error = new CsvValidationError("test", 2, 3, 5);

		if (error instanceof CsvValidationError) {
			expect(error.expectedColumns).toBe(3);
			expect(error.actualColumns).toBe(5);
		}
	});

	it("should support switch-like error handling by name", () => {
		const errors = [
			new CsvParseError("parse"),
			new CsvFileNotFoundError("/path"),
			new CsvValidationError("validation", 1, 2, 3),
			new CsvEncodingError("encoding", "utf-8"),
		];

		const handledNames: string[] = [];

		for (const error of errors) {
			switch (error.name) {
				case "CsvParseError":
					handledNames.push("parse");
					break;
				case "CsvFileNotFoundError":
					handledNames.push("file");
					break;
				case "CsvValidationError":
					handledNames.push("validation");
					break;
				case "CsvEncodingError":
					handledNames.push("encoding");
					break;
			}
		}

		expect(handledNames).toEqual(["parse", "file", "validation", "encoding"]);
	});
});
