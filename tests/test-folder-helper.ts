import fs from "node:fs";
import path from "node:path";

export class TestFolderHelper {
	constructor(private readonly _folderName: string) {}

	get testFolder(): string {
		return path.join(__dirname, this._folderName);
	}

	setupTestDir(): void {
		if (!fs.existsSync(this.testFolder)) {
			fs.mkdirSync(this.testFolder, { recursive: true });
		}
	}

	cleanupTestDir(): void {
		if (fs.existsSync(this.testFolder)) {
			try {
				fs.rmSync(this.testFolder, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
			} catch {
				// Ignore cleanup errors on Windows
			}
		}
	}
}
