import { NestedJsonConverter } from "../src/nested-json-converter";

describe("NestedJsonConverter", () => {
	describe("convert", () => {
		it("should return empty array for empty input", () => {
			const result = NestedJsonConverter.convert([]);
			expect(result).toEqual([]);
		});

		it("should handle flat structure with single record", () => {
			const records = [{ id: "1", name: "John Doe", email: "john@example.com" }];
			const result = NestedJsonConverter.convert(records);

			expect(result).toEqual([
				{
					id: "1",
					name: "John Doe",
					email: "john@example.com",
				},
			]);
		});

		it("should handle flat structure with multiple records", () => {
			const records = [
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
				{ id: "3", name: "Charlie", age: "35" },
			];
			const result = NestedJsonConverter.convert(records);

			expect(result).toEqual([
				{ id: "1", name: "Alice", age: "25" },
				{ id: "2", name: "Bob", age: "30" },
				{ id: "3", name: "Charlie", age: "35" },
			]);
		});

		it("should convert single-level nested objects", () => {
			const records = [{ id: "1", name: "John Doe", "address.street": "123 Main St", "address.city": "New York" }];
			const result = NestedJsonConverter.convert(records);

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

		it("should convert multi-level nested objects", () => {
			const records = [
				{
					id: "1",
					name: "Jane Smith",
					"contact.address.street": "456 Elm St",
					"contact.address.city": "Los Angeles",
					"contact.phone": "555-1234",
				},
			];
			const result = NestedJsonConverter.convert(records);

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

		it("should create arrays when same key appears in multiple rows", () => {
			const records = [
				{ id: "1", name: "John", hobby: "Reading" },
				{ id: "", name: "", hobby: "Swimming" },
				{ id: "", name: "", hobby: "Cycling" },
			];
			const result = NestedJsonConverter.convert(records);

			expect(result).toEqual([
				{
					id: "1",
					name: "John",
					hobby: ["Reading", "Swimming", "Cycling"],
				},
			]);
		});

		it("should create arrays for nested properties", () => {
			const records = [
				{ id: "1", name: "Alice", "phones.type": "mobile", "phones.number": "555-0001" },
				{ id: "", name: "", "phones.type": "home", "phones.number": "555-0002" },
				{ id: "", name: "", "phones.type": "work", "phones.number": "555-0003" },
			];
			const result = NestedJsonConverter.convert(records);

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
			const records = [
				{ id: "1", name: "Customer1", "orders.id": "100", "orders.items.name": "Widget", "orders.items.price": "9.99" },
				{ id: "", name: "", "orders.id": "101", "orders.items.name": "Gadget", "orders.items.price": "19.99" },
			];
			const result = NestedJsonConverter.convert(records);

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

		it("should handle multiple groups with arrays", () => {
			const records = [
				{ id: "1", name: "User1", tags: "tag1" },
				{ id: "", name: "", tags: "tag2" },
				{ id: "2", name: "User2", tags: "tag3" },
				{ id: "", name: "", tags: "tag4" },
				{ id: "", name: "", tags: "tag5" },
			];
			const result = NestedJsonConverter.convert(records);

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

		it("should maintain consistent array structure across all records", () => {
			const records = [
				{ id: "1", name: "User1", tags: "tag1" },
				{ id: "", name: "", tags: "tag2" },
				{ id: "", name: "", tags: "tag3" },
				{ id: "2", name: "User2", tags: "single-tag" },
				{ id: "3", name: "User3", tags: "tag-a" },
				{ id: "", name: "", tags: "tag-b" },
			];
			const result = NestedJsonConverter.convert(records);

			expect(result).toEqual([
				{
					id: "1",
					name: "User1",
					tags: ["tag1", "tag2", "tag3"],
				},
				{
					id: "2",
					name: "User2",
					tags: ["single-tag"],
				},
				{
					id: "3",
					name: "User3",
					tags: ["tag-a", "tag-b"],
				},
			]);
		});

		it("should handle empty values correctly", () => {
			const records = [
				{ id: "1", name: "Alice", email: "alice@example.com", phone: "" },
				{ id: "2", name: "Bob", email: "", phone: "555-1234" },
			];
			const result = NestedJsonConverter.convert(records);

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

		it("should support 3-level nesting with arrays of complex objects", () => {
			const records = [
				{
					id: "1",
					company: "TechCorp",
					"projects.name": "Website",
					"projects.team.lead": "Alice",
					"projects.team.size": "5",
				},
				{ id: "", company: "", "projects.name": "Mobile App", "projects.team.lead": "Bob", "projects.team.size": "8" },
				{
					id: "2",
					company: "DesignCo",
					"projects.name": "Dashboard",
					"projects.team.lead": "Charlie",
					"projects.team.size": "3",
				},
			];
			const result = NestedJsonConverter.convert(records);

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
			const records = [
				{ id: "1", user: "Alice", skills: "JavaScript", "certifications.name": "AWS", "certifications.year": "2023" },
				{ id: "", user: "", skills: "TypeScript", "certifications.name": "Azure", "certifications.year": "2024" },
				{ id: "", user: "", skills: "React", "certifications.name": "", "certifications.year": "" },
				{ id: "2", user: "Bob", skills: "Python", "certifications.name": "GCP", "certifications.year": "2023" },
				{ id: "", user: "", skills: "Django", "certifications.name": "", "certifications.year": "" },
			];
			const result = NestedJsonConverter.convert(records);

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

		it("should handle very deep nesting", () => {
			const records = [{ id: "1", "level1.level2.level3.level4.level5.value": "deep-value" }];
			const result = NestedJsonConverter.convert(records);

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

		it("should handle realistic user data with multiple nested levels and arrays", () => {
			const records = [
				{
					id: "1",
					username: "johndoe",
					email: "john@example.com",
					"profile.firstName": "John",
					"profile.lastName": "Doe",
					"profile.age": "30",
					"addresses.type": "home",
					"addresses.street": "123 Main St",
					"addresses.city": "New York",
					"addresses.zip": "10001",
				},
				{
					id: "",
					username: "",
					email: "",
					"profile.firstName": "",
					"profile.lastName": "",
					"profile.age": "",
					"addresses.type": "work",
					"addresses.street": "456 Office Blvd",
					"addresses.city": "New York",
					"addresses.zip": "10002",
				},
				{
					id: "2",
					username: "janedoe",
					email: "jane@example.com",
					"profile.firstName": "Jane",
					"profile.lastName": "Doe",
					"profile.age": "28",
					"addresses.type": "",
					"addresses.street": "",
					"addresses.city": "",
					"addresses.zip": "",
				},
				{
					id: "",
					username: "",
					email: "",
					"profile.firstName": "",
					"profile.lastName": "",
					"profile.age": "",
					"addresses.type": "home",
					"addresses.street": "789 Park Ave",
					"addresses.city": "Boston",
					"addresses.zip": "02101",
				},
			];
			const result = NestedJsonConverter.convert(records);

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
	});
});
