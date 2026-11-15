import { createHash } from "node:crypto";
import { allowsStudentNumberSearch, exposesStudentNumber, type ApprovedFieldConfig } from "./publicFieldConfig.js";
import { supabaseAdmin } from "./supabase.js";

type PublicStudentItem = {
  publicId: string;
  recordType: "student";
  displayName: string;
  studentNumber?: string;
  academicYear: string;
  grade: string;
  room: string;
  status?: string;
  publishedAt: string;
};

type PublicStaffItem = {
  publicId: string;
  recordType: "staff";
  displayName: string;
  category: string;
  department?: string;
  title?: string;
  email?: string;
  publishedAt: string;
};

export type PublicSearchInput = { q: string; academicYear?: string; grade?: string; room?: string; status?: string; department?: string; cursor?: string; pageSize: number };
export type PublicSearchOutput = { items: Array<PublicStudentItem | PublicStaffItem>; total: number; nextCursor?: string; datasetVersion: string; publishedAt: string; departments: string[] };

const SUMMARY_NOTE_PATTERN = /ณ\s*วันที่|จำนวนนักเรียน|นักเรียนทั้งหมด|รวมทั้งสิ้น/u;

function clean(value: string): string { return value.normalize("NFKC").trim().replace(/\s+/gu, " "); }
function cursorValue(cursor: string | undefined): number { if (!cursor) return 0; try { const offset = Number(Buffer.from(cursor, "base64url").toString("utf8")); if (!Number.isSafeInteger(offset) || offset < 0) throw new Error(); return offset; } catch { throw new Error("CURSOR_INVALID"); } }
function cursorFor(offset: number): string { return Buffer.from(String(offset), "utf8").toString("base64url"); }

const ROSTER_FETCH_PAGE = 1000;

type RosterRow = {
  public_id: string;
  display_name: string;
  student_identifier: string | null;
  academic_year: string;
  grade: string;
  room: string;
  status: string | null;
};

type StaffRow = {
  public_id: string;
  display_name: string;
  search_name: string;
  category: string;
  department: string | null;
  title: string | null;
  email: string | null;
};

const gradeOrder = (grade: string): number => { const match = /^ม\.(\d+)$/u.exec(grade); return match ? Number(match[1]) : Number.POSITIVE_INFINITY; };
const numericOrLast = (value: string | null): number => { if (value === null || value === "") return Number.POSITIVE_INFINITY; return /^\d+$/u.test(value) ? Number(value) : Number.POSITIVE_INFINITY; };
const sexOrder = (displayName: string): number => {
  const name = displayName.normalize("NFKC").trim();
  if (/^(?:เด็กชาย|นักเรียนชาย|นาย|ชาย)/u.test(name)) return 0;
  if (/^(?:เด็กหญิง|นักเรียนหญิง|นางสาว|นาง|หญิง)/u.test(name)) return 1;
  return 2;
};
const compareRosterRows = (a: RosterRow, b: RosterRow): number => {
  const gradeA = gradeOrder(a.grade);
  const gradeB = gradeOrder(b.grade);
  if (gradeA !== gradeB) return gradeA - gradeB;
  if (gradeA === Number.POSITIVE_INFINITY) { const gradeText = a.grade.localeCompare(b.grade, "th-TH"); if (gradeText !== 0) return gradeText; }
  const roomA = numericOrLast(a.room);
  const roomB = numericOrLast(b.room);
  if (roomA !== roomB) return roomA - roomB;
  if (roomA === Number.POSITIVE_INFINITY) { const roomText = a.room.localeCompare(b.room, "th-TH"); if (roomText !== 0) return roomText; }
  const sex = sexOrder(a.display_name) - sexOrder(b.display_name);
  if (sex !== 0) return sex;
  const numberA = numericOrLast(a.student_identifier);
  const numberB = numericOrLast(b.student_identifier);
  if (numberA !== numberB) return numberA - numberB;
  if (numberA === Number.POSITIVE_INFINITY && a.student_identifier !== null && b.student_identifier !== null) { const numberText = a.student_identifier.localeCompare(b.student_identifier, "th-TH"); if (numberText !== 0) return numberText; }
  const name = a.display_name.localeCompare(b.display_name, "th-TH");
  if (name !== 0) return name;
  return a.public_id.localeCompare(b.public_id);
};

function staffMatches(row: StaffRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLocaleLowerCase("th-TH");
  return [row.search_name, row.category, row.department ?? "", row.title ?? "", row.email ?? ""].some((value) => String(value ?? "").toLocaleLowerCase("th-TH").includes(needle));
}

