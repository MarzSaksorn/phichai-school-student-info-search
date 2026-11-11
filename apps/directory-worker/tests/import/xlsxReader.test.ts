import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readWorkbook } from "../../src/import/xlsxReader.js";

const fixture = (name: string) => new URL(`../fixtures/xlsx/${name}`, import.meta.url);

describe("XLSX workbook reader", () => {
  it("reads multiple room sheets and returns a stable checksum", async () => {
    const bytes = await readFile(fixture("valid-room-per-sheet.xlsx"));
    const result = await readWorkbook({
      filename: "valid-room-per-sheet.xlsx",
      bytes,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    expect(result.fileId).toMatch(/^file-[0-9a-f]{16}$/);
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sheets.map((sheet) => sheet.name)).toEqual(["M1-1", "M1-2"]);
    expect(result.sheets[0]?.rows[1]).toEqual(["001", "เด็กชาย ตัวอย่าง", "ม.1", "1"]);
  });

  it("preserves blank rows and unexpected sheet names for validation", async () => {
    const bytes = await readFile(fixture("unexpected-sheets.xlsx"));
    const result = await readWorkbook({ filename: "unexpected-sheets.xlsx", bytes });

    expect(result.sheets.map((sheet) => sheet.name)).toEqual(["M1-1", "Summary"]);
    expect(result.sheets[0]?.rows.some((row) => row.every((cell) => cell === null))).toBe(true);
  });

  it("rejects corrupt workbook bytes with a typed error", async () => {
    const bytes = await readFile(fixture("corrupt.xlsx"));

    await expect(readWorkbook({ filename: "corrupt.xlsx", bytes })).rejects.toMatchObject({
      code: "WORKBOOK_INVALID"
    });
  });
});
