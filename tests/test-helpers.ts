import fs from "node:fs";
import path from "node:path";

export const TEST_DATA_DIR = path.join(__dirname, "test-data");

export function setupTestDir(): void {
	if (!fs.existsSync(TEST_DATA_DIR)) {
		fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
	}
}

export function cleanupTestDir(): void {
	if (fs.existsSync(TEST_DATA_DIR)) {
		try {
			fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
		} catch {
			// Ignore cleanup errors on Windows
		}
	}
}
