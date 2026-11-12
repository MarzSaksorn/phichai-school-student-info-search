import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { assertApprovedXlsxSource } from "./sourceGuard.js";

export type UploadedFile = {
  filename: string;
  bytes: Uint8Array;
  contentType?: string;
  sourceType?: "approved_student_xlsx" | "approved_staff_source";
  origin?: string;
};

export type WorkbookSheet = {
  name: string;
  rows: unknown[][];
};

export type ReadWorkbookResult = {
  fileId: string;
  checksum: string;
  sheets: WorkbookSheet[];
};

export class WorkbookReadError extends Error {
  readonly code = "WORKBOOK_INVALID" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause !== undefined) {
      Object.defineProperty(this, "cause", { value: options.cause, configurable: true });
    }
    this.name = "WorkbookReadError";
  }
}

function scalarCellValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const cell = value as { result?: unknown; richText?: Array<{ text?: unknown }>; text?: unknown; hyperlink?: unknown };
  if (cell.result !== undefined) return scalarCellValue(cell.result);
  if (Array.isArray(cell.richText)) return cell.richText.map((part) => String(part.text ?? "")).join("");
  if (cell.text !== undefined) return scalarCellValue(cell.text);
  if (cell.hyperlink !== undefined) return String(cell.hyperlink);
  return value;
}

export async function readWorkbook(file: UploadedFile): Promise<ReadWorkbookResult> {
  const sourceInput = {
    sourceType: file.sourceType ?? "approved_student_xlsx",
    filename: file.filename,
    byteSize: file.bytes.byteLength
  } as const;
  assertApprovedXlsxSource(file.origin ? { ...sourceInput, origin: file.origin } : sourceInput);

  const bytes = Buffer.from(file.bytes);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const fileId = `file-${checksum.slice(0, 16)}`;

  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new WorkbookReadError("The uploaded bytes are not an XLSX ZIP container");
  }

  try {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS 4.4 declares the pre-generic Node Buffer type; the runtime value
    // is still a normal Buffer and is safe to pass across that declaration gap.
    await workbook.xlsx.load(bytes as never);

    if (workbook.worksheets.length === 0) {
      throw new Error("Workbook has no sheets");
    }

    const sheets: WorkbookSheet[] = workbook.worksheets.map((worksheet) => {
      const rows: unknown[][] = [];
      for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        const width = Math.max(worksheet.columnCount, values.length);
        rows.push(
          Array.from({ length: width }, (_, index) => {
            const value = scalarCellValue(values[index]);
            return typeof value === "string" && value.trim() === "" ? null : value ?? null;
          })
        );
      }
      return { name: worksheet.name, rows };
    });

    return { fileId, checksum, sheets };
  } catch (error) {
    if (error instanceof WorkbookReadError) {
      throw error;
    }
    throw new WorkbookReadError("The XLSX workbook could not be read", {
      cause: error
    });
  }
}
