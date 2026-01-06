import { CsvParser } from "../src/csv-parser";

describe("Array Suffix Indicator", () => {
	describe("default behavior ([])", () => {
		it("should force single item to be an array when using [] suffix", () => {
			const csvContent = `id,name,children[].name,children[].age
1,John,Alice,10`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					children: [{ name: "Alice", age: "10" }],
				},
			]);
		});

		it("should handle multiple items in forced array", () => {
			const csvContent = `id,name,children[].name,children[].age
1,John,Alice,10
,,Bob,8`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					children: [
						{ name: "Alice", age: "10" },
						{ name: "Bob", age: "8" },
					],
				},
			]);
		});

		it("should handle nested forced arrays", () => {
			const csvContent = `id,company,departments[].name,departments[].employees[].name
1,TechCorp,Engineering,Alice
2,OtherCorp,Sales,Charlie`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					company: "TechCorp",
					departments: [
						{
							name: "Engineering",
							employees: [{ name: "Alice" }],
						},
					],
				},
				{
					id: "2",
					company: "OtherCorp",
					departments: [
						{
							name: "Sales",
							employees: [{ name: "Charlie" }],
						},
					],
				},
			]);
		});

		it("should force simple value arrays", () => {
			const csvContent = `id,name,tags[]
1,John,javascript
,,typescript`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					tags: ["javascript", "typescript"],
				},
			]);
		});

		it("should force single simple value to array", () => {
			const csvContent = `id,name,tags[]
1,John,javascript`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					tags: ["javascript"],
				},
			]);
		});
	});

	describe("custom arraySuffixIndicator", () => {
		it("should use custom suffix indicator", () => {
			const csvContent = `id,name,children*.name,children*.age
1,John,Alice,10`;

			const result = CsvParser.parseString(csvContent, {
				arraySuffixIndicator: "*",
			});

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					children: [{ name: "Alice", age: "10" }],
				},
			]);
		});

		it("should handle multi-character suffix indicator", () => {
			const csvContent = `id,name,children<array>.name,children<array>.age
1,John,Alice,10`;

			const result = CsvParser.parseString(csvContent, {
				arraySuffixIndicator: "<array>",
			});

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					children: [{ name: "Alice", age: "10" }],
				},
			]);
		});

		it("should disable forced arrays when suffix is empty string", () => {
			const csvContent = `id,name,children[].name,children[].age
1,John,Alice,10`;

			const result = CsvParser.parseString(csvContent, {
				arraySuffixIndicator: "",
			});

			// Without forced array, single object should remain with literal key
			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					"children[]": { name: "Alice", age: "10" },
				},
			]);
		});
	});

	describe("emptyArrayBehavior", () => {
		it("should omit empty arrays by default", () => {
			const csvContent = `id,name,children[].name,children[].age
1,John,,`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
				},
			]);
		});

		it("should create empty array when emptyArrayBehavior is empty-array", () => {
			const csvContent = `id,name,children[].name,children[].age
1,John,,`;

			const result = CsvParser.parseString(csvContent, {
				emptyArrayBehavior: "empty-array",
			});

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					children: [],
				},
			]);
		});

		it("should handle mixed empty and non-empty arrays across records", () => {
			const csvContent = `id,name,children[].name
1,John,
2,Jane,Alice
,,Bob`;

			const result = CsvParser.parseString(csvContent, {
				emptyArrayBehavior: "empty-array",
			});

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					children: [],
				},
				{
					id: "2",
					name: "Jane",
					children: [{ name: "Alice" }, { name: "Bob" }],
				},
			]);
		});

		it("should omit when emptyArrayBehavior is omit explicitly", () => {
			const csvContent = `id,name,children[].name
1,John,`;

			const result = CsvParser.parseString(csvContent, {
				emptyArrayBehavior: "omit",
			});

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
				},
			]);
		});
	});

	describe("complex scenarios", () => {
		it("should handle mix of forced and auto-detected arrays", () => {
			const csvContent = `id,name,children[].name,hobbies
1,John,Alice,reading
,,Bob,swimming
,,,cycling`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					children: [{ name: "Alice" }, { name: "Bob" }],
					hobbies: ["reading", "swimming", "cycling"],
				},
			]);
		});

		it("should handle deeply nested forced arrays", () => {
			const csvContent = `id,company,projects[].name,projects[].tasks[].title,projects[].tasks[].assignee
1,TechCorp,Website,Build UI,Alice
2,OtherCorp,Mobile,Design,Charlie`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					company: "TechCorp",
					projects: [
						{
							name: "Website",
							tasks: [{ title: "Build UI", assignee: "Alice" }],
						},
					],
				},
				{
					id: "2",
					company: "OtherCorp",
					projects: [
						{
							name: "Mobile",
							tasks: [{ title: "Design", assignee: "Charlie" }],
						},
					],
				},
			]);
		});

		it("should handle deeply nested forced arrays with multiple tasks", () => {
			// Note: When you have nested arrays within arrays, continuation rows create
			// new parent array items. To add tasks to the same project, use a structure
			// where tasks don't have the nested array suffix on the parent.
			const csvContent = `id,company,projects[].tasks[].title,projects[].tasks[].assignee
1,TechCorp,Build UI,Alice
,,Add API,Bob`;

			const result = CsvParser.parseString(csvContent);

			// Each continuation row creates a new projects item with its own tasks
			expect(result).toEqual([
				{
					id: "1",
					company: "TechCorp",
					projects: [
						{
							tasks: [{ title: "Build UI", assignee: "Alice" }],
						},
						{
							tasks: [{ title: "Add API", assignee: "Bob" }],
						},
					],
				},
			]);
		});

		it("should maintain consistency across multiple records with forced arrays", () => {
			const csvContent = `id,name,phones[].type,phones[].number
1,John,mobile,555-0001
2,Jane,home,555-0002
,,work,555-0003
3,Bob,,`;

			const result = CsvParser.parseString(csvContent, {
				emptyArrayBehavior: "empty-array",
			});

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					phones: [{ type: "mobile", number: "555-0001" }],
				},
				{
					id: "2",
					name: "Jane",
					phones: [
						{ type: "home", number: "555-0002" },
						{ type: "work", number: "555-0003" },
					],
				},
				{
					id: "3",
					name: "Bob",
					phones: [],
				},
			]);
		});

		it("should handle forced array at root level with nested properties", () => {
			const csvContent = `id,addresses[].type,addresses[].location.city,addresses[].location.zip
1,home,NYC,10001
,,LA,90001`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					addresses: [
						{ type: "home", location: { city: "NYC", zip: "10001" } },
						{ location: { city: "LA", zip: "90001" } },
					],
				},
			]);
		});
	});

	describe("edge cases", () => {
		it("should handle suffix indicator at end of header path", () => {
			const csvContent = `id,tags[]
1,javascript
2,typescript`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					tags: ["javascript"],
				},
				{
					id: "2",
					tags: ["typescript"],
				},
			]);
		});

		it("should handle single value forced to array with continuation rows", () => {
			const csvContent = `id,tags[]
1,javascript
,typescript`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					tags: ["javascript", "typescript"],
				},
			]);
		});

		it("should handle multiple array indicators in same path", () => {
			const csvContent = `id,items[].value
1,a
,b`;

			const result = CsvParser.parseString(csvContent, {
				arraySuffixIndicator: "[]",
			});

			expect(result).toEqual([
				{
					id: "1",
					items: [{ value: "a" }, { value: "b" }],
				},
			]);
		});

		it("should work with different delimiters", () => {
			const csvContent = `id;name;children[].name
1;John;Alice`;

			const result = CsvParser.parseString(csvContent, {
				delimiter: ";",
			});

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					children: [{ name: "Alice" }],
				},
			]);
		});
	});
});
