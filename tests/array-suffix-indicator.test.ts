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
			// With the hierarchy-aware merging, continuation rows correctly append to nested arrays
			// when only the nested array fields have values
			const csvContent = `id,company,projects[].name,projects[].tasks[].title,projects[].tasks[].assignee
1,TechCorp,Website,Build UI,Alice
,,,Add API,Bob`;

			const result = CsvParser.parseString(csvContent);

			// Continuation row without projects[].name appends to existing project's tasks
			expect(result).toEqual([
				{
					id: "1",
					company: "TechCorp",
					projects: [
						{
							name: "Website",
							tasks: [
								{ title: "Build UI", assignee: "Alice" },
								{ title: "Add API", assignee: "Bob" },
							],
						},
					],
				},
			]);
		});

		it("should create new project when projects[].name has value in continuation row", () => {
			// When a sibling field (name) has value, a new parent item is created
			const csvContent = `id,company,projects[].name,projects[].tasks[].title,projects[].tasks[].assignee
1,TechCorp,Website,Build UI,Alice
,,Mobile,Design App,Charlie`;

			const result = CsvParser.parseString(csvContent);

			// Continuation row with projects[].name creates new project
			expect(result).toEqual([
				{
					id: "1",
					company: "TechCorp",
					projects: [
						{
							name: "Website",
							tasks: [{ title: "Build UI", assignee: "Alice" }],
						},
						{
							name: "Mobile",
							tasks: [{ title: "Design App", assignee: "Charlie" }],
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

	describe("nested forced arrays with continuation rows", () => {
		it("should append to nested array when only nested field has value", () => {
			const csvContent = `id,items[].name,items[].tags[]
1,item1,tag1
,,tag2`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					items: [{ name: "item1", tags: ["tag1", "tag2"] }],
				},
			]);
		});

		it("should create new parent item when sibling field has value", () => {
			const csvContent = `id,items[].name,items[].tags[]
1,item1,tag1
,item2,tag2`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					items: [
						{ name: "item1", tags: ["tag1"] },
						{ name: "item2", tags: ["tag2"] },
					],
				},
			]);
		});

		it("should handle multiple tags appended to same item", () => {
			const csvContent = `id,items[].name,items[].tags[]
1,item1,tag1
,,tag2
,,tag3
,item2,tag4`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					items: [
						{ name: "item1", tags: ["tag1", "tag2", "tag3"] },
						{ name: "item2", tags: ["tag4"] },
					],
				},
			]);
		});

		it("should handle triple-nested arrays", () => {
			const csvContent = `id,a[].name,a[].b[].name,a[].b[].c[]
1,a1,b1,c1
,,,c2
,,b2,c3
,a2,b3,c4`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					a: [
						{
							name: "a1",
							b: [
								{ name: "b1", c: ["c1", "c2"] },
								{ name: "b2", c: ["c3"] },
							],
						},
						{
							name: "a2",
							b: [{ name: "b3", c: ["c4"] }],
						},
					],
				},
			]);
		});

		it("should handle multiple parallel nested arrays", () => {
			const csvContent = `id,items[].name,items[].tags[],items[].colors[]
1,item1,tag1,red
,,tag2,
,,,blue`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					items: [{ name: "item1", tags: ["tag1", "tag2"], colors: ["red", "blue"] }],
				},
			]);
		});

		it("should handle deep sibling non-array fields", () => {
			const csvContent = `id,items[].name,items[].details.color,items[].tags[]
1,item1,red,tag1
,,blue,tag2`;

			const result = CsvParser.parseString(csvContent);

			// Row 2 has details.color value → creates new item
			expect(result).toEqual([
				{
					id: "1",
					items: [
						{ name: "item1", details: { color: "red" }, tags: ["tag1"] },
						{ details: { color: "blue" }, tags: ["tag2"] },
					],
				},
			]);
		});

		it("should handle original issue - timeSeries with nested paths", () => {
			const csvContent = `testCaseName,tnmd.timeSeries[].businessType,tnmd.timeSeries[].period.resolution
Test1,A46,P1M
,A85,P1M`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					testCaseName: "Test1",
					tnmd: {
						timeSeries: [
							{ businessType: "A46", period: { resolution: "P1M" } },
							{ businessType: "A85", period: { resolution: "P1M" } },
						],
					},
				},
			]);
		});

		it("should handle single row with nested forced array - creates arrays with 1 item", () => {
			const csvContent = `id,items[].name,items[].tags[]
1,item1,tag1`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					items: [{ name: "item1", tags: ["tag1"] }],
				},
			]);
		});

		it("should handle nested arrays without intermediate sibling fields", () => {
			// When there are no sibling fields, continuation rows append to the innermost array
			const csvContent = `id,items[].tags[]
1,tag1
,tag2
,tag3`;

			const result = CsvParser.parseString(csvContent);

			expect(result).toEqual([
				{
					id: "1",
					items: [{ tags: ["tag1", "tag2", "tag3"] }],
				},
			]);
		});

		it("should handle complex real-world scenario", () => {
			const csvContent = `testCaseName,tnmd.type,tnmd.timeSeries[].businessType,tnmd.timeSeries[].period.resolution,tnmd.timeSeries[].period.point.amount,expected.costs[].price,expected.costs[].type
Happy Flow,A92,A46,P1M,100,17.06,INTERNAL
,,,,,0,SYSTEM
,,A85,P1M,200,19.79,CAPACITY`;

			const result = CsvParser.parseString(csvContent, { autoParseNumbers: true });

			expect(result).toEqual([
				{
					testCaseName: "Happy Flow",
					tnmd: {
						type: "A92",
						timeSeries: [
							{ businessType: "A46", period: { resolution: "P1M", point: { amount: 100 } } },
							{ businessType: "A85", period: { resolution: "P1M", point: { amount: 200 } } },
						],
					},
					expected: {
						costs: [
							{ price: 17.06, type: "INTERNAL" },
							{ price: 0, type: "SYSTEM" },
							{ price: 19.79, type: "CAPACITY" },
						],
					},
				},
			]);
		});
	});
});
