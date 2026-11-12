import type { ImportSchemaConfig } from "../../apps/directory-worker/src/import/schemaRules.js";

export const STUDENT_XLSX_MAPPING_VERSION = "student-xlsx-room-sheets-v1";

function deriveGradeFromFilename(filename: string): string | null {
  const baseName = filename.split(/[\\/]/u).pop() ?? filename;
  const match = baseName.match(/^M\.(\d)-\d{2}\.xlsx$/iu);
  return match?.[1] ? `ม.${match[1]}` : null;
}

export const studentXlsxSchema: ImportSchemaConfig = {
  schemaVersion: STUDENT_XLSX_MAPPING_VERSION,
  expectedAcademicYear: "2569",
  studentSheetPattern: /^\d{1,2}$/u,
  gradePattern: /^ม\.[1-6]$/u,
  roomPattern: /^\d{1,2}$/u,
  headerRow: 5,
  displayNameHeader: "ชื่อ-สกุล",
  deriveGradeFromFilename,
  deriveRoomFromSheet: true
};
