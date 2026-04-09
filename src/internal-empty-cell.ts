export const QUOTED_EMPTY_CELL = Symbol("quoted-empty-cell");

export type InternalCsvCellValue = string | typeof QUOTED_EMPTY_CELL;
export type InternalCsvRecord = Record<string, InternalCsvCellValue>;

export function isQuotedEmptyCell(value: unknown): value is typeof QUOTED_EMPTY_CELL {
	return value === QUOTED_EMPTY_CELL;
}

export function isEmptyCsvCellValue(value: InternalCsvCellValue | null | undefined): boolean {
	return value === undefined || value === null || value === "" || isQuotedEmptyCell(value);
}

export function toPublicCsvCellValue(value: InternalCsvCellValue): string {
	return isQuotedEmptyCell(value) ? "" : value;
}
