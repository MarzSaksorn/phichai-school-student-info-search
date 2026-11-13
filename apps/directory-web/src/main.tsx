import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { SearchField } from "@heroui/react/search-field";
import { Select } from "@heroui/react/select";
import { Surface } from "@heroui/react/surface";
import "@heroui/styles";
import "./styles.css";

type Filters = { q: string; academicYear: string; grade: string; room: string; status: string };
type Student = { publicId: string; displayName: string; studentNumber?: string; academicYear: string; grade: string; room: string; status?: string };
type SearchBody = { items: Student[]; total: number; nextCursor?: string; datasetVersion: string; publishedAt: string };
type CacheEntry = { body: SearchBody; cachedAt: number };
type Key = string | number | null;

const PAGE_SIZE = "24";
const CACHE_TTL_MS = 60_000;
const CACHE_LIMIT = 32;
const LOAD_AHEAD_PX = 600;
const grades = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];
const years = ["2569", "2568"];
const rooms = Array.from({ length: 12 }, (_, index) => String(index + 1));
const statuses = ["ปกติ", "ย้าย"];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function selectValue(key: Key | null): string { return key && key !== "all" ? String(key) : ""; }

function App() {
  const [filters, setFilters] = useState<Filters>({ q: "", academicYear: "", grade: "", room: "", status: "" });
  const [items, setItems] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState("");
  const [status, setStatus] = useState("พร้อมแสดงรายชื่อนักเรียนที่เผยแพร่แล้ว");
  const [tone, setTone] = useState<"" | "success" | "error">("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [datasetVersion, setDatasetVersion] = useState("");
  const cache = useRef(new Map<string, CacheEntry>());
  const activeDatasetVersion = useRef("");
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const debounce = useRef<number | undefined>(undefined);

  const updateFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const readCachedPage = useCallback((key: string) => {
    const entry = cache.current.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt >= CACHE_TTL_MS) { cache.current.delete(key); return null; }
    cache.current.delete(key);
    cache.current.set(key, entry);
    return entry.body;
  }, []);

  const writeCachedPage = useCallback((key: string, body: SearchBody) => {
    if (activeDatasetVersion.current && body.datasetVersion && activeDatasetVersion.current !== body.datasetVersion) cache.current.clear();
    if (body.datasetVersion) activeDatasetVersion.current = body.datasetVersion;
    cache.current.delete(key);
    if (cache.current.size >= CACHE_LIMIT) {
      const oldest = cache.current.keys().next().value;
      if (oldest !== undefined) cache.current.delete(oldest);
    }
    cache.current.set(key, { body, cachedAt: Date.now() });
  }, []);

  const load = useCallback(async (append = false, cursorOverride = "") => {
    if (append && (!nextCursor && !cursorOverride)) return;
    if (!append) {
      controller.current?.abort();
      setNextCursor("");
      setItems([]);
      setHasLoaded(false);
    }
    const id = ++requestId.current;
    const cursor = cursorOverride || (append ? nextCursor : "");
    const params = new URLSearchParams({ q: filters.q.trim(), pageSize: PAGE_SIZE });
    (['academicYear', 'grade', 'room', 'status'] as const).forEach((key) => { if (filters[key]) params.set(key, filters[key]); });
    if (cursor) params.set("cursor", cursor);
    const key = params.toString();
    const cached = readCachedPage(key);
    if (cached) {
      if (id !== requestId.current) return;
      setItems((current) => append ? [...current, ...cached.items] : cached.items);
      setTotal(cached.total);
      setNextCursor(cached.nextCursor ?? "");
      setDatasetVersion(cached.datasetVersion);
      setStatus(filters.q ? `พบ ${cached.total.toLocaleString("th-TH")} รายการที่ตรงกับคำค้น` : `แสดงรายชื่อทั้งหมด ${cached.total.toLocaleString("th-TH")} คน`);
      setTone("success");
      setHasLoaded(true);
      return;
    }
    setLoading(!append);
    setLoadingMore(append);
    setStatus(append ? "กำลังโหลดรายชื่อเพิ่มเติม…" : "กำลังค้นหารายชื่อ…");
    const nextController = new AbortController();
    controller.current = nextController;
    try {
      const response = await fetch(`/api/search?${key}`, { headers: { accept: "application/json" }, signal: nextController.signal });
      const body = await response.json() as SearchBody & { error?: string };
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(body.error || "SEARCH_UNAVAILABLE");
      writeCachedPage(key, body);
      setItems((current) => append ? [...current, ...body.items] : body.items);
      setTotal(body.total);
      setNextCursor(body.nextCursor ?? "");
      setDatasetVersion(body.datasetVersion);
      setHasLoaded(true);
      setTone("success");
      setStatus(filters.q ? `พบ ${body.total.toLocaleString("th-TH")} รายการที่ตรงกับคำค้น` : `แสดงรายชื่อทั้งหมด ${body.total.toLocaleString("th-TH")} คน`);
    } catch (error) {
      if (id !== requestId.current || (error instanceof Error && error.name === "AbortError")) return;
      setItems([]);
      setTotal(0);
      setNextCursor("");
      setHasLoaded(true);
      setTone("error");
      setStatus(error instanceof Error && error.message === "NO_ACTIVE_DATASET" ? "ขณะนี้ยังไม่มีรายชื่อที่เผยแพร่" : "ระบบค้นหาไม่พร้อมใช้งานชั่วคราว");
    } finally {
      if (controller.current === nextController) controller.current = null;
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters, nextCursor, readCachedPage, writeCachedPage]);

  const freshSearch = useCallback(() => { void load(false); }, [load]);
  const submit = useCallback((event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); freshSearch(); }, [freshSearch]);

  useEffect(() => {
    void load(false);
    return () => controller.current?.abort();
    // The initial roster load is intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => { void load(false); }, 320);
    return () => { if (debounce.current) window.clearTimeout(debounce.current); };
  }, [filters.q, filters.academicYear, filters.grade, filters.room, filters.status, hasLoaded]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !nextCursor || loadingMore || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load(true);
    }, { rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px` });
    observer.observe(element);
    return () => observer.disconnect();
  }, [load, loading, loadingMore, nextCursor]);

  const selectedYear = filters.academicYear || "all";
  const selectedGrade = filters.grade || "all";
  const selectedRoom = filters.room || "all";
  const selectedStatus = filters.status || "all";
  const displayedYear = items[0]?.academicYear || filters.academicYear;
  const resultLabel = total ? `${total.toLocaleString("th-TH")} คน${displayedYear ? ` · ปีการศึกษา ${displayedYear}` : ""}` : hasLoaded ? "ไม่พบรายชื่อ" : "กำลังโหลดรายชื่อ…";

  return (
    <div className="site-frame">
      <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <header className="site-header" aria-label="ส่วนหัวเว็บไซต์">
        <a className="wordmark" href="/" aria-label="โรงเรียนพิชัย หน้าหลัก"><span className="wordmark-mark" aria-hidden="true">พ</span><span>โรงเรียนพิชัย</span></a>
        <nav className="header-nav" aria-label="การนำทางหลัก"><a href="#search">ค้นหานักเรียน</a><a href="#results">รายชื่อทั้งหมด</a><a href="#about">เกี่ยวกับข้อมูล</a></nav>
        <span className="header-note">ข้อมูลจากโรงเรียน</span>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="page-shell">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy-block">
              <p className="eyebrow">PHICHAI SCHOOL DIRECTORY</p>
              <h1 id="hero-title">ค้นชื่อ<br /><em>นักเรียน</em>ทั้งโรงเรียน</h1>
              <p className="hero-copy">พิมพ์ชื่อบางส่วน หรือกรอกเลขประจำตัวบางส่วนเพื่อค้นหาทันที ทั้งโรงเรียน ทุกชั้น ทุกห้อง — พร้อมระดับชั้นและห้องเรียนกำกับ</p>
              <div className="hero-actions"><Button variant="primary" onPress={() => document.querySelector("#search")?.scrollIntoView({ behavior: "smooth" })}>ค้นหาชื่อนักเรียน</Button><Button variant="outline" onPress={() => document.querySelector("#results")?.scrollIntoView({ behavior: "smooth" })}>ดูรายชื่อทั้งหมด</Button></div>
              <p className="trust-note">ชื่อและเลขประจำตัวแสดงตามที่โรงเรียนอนุมัติ · ไม่เปิดเผยข้อมูลแหล่งที่มาภายใน</p>
            </div>
            <div className="hero-art" aria-label="ภาพประกอบระบบค้นหาชื่อนักเรียน" role="img"><div className="art-card"><span className="art-label">directory / 01</span><p className="art-title">Every name,<br /><span>one search.</span></p><div className="art-footer"><strong>PHICHAI SCHOOL</strong><span>{total ? `${total.toLocaleString("th-TH")} NAMES` : "ROSTER"}</span></div></div></div>
          </section>
          <section id="search" className="search-section" aria-labelledby="search-title">
            <div className="section-heading"><h2 id="search-title">ค้นหานักเรียน</h2><p>พิมพ์ชื่อบางส่วน หรือกรอกเลขประจำตัวบางส่วน รายชื่อทั้งหมดจะแสดงด้านล่าง</p></div>
            <Surface className="search-panel">
              <form className="search-form" onSubmit={submit}>
                <div className="search-row">
                  <SearchField name="q" value={filters.q} onChange={(value: string) => updateFilter("q", value)} variant="secondary" className="search-field">
                    <Label className="sr-only">คำค้นหา</Label>
                    <SearchField.Group><SearchField.SearchIcon /><SearchField.Input placeholder="ค้นหาชื่อ หรือเลขประจำตัวบางส่วน" maxLength={80} /><SearchField.ClearButton /></SearchField.Group>
                  </SearchField>
                  <Button type="submit" variant="primary" size="lg" isPending={loading && !loadingMore}>ค้นหา</Button>
                </div>
                <div className="filter-row" aria-label="ตัวกรองการค้นหา">
                  <FilterSelect label="ปีการศึกษา" value={selectedYear} options={years} onChange={(key) => updateFilter("academicYear", selectValue(key))} />
                  <FilterSelect label="ระดับชั้น" value={selectedGrade} options={grades} onChange={(key) => updateFilter("grade", selectValue(key))} />
                  <FilterSelect label="ห้องเรียน" value={selectedRoom} options={rooms} optionLabel={(value) => `ห้อง ${value}`} onChange={(key) => updateFilter("room", selectValue(key))} />
                  <FilterSelect label="สถานะ" value={selectedStatus} options={statuses} onChange={(key) => updateFilter("status", selectValue(key))} />
                </div>
                <p className={`status-line ${tone}`} role="status" aria-live="polite">{status}</p>
              </form>
            </Surface>
          </section>
          <section id="results" aria-labelledby="results-title">
            <div className="results-header"><h2 id="results-title">รายชื่อนักเรียน</h2><div className="grade-chips" aria-label="ตัวกรองชั้นเรียนด่วน"><span>ดูตามชั้น:</span><Button size="sm" variant={!filters.grade ? "primary" : "outline"} onPress={() => updateFilter("grade", "")}>ทั้งหมด</Button>{grades.map((grade) => <Button key={grade} size="sm" variant={filters.grade === grade ? "primary" : "outline"} onPress={() => updateFilter("grade", grade)}>{grade}</Button>)}</div><span className="result-count"><strong>{resultLabel}</strong></span></div>
            {loading && !items.length ? <div className="empty-state"><h3>กำลังค้นหา</h3><p>กำลังตรวจสอบรายชื่อที่เผยแพร่ล่าสุด</p></div> : !items.length && hasLoaded ? <div className="empty-state"><h3>ไม่พบชื่อที่ตรงกัน</h3><p>ลองพิมพ์ชื่อบางส่วน หรือเลือกชั้นเรียนใหม่</p></div> : <div className="result-grid">{items.map((item, index) => <StudentCard item={item} index={index + 1} key={`${item.publicId}-${index}`} />)}</div>}
            <div ref={sentinel} className={`load-more ${nextCursor ? "is-visible" : ""}`}><Button variant="outline" isPending={loadingMore} isDisabled={loadingMore} onPress={() => void load(true)}>ดูรายชื่อเพิ่มเติม</Button></div>
          </section>
          <section id="about" className="site-footer" aria-label="ข้อมูลเกี่ยวกับสารบบ"><p><strong>หลักการข้อมูล</strong><br />ข้อมูลนักเรียนมาจากไฟล์ XLSX ที่โรงเรียนอนุมัติเท่านั้น</p><p><strong>ข้อมูลที่แสดง</strong><br />ชื่อและเลขประจำตัวเผยแพร่ตามมติอนุมัติของโรงเรียน · ไม่แสดงแหล่งที่มาภายใน</p></section>
        </div>
      </main>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange, optionLabel = (item: string) => item }: { label: string; value: string; options: string[]; onChange: (key: Key | null) => void; optionLabel?: (item: string) => string }) {
  return <Select className="filter-select" value={value} onChange={onChange} placeholder={label} variant="secondary"><Label>{label}</Label><Select.Trigger><Select.Value /><Select.ClearButton /><Select.Indicator /></Select.Trigger><Select.Popover><ListBox><ListBox.Item id="all" textValue={`ทุก${label}`}>ทุก{label}<ListBox.ItemIndicator /></ListBox.Item>{options.map((option) => <ListBox.Item key={option} id={option} textValue={optionLabel(option)}>{optionLabel(option)}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover></Select>;
}

function StudentCard({ item, index }: { item: Student; index: number }) {
  return <Card className="result-card" variant="default"><Card.Header><div className="result-card-top"><span className="result-index">{String(index).padStart(3, "0")}</span>{item.status ? <span className="result-status">{item.status}</span> : null}</div><Card.Title>{item.displayName}</Card.Title></Card.Header><Card.Content><div className="result-meta">{item.studentNumber ? <span>เลขประจำตัว {item.studentNumber}</span> : null}<span>{item.grade}</span><span>ห้อง {item.room}</span><span>ปี {item.academicYear}</span></div></Card.Content></Card>;
}

createRoot(document.getElementById("root")!).render(<App />);