export async function searchPublishedStudents(input: PublicSearchInput): Promise<PublicSearchOutput> {
  const q = clean(input.q).toLocaleLowerCase("th-TH");
  const department = input.department ? clean(input.department) : "";
  const offset = cursorValue(input.cursor);
  const client = supabaseAdmin();
  const { data: active, error: activeError } = await client.schema("directory").from("dataset_versions").select("id,version,published_at,created_at,field_config_version").eq("status", "active").maybeSingle();
  if (activeError) throw new Error("SEARCH_UNAVAILABLE");
  if (!active) throw new Error("NO_ACTIVE_DATASET");
  let fieldConfig: ApprovedFieldConfig | null = null;
  if (active.field_config_version) {
    const { data, error } = await client.schema("directory").from("approved_field_config")
      .select("student_public_fields,student_identifier_search,student_identifier_display")
      .eq("version", active.field_config_version).maybeSingle();
    if (error) throw new Error("SEARCH_UNAVAILABLE");
    fieldConfig = data;
  }
  const showStudentNumber = exposesStudentNumber(fieldConfig);
  const searchStudentNumber = allowsStudentNumberSearch(fieldConfig);
  let studentQuery = client.schema("directory").from("published_student_records")
    .select("public_id,display_name,student_identifier,academic_year,grade,room,status")
    .eq("dataset_version_id", active.id)
    .not("display_name", "ilike", "%ณ วันที่%")
    .not("display_name", "ilike", "%จำนวนนักเรียน%")
    .order("public_id", { ascending: true });
  if (searchStudentNumber && /^\d{1,12}$/u.test(q)) studentQuery = studentQuery.ilike("student_identifier", `${q}%`);
  else if (q) studentQuery = studentQuery.ilike("search_name", `%${q.replace(/[%_]/gu, "\\$&")}%`);
  if (input.academicYear) studentQuery = studentQuery.eq("academic_year", clean(input.academicYear));
  if (input.grade) studentQuery = studentQuery.eq("grade", clean(input.grade));
  if (input.room) studentQuery = studentQuery.eq("room", clean(input.room));
  if (input.status) studentQuery = studentQuery.eq("status", clean(input.status));

  const students: RosterRow[] = [];
  if (!department) {
    for (let fetchOffset = 0; ; fetchOffset += ROSTER_FETCH_PAGE) {
      const { data, error } = await studentQuery.range(fetchOffset, fetchOffset + ROSTER_FETCH_PAGE - 1);
      if (error) throw new Error("SEARCH_UNAVAILABLE");
      const page = (data ?? []) as RosterRow[];
      students.push(...page);
      if (page.length < ROSTER_FETCH_PAGE) break;
    }
  }
  const { data: staffPublication, error: staffPublicationError } = await client.schema("directory").from("staff_publication_versions")
    .select("id,published_at").eq("status", "active").maybeSingle();
  if (staffPublicationError) throw new Error("SEARCH_UNAVAILABLE");
  let allStaffRows: StaffRow[] = [];
  if (staffPublication) {
    const { data, error } = await client.schema("directory").from("published_staff_records")
      .select("public_id,display_name,search_name,category,department,title,email").eq("publication_version_id", staffPublication.id).order("public_id", { ascending: true }).range(0, 999);
    if (error) throw new Error("SEARCH_UNAVAILABLE");
    allStaffRows = (data ?? []) as StaffRow[];
  }
  const departments = [...new Set(allStaffRows.map((row) => clean(row.department ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th-TH"));
  const shouldIncludeStaff = Boolean(department) || (!input.academicYear && !input.grade && !input.room && !input.status);
  const staff = shouldIncludeStaff ? allStaffRows.filter((row) => staffMatches(row, q) && (!department || clean(row.department ?? "") === department)) : [];

  const publishedAt = active.published_at ?? active.created_at;
  const studentItems: PublicStudentItem[] = students
    .filter((row) => !SUMMARY_NOTE_PATTERN.test(String(row.display_name ?? "")))
    .sort(compareRosterRows)
    .map((row) => ({ publicId: row.public_id, recordType: "student", displayName: row.display_name, ...(showStudentNumber && row.student_identifier ? { studentNumber: String(row.student_identifier) } : {}), academicYear: row.academic_year, grade: row.grade, room: row.room, ...(row.status ? { status: row.status } : {}), publishedAt }));
  const staffItems: PublicStaffItem[] = staff
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "th-TH") || a.public_id.localeCompare(b.public_id))
    .map((row) => ({ publicId: row.public_id, recordType: "staff", displayName: row.display_name, category: row.category, ...(row.department ? { department: row.department } : {}), ...(row.title ? { title: row.title } : {}), ...(row.email ? { email: row.email } : {}), publishedAt }));
  const allItems: Array<PublicStudentItem | PublicStaffItem> = [...staffItems, ...studentItems];
  const items = allItems.slice(offset, offset + input.pageSize);
  const result: PublicSearchOutput = { items, total: allItems.length, datasetVersion: `${active.version}${staffItems.length ? "+staff" : ""}`, publishedAt, departments };
  if (offset + items.length < allItems.length) result.nextCursor = cursorFor(offset + items.length);
  return result;
}

export function publicClientKey(request: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string | undefined } }): string {
  const forwarded = request.headers["x-forwarded-for"];
  const raw = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : request.socket?.remoteAddress ?? "unknown";
  return createHash("sha256").update(raw || "unknown").digest("hex").slice(0, 32);
}
