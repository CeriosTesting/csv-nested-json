import { Readable } from "node:stream";

import { bench, describe } from "vitest";

import { CsvParser } from "../src/csv-parser";
import { CsvStreamParser } from "../src/csv-stream-parser";
import { JsonToCsv } from "../src/json-to-csv";
import type { NestedObject } from "../src/types";

/**
 * Performance benchmarks for the CSV <-> nested JSON pipeline.
 *
 * Run with: `npm run bench`
 *
 * The dataset is generated once and mixes:
 * - plain scalar columns
 * - quoted cells containing the delimiter and embedded quotes
 * - dot-notation nested columns
 * - a forced-array (`[]`) column expressed as continuation rows
 */

const ROW_COUNT = 100_000;

function buildCsv(rowCount: number): string {
	const header = "id,name,description,address.city,address.zip,tags[]";
	const lines: string[] = [header];

	for (let i = 0; i < rowCount; i++) {
		// Base row: a quoted description with a comma + escaped quote to exercise the slow path.
		lines.push(`${i},Person ${i},"Says ""hi"", loudly",City ${i % 500},${10000 + (i % 9000)},alpha`);
		// Two continuation rows filling the tags[] array.
		lines.push(",,,,,beta");
		lines.push(",,,,,gamma");
	}

	return lines.join("\n");
}

const csvContent = buildCsv(ROW_COUNT);

// Pre-parse a dataset for the JSON -> CSV benchmark.
const parsedData = CsvParser.parseString<NestedObject>(csvContent);

describe("CSV -> nested JSON (buffered)", () => {
	bench("CsvParser.parseString", () => {
		CsvParser.parseString(csvContent);
	});

	bench("CsvParser.parseString (autoParse numbers + booleans)", () => {
		CsvParser.parseString(csvContent, { autoParseNumbers: true, autoParseBooleans: true });
	});
});

describe("CSV -> nested JSON (streaming)", () => {
	bench("CsvStreamParser.parseStream", async () => {
		await CsvStreamParser.parseStream(Readable.from([csvContent]));
	});
});

describe("nested JSON -> CSV", () => {
	bench("JsonToCsv.stringify", () => {
		JsonToCsv.stringify(parsedData);
	});
});
