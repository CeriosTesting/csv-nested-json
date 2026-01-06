import fs from "node:fs";
import path from "node:path";
import { CsvParser } from "../src/csv-parser";

const TEST_DATA_DIR = path.join(__dirname, "test-data");

describe("CsvParser", () => {
	beforeAll(() => {
		if (!fs.existsSync(TEST_DATA_DIR)) {
			fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
		}
	});

	afterAll(() => {
		if (fs.existsSync(TEST_DATA_DIR)) {
			fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
		}
	});

	describe("parseFileSync", () => {
		describe("Error handling", () => {
			it("should throw error when CSV file does not exist", () => {
				expect(() => {
					CsvParser.parseFileSync("non-existent-file.csv");
				}).toThrow("CSV file not found: non-existent-file.csv");
			});

			it("should return empty array for empty CSV file", () => {
				const csvPath = path.join(TEST_DATA_DIR, "empty.csv");
				fs.writeFileSync(csvPath, "");

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([]);
			});

			it("should return empty array for CSV with only headers", () => {
				const csvPath = path.join(TEST_DATA_DIR, "only-headers.csv");
				fs.writeFileSync(csvPath, "id,name,email\n");

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([]);
			});
		});

		describe("Flat structure", () => {
			it("should parse simple flat CSV with single record", () => {
				const csvPath = path.join(TEST_DATA_DIR, "simple-flat.csv");
				const csvContent = `id,name,email
1,John Doe,john@example.com`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "John Doe",
						email: "john@example.com",
					},
				]);
			});

			it("should parse flat CSV with multiple records", () => {
				const csvPath = path.join(TEST_DATA_DIR, "multiple-flat.csv");
				const csvContent = `id,name,age
1,Alice,25
2,Bob,30
3,Charlie,35`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{ id: "1", name: "Alice", age: "25" },
					{ id: "2", name: "Bob", age: "30" },
					{ id: "3", name: "Charlie", age: "35" },
				]);
			});
		});

		describe("Nested objects", () => {
			it("should parse CSV with single-level nested objects", () => {
				const csvPath = path.join(TEST_DATA_DIR, "nested-single.csv");
				const csvContent = `id,name,address.street,address.city
1,John Doe,123 Main St,New York`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "John Doe",
						address: {
							street: "123 Main St",
							city: "New York",
						},
					},
				]);
			});

			it("should parse CSV with multi-level nested objects", () => {
				const csvPath = path.join(TEST_DATA_DIR, "nested-multi.csv");
				const csvContent = `id,name,contact.address.street,contact.address.city,contact.phone
1,Jane Smith,456 Elm St,Los Angeles,555-1234`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "Jane Smith",
						contact: {
							address: {
								street: "456 Elm St",
								city: "Los Angeles",
							},
							phone: "555-1234",
						},
					},
				]);
			});

			it("should handle multiple records with nested objects", () => {
				const csvPath = path.join(TEST_DATA_DIR, "multiple-nested.csv");
				const csvContent = `id,name,profile.age,profile.occupation
1,Alice,28,Engineer
2,Bob,32,Designer`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "Alice",
						profile: { age: "28", occupation: "Engineer" },
					},
					{
						id: "2",
						name: "Bob",
						profile: { age: "32", occupation: "Designer" },
					},
				]);
			});
		});

		describe("Arrays (via collision)", () => {
			it("should create arrays when same key appears in multiple rows of same group", () => {
				const csvPath = path.join(TEST_DATA_DIR, "array-simple.csv");
				const csvContent = `id,name,hobby
1,John,Reading
,,Swimming
,,Cycling`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "John",
						hobby: ["Reading", "Swimming", "Cycling"],
					},
				]);
			});

			it("should create arrays for nested properties", () => {
				const csvPath = path.join(TEST_DATA_DIR, "array-nested.csv");
				const csvContent = `id,name,phones.type,phones.number
1,Alice,mobile,555-0001
,,home,555-0002
,,work,555-0003`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "Alice",
						phones: [
							{ type: "mobile", number: "555-0001" },
							{ type: "home", number: "555-0002" },
							{ type: "work", number: "555-0003" },
						],
					},
				]);
			});

			it("should handle arrays with deeply nested objects", () => {
				const csvPath = path.join(TEST_DATA_DIR, "array-deep-nested.csv");
				const csvContent = `id,name,orders.id,orders.items.name,orders.items.price
1,Customer1,100,Widget,9.99
,,101,Gadget,19.99`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "Customer1",
						orders: [
							{ id: "100", items: { name: "Widget", price: "9.99" } },
							{ id: "101", items: { name: "Gadget", price: "19.99" } },
						],
					},
				]);
			});
		});

		describe("Complex scenarios", () => {
			it("should handle mix of flat, nested, and array data", () => {
				const csvPath = path.join(TEST_DATA_DIR, "complex-mix.csv");
				const csvContent = `id,name,email,address.street,address.city,skills
1,John Doe,john@example.com,123 Main St,NYC,JavaScript
,,,,,TypeScript
,,,,,React`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "John Doe",
						email: "john@example.com",
						address: {
							street: "123 Main St",
							city: "NYC",
						},
						skills: ["JavaScript", "TypeScript", "React"],
					},
				]);
			});

			it("should handle multiple groups with arrays", () => {
				const csvPath = path.join(TEST_DATA_DIR, "multiple-groups-arrays.csv");
				const csvContent = `id,name,tags
1,User1,tag1
,,tag2
2,User2,tag3
,,tag4
,,tag5`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "User1",
						tags: ["tag1", "tag2"],
					},
					{
						id: "2",
						name: "User2",
						tags: ["tag3", "tag4", "tag5"],
					},
				]);
			});

			it("should handle empty values correctly", () => {
				const csvPath = path.join(TEST_DATA_DIR, "empty-values.csv");
				const csvContent = `id,name,email,phone
1,Alice,alice@example.com,
2,Bob,,555-1234`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "Alice",
						email: "alice@example.com",
					},
					{
						id: "2",
						name: "Bob",
						phone: "555-1234",
					},
				]);
			});

			it("should handle complex nested arrays with multiple properties", () => {
				const csvPath = path.join(TEST_DATA_DIR, "complex-arrays.csv");
				const csvContent = `id,name,projects.name,projects.role,projects.duration
1,Developer,Project A,Lead,12 months
,,Project B,Contributor,6 months
,,Project C,Lead,8 months`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "Developer",
						projects: [
							{ name: "Project A", role: "Lead", duration: "12 months" },
							{ name: "Project B", role: "Contributor", duration: "6 months" },
							{ name: "Project C", role: "Lead", duration: "8 months" },
						],
					},
				]);
			});

			it("should handle realistic user data with multiple nested levels and arrays", () => {
				const csvPath = path.join(TEST_DATA_DIR, "realistic-user.csv");
				const csvContent = `id,username,email,profile.firstName,profile.lastName,profile.age,addresses.type,addresses.street,addresses.city,addresses.zip
1,johndoe,john@example.com,John,Doe,30,home,123 Main St,New York,10001
,,,,,,work,456 Office Blvd,New York,10002
2,janedoe,jane@example.com,Jane,Doe,28,,,,
,,,,,,home,789 Park Ave,Boston,02101`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						username: "johndoe",
						email: "john@example.com",
						profile: {
							firstName: "John",
							lastName: "Doe",
							age: "30",
						},
						addresses: [
							{
								type: "home",
								street: "123 Main St",
								city: "New York",
								zip: "10001",
							},
							{
								type: "work",
								street: "456 Office Blvd",
								city: "New York",
								zip: "10002",
							},
						],
					},
					{
						id: "2",
						username: "janedoe",
						email: "jane@example.com",
						profile: {
							firstName: "Jane",
							lastName: "Doe",
							age: "28",
						},
						addresses: [
							{
								type: "home",
								street: "789 Park Ave",
								city: "Boston",
								zip: "02101",
							},
						],
					},
				]);
			});

			it("should maintain consistent array structure across all records", () => {
				const csvPath = path.join(TEST_DATA_DIR, "consistent-arrays.csv");
				const csvContent = `id,name,tags
1,User1,tag1
,,tag2
,,tag3
2,User2,single-tag
3,User3,tag-a
,,tag-b`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				// All records should have 'tags' as an array, even User2 with only one tag
				expect(result).toEqual([
					{
						id: "1",
						name: "User1",
						tags: ["tag1", "tag2", "tag3"],
					},
					{
						id: "2",
						name: "User2",
						tags: ["single-tag"], // Should be array with one element
					},
					{
						id: "3",
						name: "User3",
						tags: ["tag-a", "tag-b"],
					},
				]);
			});
		});

		describe("Edge cases", () => {
			it("should handle CSV with only identifier column filled", () => {
				const csvPath = path.join(TEST_DATA_DIR, "only-id.csv");
				const csvContent = `id,name,email
1,,`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([{ id: "1" }]);
			});

			it("should handle rows with whitespace in identifier", () => {
				const csvPath = path.join(TEST_DATA_DIR, "whitespace-id.csv");
				const csvContent = `id,name
1,Alice
,Bob`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				// Empty identifier should be treated as continuation
				expect(result).toEqual([
					{
						id: "1",
						name: ["Alice", "Bob"],
					},
				]);
			});

			it("should handle very deep nesting", () => {
				const csvPath = path.join(TEST_DATA_DIR, "deep-nesting.csv");
				const csvContent = `id,level1.level2.level3.level4.level5.value
1,deep-value`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						level1: {
							level2: {
								level3: {
									level4: {
										level5: {
											value: "deep-value",
										},
									},
								},
							},
						},
					},
				]);
			});

			it("should handle single row continuation without identifier", () => {
				const csvPath = path.join(TEST_DATA_DIR, "single-continuation.csv");
				const csvContent = `id,name,hobby
1,Alice,Reading
,,Swimming`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "Alice",
						hobby: ["Reading", "Swimming"],
					},
				]);
			});
		});

		describe("CSV parsing edge cases", () => {
			it("should handle quoted fields with commas", () => {
				const csvPath = path.join(TEST_DATA_DIR, "quoted-commas.csv");
				const csvContent = `id,name,description
1,John,"A developer, designer, and writer"`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "John",
						description: "A developer, designer, and writer",
					},
				]);
			});

			it("should handle quoted fields with newlines", () => {
				const csvPath = path.join(TEST_DATA_DIR, "quoted-newlines.csv");
				const csvContent = `id,name,bio
1,Alice,"Line 1
Line 2
Line 3"`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "Alice",
						bio: "Line 1\nLine 2\nLine 3",
					},
				]);
			});

			it("should handle escaped quotes in fields", () => {
				const csvPath = path.join(TEST_DATA_DIR, "escaped-quotes.csv");
				const csvContent = `id,name,quote
1,Bob,"He said ""Hello"" to me"`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						name: "Bob",
						quote: 'He said "Hello" to me',
					},
				]);
			});

			it("should handle Windows line endings (CRLF)", () => {
				const csvPath = path.join(TEST_DATA_DIR, "windows-lines.csv");
				const csvContent = "id,name\r\n1,Alice\r\n2,Bob\r\n";
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{ id: "1", name: "Alice" },
					{ id: "2", name: "Bob" },
				]);
			});

			it("should handle Unix line endings (LF)", () => {
				const csvPath = path.join(TEST_DATA_DIR, "unix-lines.csv");
				const csvContent = "id,name\n1,Alice\n2,Bob\n";
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{ id: "1", name: "Alice" },
					{ id: "2", name: "Bob" },
				]);
			});

			it("should handle Mac line endings (CR)", () => {
				const csvPath = path.join(TEST_DATA_DIR, "mac-lines.csv");
				const csvContent = "id,name\r1,Alice\r2,Bob\r";
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{ id: "1", name: "Alice" },
					{ id: "2", name: "Bob" },
				]);
			});

			it("should warn about extra values beyond column count (default)", () => {
				const csvPath = path.join(TEST_DATA_DIR, "extra-values.csv");
				const csvContent = `id,name,email
1,Alice,alice@example.com,extra1,extra2
2,Bob,bob@example.com,extra3`;
				fs.writeFileSync(csvPath, csvContent);

				const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

				const result = CsvParser.parseFileSync(csvPath);

				// Default should warn
				expect(result).toEqual([
					{ id: "1", name: "Alice", email: "alice@example.com" },
					{ id: "2", name: "Bob", email: "bob@example.com" },
				]);
				expect(consoleWarnSpy).toHaveBeenCalledTimes(2);

				consoleWarnSpy.mockRestore();
			});

			it("should ignore extra values when validationMode is 'ignore'", () => {
				const csvPath = path.join(TEST_DATA_DIR, "extra-values-ignore.csv");
				const csvContent = `id,name
1,Alice,extra1
2,Bob,extra2`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath, { validationMode: "ignore" });

				expect(result).toEqual([
					{ id: "1", name: "Alice" },
					{ id: "2", name: "Bob" },
				]);
			});

			it("should warn about extra values when validationMode is 'warn'", () => {
				const csvPath = path.join(TEST_DATA_DIR, "extra-values-warn.csv");
				const csvContent = `id,name
1,Alice,extra1
2,Bob,extra2,extra3`;
				fs.writeFileSync(csvPath, csvContent);

				const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

				const result = CsvParser.parseFileSync(csvPath, { validationMode: "warn" });

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
				const csvPath = path.join(TEST_DATA_DIR, "extra-values-error.csv");
				const csvContent = `id,name
1,Alice,extra1
2,Bob`;
				fs.writeFileSync(csvPath, csvContent);

				expect(() => {
					CsvParser.parseFileSync(csvPath, { validationMode: "error" });
				}).toThrow("Row 2 has 3 values but only 2 columns defined.");
			});
		});

		describe("Deep nested mixed structures", () => {
			it("should support 3-level nesting with arrays of complex objects", () => {
				const csvPath = path.join(TEST_DATA_DIR, "three-level-complex.csv");
				const csvContent = `id,company,projects.name,projects.team.lead,projects.team.size
1,TechCorp,Website,Alice,5
,,Mobile App,Bob,8
2,DesignCo,Dashboard,Charlie,3`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						company: "TechCorp",
						projects: [
							{
								name: "Website",
								team: { lead: "Alice", size: "5" },
							},
							{
								name: "Mobile App",
								team: { lead: "Bob", size: "8" },
							},
						],
					},
					{
						id: "2",
						company: "DesignCo",
						projects: [
							{
								name: "Dashboard",
								team: { lead: "Charlie", size: "3" },
							},
						],
					},
				]);
			});

			it("should support multiple array fields at same level", () => {
				const csvPath = path.join(TEST_DATA_DIR, "multi-array-same-level.csv");
				const csvContent = `id,user,skills,certifications.name,certifications.year
1,Alice,JavaScript,AWS,2023
,,TypeScript,Azure,2024
,,React,,
2,Bob,Python,GCP,2023
,,Django,,`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						user: "Alice",
						skills: ["JavaScript", "TypeScript", "React"],
						certifications: [
							{ name: "AWS", year: "2023" },
							{ name: "Azure", year: "2024" },
						],
					},
					{
						id: "2",
						user: "Bob",
						skills: ["Python", "Django"],
						certifications: [{ name: "GCP", year: "2023" }],
					},
				]);
			});

			it("should handle combination of nested objects and arrays at different paths", () => {
				const csvPath = path.join(TEST_DATA_DIR, "mixed-paths-arrays.csv");
				const csvContent = `id,company,metadata.created,metadata.updated,tags
1,TechCorp,2023-01-01,2023-12-31,javascript
,,,,typescript
,,,,nodejs
2,DesignCo,2024-01-01,2024-06-30,design
,,,,creative`;
				fs.writeFileSync(csvPath, csvContent);

				const result = CsvParser.parseFileSync(csvPath);

				expect(result).toEqual([
					{
						id: "1",
						company: "TechCorp",
						metadata: {
							created: "2023-01-01",
							updated: "2023-12-31",
						},
						tags: ["javascript", "typescript", "nodejs"],
					},
					{
						id: "2",
						company: "DesignCo",
						metadata: {
							created: "2024-01-01",
							updated: "2024-06-30",
						},
						tags: ["design", "creative"],
					},
				]);
			});
		});
	});
});
