/* ------------------------- Sessions & terms ------------------------------ */
export const CURRENT_SESSION = "2025/2026";
export const SESSIONS = ["2023/2024", "2024/2025", "2025/2026", "2026/2027"];
export const TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;

/* --------------------- Score structure (Test + Exam) ---------------------- */
/** Continuous Assessment (Test) is marked over 40, Exam over 60.
 *  The term total used on the report card = Test + Exam (over 100). */
export const TEST_MAX = 40;
export const EXAM_MAX = 60;

/** Split a total (0-100) into a sensible Test/Exam pair, e.g. for old records. */
export function splitScore(total: number): { test: number; exam: number } {
  const t = Math.max(0, Math.min(100, Math.round(total)));
  const test = Math.round((t * TEST_MAX) / 100);
  return { test, exam: t - test };
}

/* --------------------------- Grade scale --------------------------------- */
/* Matches the "KEYS TO GRADE RATING" on the Edana report card */
export interface GradeInfo {
  grade: string;
  remark: string;
  min: number;
  color: string;
}

export const GRADE_SCALE: GradeInfo[] = [
  { grade: "A+", remark: "Outstanding", min: 95, color: "text-emerald-600" },
  { grade: "A", remark: "Excellent", min: 85, color: "text-emerald-600" },
  { grade: "B", remark: "Very Good", min: 75, color: "text-blue-600" },
  { grade: "C", remark: "Good", min: 60, color: "text-cyan-700" },
  { grade: "D", remark: "Average", min: 50, color: "text-amber-600" },
  { grade: "E", remark: "Below Average", min: 40, color: "text-orange-600" },
  { grade: "F", remark: "Poor/Fail", min: 0, color: "text-red-600" },
];

export function gradeOf(score: number): GradeInfo {
  return GRADE_SCALE.find((g) => score >= g.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
}

/* --------------------- Affective & psychomotor traits --------------------- */
export const AFFECTIVE_TRAITS = [
  "Attentiveness",
  "Attitude to School Work",
  "Cooperation with Others",
  "Emotional Stability",
  "Leadership",
  "Attendance",
  "Neatness",
  "Perseverance",
  "Politeness",
  "Punctuality",
  "Speaking / Writing",
  "Organisation Ability",
  "Relationship with Others",
];

export const PSYCHOMOTOR_SKILLS = [
  "Handling of Tools",
  "Handwriting",
  "Verbal Fluency",
  "Processing Speed",
  "Retentiveness",
];

export const RATING_KEYS: { value: number; label: string }[] = [
  { value: 1, label: "Very Poor" },
  { value: 2, label: "Poor" },
  { value: 3, label: "Fair" },
  { value: 4, label: "Good" },
  { value: 5, label: "Excellent" },
];

/* ------------------------- Default class list ----------------------------- */
/* Reception 1 -> SS 3 (also seeded by the SQL setup) */
export const DEFAULT_CLASSES: { name: string; level: string; sort_order: number }[] = [
  { name: "Reception 1", level: "Early Years", sort_order: 1 },
  { name: "Reception 2", level: "Early Years", sort_order: 2 },
  { name: "Nursery 1", level: "Early Years", sort_order: 3 },
  { name: "Nursery 2", level: "Early Years", sort_order: 4 },
  { name: "Basic 1", level: "Basic", sort_order: 5 },
  { name: "Basic 2", level: "Basic", sort_order: 6 },
  { name: "Basic 3", level: "Basic", sort_order: 7 },
  { name: "Basic 4", level: "Basic", sort_order: 8 },
  { name: "Basic 5", level: "Basic", sort_order: 9 },
  { name: "Basic 6", level: "Basic", sort_order: 10 },
  { name: "JSS 1", level: "Junior Secondary", sort_order: 11 },
  { name: "JSS 2", level: "Junior Secondary", sort_order: 12 },
  { name: "JSS 3", level: "Junior Secondary", sort_order: 13 },
  { name: "SS 1", level: "Senior Secondary", sort_order: 14 },
  { name: "SS 2", level: "Senior Secondary", sort_order: 15 },
  { name: "SS 3", level: "Senior Secondary", sort_order: 16 },
];

/* ------------------------------- Helpers ---------------------------------- */
export function formatMoney(n: number): string {
  return "₦" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function generateAdmissionNo(): string {
  const yy = new Date().getFullYear().toString().slice(2);
  const serial = Math.floor(1000 + Math.random() * 9000);
  return `EDN/${yy}/${serial}`;
}

export function generateReference(): string {
  return "EDN-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 90 + 10);
}

export function fullName(s: { first_name: string; last_name: string }): string {
  return `${s.first_name} ${s.last_name}`.trim();
}

export function formatDate(d?: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US");
}

/** Standard competition ranking ("1224") from a score map. Returns rank per id. */
export function rankMap(scores: Map<string, number>): Map<string, number> {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number>();
  let prevScore: number | null = null;
  let prevRank = 0;
  sorted.forEach(([id, score], i) => {
    const rank = prevScore !== null && score === prevScore ? prevRank : i + 1;
    ranks.set(id, rank);
    prevScore = score;
    prevRank = rank;
  });
  return ranks;
}

/* ------------------------------ CSV parsing ------------------------------- */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

export const CSV_TEMPLATE =
  "First Name,Last Name,Gender,Class,Date of Birth,Guardian Name,Guardian Phone,Guardian Email,Address\n" +
  "Adaeze,Okafor,Female,Basic 4,2016-05-14,Mrs Okafor,08031234567,okafor@example.com,\"12 Allen Avenue, Ikeja\"\n" +
  "Tunde,Bakare,Male,JSS 1,2013-09-02,Mr Bakare,08059876543,bakare@example.com,\"4 Adeola Street, Lagos\"";
