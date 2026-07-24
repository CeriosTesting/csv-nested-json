import { Transform, type TransformCallback, type TransformOptions } from "node:stream";

import { JsonToCsv, type JsonToCsvOptions } from "./json-to-csv";
import type { NestedObject } from "./types";

/**
 * Options for the streaming JSON-to-CSV writer.
 */
export interface JsonToCsvStreamOptions extends JsonToCsvOptions, TransformOptions {
	/**
	 * Explicit header columns (in the order they should appear). May use dot-notation and the array
	 * suffix (e.g. `person.name`, `tags[]`).
	 *
	 * When omitted, headers are derived from the **first** object written to the stream. Keys on
	 * later objects that are not part of the header set are dropped; missing keys become empty cells.
	 */
	columns?: string[];
}

/**
 * A streaming writer that converts a stream of nested objects into CSV, emitting output
 * incrementally instead of building the whole string in memory.
 *
 * Unlike {@link JsonToCsv.stringify}, which scans every record to union the header set, the stream
 * fixes its headers up front — from the `columns` option, or from the first object written. This is
 * the trade-off that makes true streaming possible.
 *
 * @example
 * ```typescript
 * import { pipeline } from 'node:stream/promises';
 * import { Readable } from 'node:stream';
 * import { createWriteStream } from 'node:fs';
 * import { JsonToCsvStream } from '@cerios/csv-nested-json';
 *
 * await pipeline(
 *   Readable.from(records),
 *   new JsonToCsvStream({ delimiter: ';' }),
 *   createWriteStream('out.csv')
 * );
 * ```
 */
export class JsonToCsvStream extends Transform {
	private headers: string[] | null;
	private headerEmitted = false;
	private firstLine = true;
	private readonly csvOptions: JsonToCsvOptions;
	private readonly includeHeader: boolean;
	private readonly lineEnding: string;

	constructor(options: JsonToCsvStreamOptions = {}) {
		// `encoding` targets file output, not the Transform's readable side; drop it so Readable
		// does not reinterpret the emitted string chunks.
		const { columns, encoding: _ignoredEncoding, ...transformOptions } = options;
		super({ ...transformOptions, writableObjectMode: true, readableObjectMode: false });

		this.csvOptions = options;
		this.includeHeader = options.includeHeader !== false;
		this.lineEnding = options.lineEnding || "\n";
		this.headers = columns ?? null;
	}

	/** @internal */
	_transform(record: NestedObject, _encoding: BufferEncoding, callback: TransformCallback): void {
		try {
			if (!this.headers) {
				this.headers = JsonToCsv.resolveHeaders([record], this.csvOptions);
			}

			this.emitHeaderIfNeeded();

			for (const line of JsonToCsv.objectToCsvLines(record, this.headers, this.csvOptions)) {
				this.pushLine(line);
			}

			callback();
		} catch (error) {
			callback(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/** @internal */
	_flush(callback: TransformCallback): void {
		try {
			// With explicit `columns` and no records, still emit the header row.
			if (this.headers) {
				this.emitHeaderIfNeeded();
			}
			callback();
		} catch (error) {
			callback(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private emitHeaderIfNeeded(): void {
		if (this.headerEmitted || !this.headers) return;
		this.headerEmitted = true;
		if (this.includeHeader) {
			this.pushLine(JsonToCsv.headerLine(this.headers, this.csvOptions));
		}
	}

	private pushLine(line: string): void {
		if (this.firstLine) {
			this.firstLine = false;
			this.push(line);
		} else {
			this.push(this.lineEnding + line);
		}
	}
}
