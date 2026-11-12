export type ImportSchemaConfig = {
  schemaVersion: string;
  expectedAcademicYear: string;
  studentSheetPattern: RegExp;
  gradePattern: RegExp;
  roomPattern: RegExp;
  headerRow?: number;
  displayNameHeader?: string;
  surnameHeader?: string;
  deriveGradeFromFilename?: (filename: string) => string | null;
  deriveRoomFromSheet?: boolean;
};

export function assertSchemaConfig(config: ImportSchemaConfig): void {
  if (!config.schemaVersion.trim()) throw new Error("Schema version is required");
  if (!/^\d{4}$/.test(config.expectedAcademicYear)) {
    throw new Error("Configured academic year must use four digits");
  }
  if (config.headerRow !== undefined && (!Number.isInteger(config.headerRow) || config.headerRow < 1)) {
    throw new Error("Configured header row must be a positive integer");
  }
}
