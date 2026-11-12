import { createHash } from "node:crypto";
import { allowsExactStudentNumberSearch, exposesStudentNumber, type ApprovedFieldConfig } from "./publicFieldConfig.js";
import { supabaseAdmin } from "./supabase.js";

export type PublicSearchInput = { q: string; academicYear?: string; grade?: string; room?: string; status?: string; cursor?: string; pageSize: number };
export type PublicSearchOutput = { items: Array<{ publicId: string; recordType: "student"; displayName: string; studentNumber?: string; academicYear: string; grade: string; room: string; status?: string; publishedAt: string }>; total: number; nextCursor?: string; datasetVersion: string; publishedAt: string };

// A published record must carry a person's name. Workbook footer notes
// ("ณ วันที่ ... จำนวนนักเรียนทั้งหมด") are not names, so they are never served
// even if an older dataset version still contains them.
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

// The public roster is ordered ชั้น (grade) → ห้อง (room) → เพศ (sex, ชายก่อนหญิง)
// → เลขประจำตัว (student number) → ชื่อ (name). Rooms and student numbers are
// text columns, so the comparison happens in code where "2" < "10" and
// "9" < "10" hold numerically; the database cannot express these casts through
// the public query API.
const gradeOrder = (grade: string): number => { const match = /^ม\.(\d+)$/u.exec(grade); return match ? Number(match[1]) : Number.POSITIVE_INFINITY; };
const numericOrLast = (value: string | null): number => { if (value === null || value === "") return Number.POSITIVE_INFINITY; return /^\d+$/u.test(value) ? Number(value) : Number.POSITIVE_INFINITY; };
// Sex comes from the public name title (เด็กชาย/นาย vs เด็กหญิง/นางสาว/นาง) —
// there is no separate column in the approved dataset, and approved workbooks
// write the title with or without a space. Unknown titles are placed after both
// groups so the male → female split stays clean.
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

export async function searchPublishedStudents(input: PublicSearchInput): Promise<PublicSearchOutput> {
  const q = clean(input.q).toLocaleLowerCase("th-TH");
  const offset = cursorValue(input.cursor);
  const { data: active, error: activeError } = await supabaseAdmin().schema("directory").from("dataset_versions").select("id,version,published_at,created_at,field_config_version").eq("status", "active").maybeSingle();
  if (activeError) throw new Error("SEARCH_UNAVAILABLE");
  if (!active) throw new Error("NO_ACTIVE_DATASET");
  let fieldConfig: ApprovedFieldConfig | null = null;
  if (active.field_config_version) {
    const { data, error } = await supabaseAdmin().schema("directory").from("approved_field_config")
      .select("student_public_fields,student_identifier_search,student_identifier_display")
      .eq("version", active.field_config_version).maybeSingle();
    if (error) throw new Error("SEARCH_UNAVAILABLE");
    fieldConfig = data;
  }
  const showStudentNumber = exposesStudentNumber(fieldConfig);
  const searchStudentNumber = allowsExactStudentNumberSearch(fieldConfig);
  let query = supabaseAdmin()
    .schema("directory")
    .from("published_student_records")
    .select("public_id,display_name,student_identifier,academic_year,grade,room,status")
    .eq("dataset_version_id", active.id)
    .not("display_name", "ilike", "%ณ วันที่%")
    .not("display_name", "ilike", "%จำนวนนักเรียน%")
    .order("public_id", { ascending: true });
  // Number lookup is available only when the active version's approved field config allows it.
  if (searchStudentNumber && /^\d{1,12}$/u.test(q)) query = query.eq("student_identifier", q);
  else if (q) query = query.ilike("search_name", `%${q.replace(/[%_]/gu, "\\$&")}%`);
  if (input.academicYear) query = query.eq("academic_year", clean(input.academicYear));
  if (input.grade) query = query.eq("grade", clean(input.grade));
  if (input.room) query = query.eq("room", clean(input.room));
  if (input.status) query = query.eq("status", clean(input.status));
  // Fetch every row matching the request filters (paged for the query API's row
  // limit), then order the full match set so every page follows one roster order.
  const rows: RosterRow[] = [];
  for (let fetchOffset = 0; ; fetchOffset += ROSTER_FETCH_PAGE) {
    const { data, error } = await query.range(fetchOffset, fetchOffset + ROSTER_FETCH_PAGE - 1);
    if (error) throw new Error("SEARCH_UNAVAILABLE");
    const page = (data ?? []) as RosterRow[];
    rows.push(...page);
    if (page.length < ROSTER_FETCH_PAGE) break;
  }
  const publishedAt = active.published_at ?? active.created_at;
  const roster = rows
    .filter((row) => !SUMMARY_NOTE_PATTERN.test(String(row.display_name ?? "")))
    .sort(compareRosterRows);
  const total = roster.length;
  const items = roster
    .slice(offset, offset + input.pageSize)
    .map((row) => ({ publicId: row.public_id, recordType: "student" as const, displayName: row.display_name, ...(showStudentNumber && row.student_identifier ? { studentNumber: String(row.student_identifier) } : {}), academicYear: row.academic_year, grade: row.grade, room: row.room, ...(row.status ? { status: row.status } : {}), publishedAt }));
  const result: PublicSearchOutput = { items, total, datasetVersion: active.version, publishedAt };
  if (offset + items.length < total) result.nextCursor = cursorFor(offset + items.length);
  return result;
}

export function publicClientKey(request: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string | undefined } }): string {
  const forwarded = request.headers["x-forwarded-for"];
  const raw = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : request.socket?.remoteAddress ?? "unknown";
  return createHash("sha256").update(raw || "unknown").digest("hex").slice(0, 32);
}
