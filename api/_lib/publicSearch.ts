import { createHash } from "node:crypto";
import { supabaseAdmin } from "./supabase.js";

export type PublicSearchInput = { q: string; academicYear?: string; grade?: string; room?: string; status?: string; cursor?: string; pageSize: number };
export type PublicSearchOutput = { items: Array<{ publicId: string; recordType: "student"; displayName: string; academicYear: string; grade: string; room: string; status?: string; publishedAt: string }>; total: number; nextCursor?: string; datasetVersion: string; publishedAt: string };

// A published record must carry a person's name. Workbook footer notes
// ("ณ วันที่ ... จำนวนนักเรียนทั้งหมด") are not names, so they are never served
// even if an older dataset version still contains them.
const SUMMARY_NOTE_PATTERN = /ณ\s*วันที่|จำนวนนักเรียน|นักเรียนทั้งหมด|รวมทั้งสิ้น/u;

function clean(value: string): string { return value.normalize("NFKC").trim().replace(/\s+/gu, " "); }
function cursorValue(cursor: string | undefined): number { if (!cursor) return 0; try { const offset = Number(Buffer.from(cursor, "base64url").toString("utf8")); if (!Number.isSafeInteger(offset) || offset < 0) throw new Error(); return offset; } catch { throw new Error("CURSOR_INVALID"); } }
function cursorFor(offset: number): string { return Buffer.from(String(offset), "utf8").toString("base64url"); }

export async function searchPublishedStudents(input: PublicSearchInput): Promise<PublicSearchOutput> {
  const q = clean(input.q).toLocaleLowerCase("th-TH");
  const offset = cursorValue(input.cursor);
  const { data: active, error: activeError } = await supabaseAdmin().schema("directory").from("dataset_versions").select("id,version,published_at,created_at").eq("status", "active").maybeSingle();
  if (activeError) throw new Error("SEARCH_UNAVAILABLE");
  if (!active) throw new Error("NO_ACTIVE_DATASET");
  let query = supabaseAdmin()
    .schema("directory")
    .from("published_student_records")
    .select("public_id,display_name,academic_year,grade,room,status", { count: "exact" })
    .eq("dataset_version_id", active.id)
    .not("display_name", "ilike", "%ณ วันที่%")
    .not("display_name", "ilike", "%จำนวนนักเรียน%")
    .order("display_name", { ascending: true })
    .order("public_id", { ascending: true });
  if (q) query = query.ilike("search_name", `%${q.replace(/[%_]/gu, "\\$&")}%`);
  if (input.academicYear) query = query.eq("academic_year", clean(input.academicYear));
  if (input.grade) query = query.eq("grade", clean(input.grade));
  if (input.room) query = query.eq("room", clean(input.room));
  if (input.status) query = query.eq("status", clean(input.status));
  const { data, error, count } = await query.range(offset, offset + input.pageSize - 1);
  if (error) throw new Error("SEARCH_UNAVAILABLE");
  const publishedAt = active.published_at ?? active.created_at;
  const items = (data ?? [])
    .filter((row) => !SUMMARY_NOTE_PATTERN.test(String(row.display_name ?? "")))
    .map((row) => ({ publicId: row.public_id, recordType: "student" as const, displayName: row.display_name, academicYear: row.academic_year, grade: row.grade, room: row.room, ...(row.status ? { status: row.status } : {}), publishedAt }));
  const total = count ?? items.length;
  const result: PublicSearchOutput = { items, total, datasetVersion: active.version, publishedAt };
  if (count !== null && offset + items.length < count) result.nextCursor = cursorFor(offset + items.length);
  return result;
}

export function publicClientKey(request: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string | undefined } }): string {
  const forwarded = request.headers["x-forwarded-for"];
  const raw = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : request.socket?.remoteAddress ?? "unknown";
  return createHash("sha256").update(raw || "unknown").digest("hex").slice(0, 32);
}
