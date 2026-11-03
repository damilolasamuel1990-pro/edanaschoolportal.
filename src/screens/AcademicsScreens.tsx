import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Plus, Trash2, Save, Printer, ArrowLeft, Check, Pencil, Upload, Download } from "lucide-react";
import { supabase } from "../supabase";
import type { Profile, Student, Subject, ResultRow, ReportMeta } from "../types";
import {
  TERMS, GRADE_SCALE, gradeOf,
  AFFECTIVE_TRAITS, PSYCHOMOTOR_SKILLS, RATING_KEYS, rankMap, fullName, formatDate,
  TEST_MAX, EXAM_MAX, splitScore, parseScoreCSV, scoresFromCsv, SCORE_CSV_TEMPLATE,
} from "../lib/school";
import { useClasses, className, fetchStudents, fetchSubjects, fetchMyChildren, overallAverage, saveResultRows, fetchSignatureUrl, passportPublicUrl, useSessions, type ResultSaveRow } from "../lib/data";
import {
  PageHeader, Card, Banner, Spinner, Field, fieldCls,
  Avatar, EmptyState, friendlyError, Logo, Modal,
} from "../components/ui";
import type { PageKey } from "../layout/DashboardLayout";

const isStaffRole = (r: string) => r === "super_admin" || r === "admin" || r === "teacher";
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/* -------------------------------- Subjects -------------------------------- */
export function SubjectsScreen({ profile }: { profile: Profile }) {
  const { classes } = useClasses();
  const [classId, setClassId] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [newSubject, setNewSubject] = useState("");
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // student-subject enrolment
  const [studentId, setStudentId] = useState("");
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [enrolLoaded, setEnrolLoaded] = useState(false);

  useEffect(() => {
    if (!classId) { setSubjects([]); setStudents([]); return; }
    fetchSubjects(classId).then(setSubjects);
    fetchStudents(classId).then((list) => setStudents(list.filter((s) => s.status === "active")));
    setStudentId("");
  }, [classId]);

  useEffect(() => {
    if (!studentId) { setEnrolled(new Set()); setEnrolLoaded(false); return; }
    supabase.from("student_subjects").select("subject_id").eq("student_id", studentId)
      .then(({ data }) => {
        setEnrolled(new Set(((data ?? []) as { subject_id: string }[]).map((r) => r.subject_id)));
        setEnrolLoaded(true);
      });
  }, [studentId]);

  const addSubject = async (e: FormEvent) => {
    e.preventDefault();
    if (!classId || !newSubject.trim()) return;
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("subjects").insert({ name: newSubject.trim(), class_id: classId, created_by: profile.id });
    setSaving(false);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else { setNewSubject(""); setSubjects(await fetchSubjects(classId)); }
  };

  const deleteSubject = async (s: Subject) => {
    if (!window.confirm(`Delete subject "${s.name}"? Its results will also be removed.`)) return;
    const { error } = await supabase.from("subjects").delete().eq("id", s.id);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else setSubjects(await fetchSubjects(classId));
  };

  const toggleEnrolled = (id: string) => setEnrolled((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const saveEnrolment = async () => {
    if (!studentId) return;
    setSaving(true); setMsg(null);
    await supabase.from("student_subjects").delete().eq("student_id", studentId);
    if (enrolled.size > 0) {
      const { error } = await supabase.from("student_subjects").insert(
        [...enrolled].map((subject_id) => ({ student_id: studentId, subject_id }))
      );
      if (error) { setSaving(false); setMsg({ type: "err", text: friendlyError(error.message) }); return; }
    }
    setSaving(false);
    setMsg({ type: "ok", text: enrolled.size === 0 ? "Enrolment cleared — the student will use all class subjects by default." : "Student subjects saved." });
  };

  return (
    <div>
      <PageHeader title="Subjects" subtitle="Manage class subjects and the subjects each student offers" />
      <div className="space-y-4">
        <Banner msg={msg} />
        <Card className="p-5 max-w-xl">
          <Field label="Select Class">
            <select className={fieldCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </Card>

        {classId && (
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <Card className="p-6">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-[#0a4da8]" /> Subjects in {className(classes, classId)}
              </h3>
              <form onSubmit={addSubject} className="flex gap-2 mb-4">
                <input className={fieldCls} placeholder="e.g. Mathematics" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
                <button disabled={saving} className="inline-flex items-center gap-1.5 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 text-sm font-medium whitespace-nowrap">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </form>
              {subjects.length === 0 ? (
                <EmptyState text="No subjects yet. Add the subjects offered in this class." />
              ) : (
                <ul className="divide-y divide-slate-50">
                  {subjects.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-2.5">
                      <span className="mr-auto text-slate-800 font-medium">{s.name}</span>
                      <button onClick={() => deleteSubject(s)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete subject">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="font-bold text-slate-900 mb-1">Student Subjects</h3>
              <p className="text-[13px] text-slate-500 mb-4 leading-relaxed">
                Choose a student and tick the subjects they offer (useful for elective subjects in senior classes).
                If nothing is ticked, the student automatically offers all class subjects.
              </p>
              <Field label="Student">
                <select className={fieldCls} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">Select student…</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{fullName(s)} ({s.admission_no})</option>)}
                </select>
              </Field>
              {studentId && enrolLoaded && (
                <div className="mt-4">
                  {subjects.length === 0 ? (
                    <p className="text-sm text-slate-500">Add subjects to this class first.</p>
                  ) : (
                    <>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {subjects.map((s) => (
                          <label key={s.id} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer hover:border-[#0a4da8]/40">
                            <input type="checkbox" checked={enrolled.has(s.id)} onChange={() => toggleEnrolled(s.id)} className="h-4 w-4 accent-[#0a4da8]" />
                            <span className="text-sm text-slate-700">{s.name}</span>
                          </label>
                        ))}
                      </div>
                      <button onClick={saveEnrolment} disabled={saving} className="mt-4 inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                        {saving ? <Spinner /> : <Save className="w-4 h-4" />} Save Student Subjects
                      </button>
                    </>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------- Import scores (CSV) --------------------------- */
/** Teachers/Admins: bulk-import Test/Exam scores into students' report cards. */
function ScoreImportModal({
  profile, session, onClose,
}: {
  profile: Profile;
  session: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [csvRows, setCsvRows] = useState<ReturnType<typeof parseScoreCSV>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  const parse = (value: string) => { setText(value); setCsvRows(parseScoreCSV(value)); };

  const onFile = async (file: File | undefined) => { if (file) parse(await file.text()); };

  const downloadTemplate = () => {
    const blob = new Blob([SCORE_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "edana-scores-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async () => {
    setBusy(true); setMsg(null);
    const students = await fetchStudents();
    const byAdmission = new Map(students.map((s) => [s.admission_no.trim().toUpperCase(), s]));
    const subjectCache = new Map<string, Subject[]>();
    const toSave: ResultSaveRow[] = [];
    const errors: string[] = [];

    for (let i = 0; i < csvRows.length; i++) {
      const r = csvRows[i];
      const line = i + 2;
      if (!r.admission && !r.subject) continue;
      const student = byAdmission.get(r.admission.toUpperCase());
      if (!student) { errors.push(`Line ${line}: admission no "${r.admission}" not found`); continue; }
      if (!r.term) { errors.push(`Line ${line}: term not recognised — use 1st Term, 2nd Term or 3rd Term`); continue; }
      if (!student.class_id) { errors.push(`Line ${line}: ${fullName(student)} has no class yet`); continue; }
      if (!subjectCache.has(student.class_id)) {
        subjectCache.set(student.class_id, await fetchSubjects(student.class_id));
      }
      const subj = subjectCache.get(student.class_id)!.find(
        (s) => s.name.toLowerCase() === r.subject.toLowerCase()
      );
      if (!subj) { errors.push(`Line ${line}: subject "${r.subject}" not found in ${fullName(student)}'s class`); continue; }
      const sc = scoresFromCsv(r);
      if (!sc) { errors.push(`Line ${line}: no Test, Exam or Score value`); continue; }
      toSave.push({
        student_id: student.id, subject_id: subj.id, term: r.term, session,
        test_score: sc.test, exam_score: sc.exam, score: sc.test + sc.exam,
        entered_by: profile.id,
      });
    }

    if (toSave.length > 0) {
      const res = await saveResultRows(toSave);
      if (res.error) {
        setBusy(false);
        setMsg({ type: "err", text: friendlyError(res.error) });
        return;
      }
      if (res.degraded) errors.push("Scores were saved as totals only until the latest database update is run.");
    }
    setBusy(false);
    setMsg({
      type: toSave.length === 0 ? "err" : "ok",
      text:
        `Imported ${toSave.length} score(s) into ${session} report cards.` +
        (errors.length
          ? ` Issues: ${errors.slice(0, 5).join(" · ")}${errors.length > 5 ? ` · and ${errors.length - 5} more` : ""}`
          : ""),
    });
    if (toSave.length > 0) { setCsvRows([]); setText(""); }
  };

  return (
    <Modal title="Import Scores from CSV" onClose={onClose} wide>
      <div className="space-y-4">
        <Banner msg={msg} />
        <p className="text-sm text-slate-500 leading-relaxed">
          Prepare a spreadsheet with columns <b>Admission No, Subject, Term, Test, Exam</b> (a single
          Score column also works). Each row goes straight into that student's report card for{" "}
          <b>{session}</b>. Students are matched by admission number; subjects are matched within
          the student's class.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="w-4 h-4" /> Download Template
          </button>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
            <Upload className="w-4 h-4" /> Upload CSV File
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        <Field label="…or paste CSV content here">
          <textarea
            className={fieldCls + " font-mono text-xs"}
            rows={6}
            value={text}
            onChange={(e) => parse(e.target.value)}
            placeholder={"Admission No,Subject,Term,Test,Exam\nEDN/25/1023,Mathematics,1st Term,35,58"}
          />
        </Field>

        {csvRows.length > 0 && (
          <>
            <div className="overflow-x-auto border border-slate-100 rounded-lg">
              <table className="w-full text-xs min-w-[520px]">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="py-2 px-3 font-semibold">Admission No</th>
                    <th className="py-2 px-3 font-semibold">Subject</th>
                    <th className="py-2 px-3 font-semibold">Term</th>
                    <th className="py-2 px-3 font-semibold">Test</th>
                    <th className="py-2 px-3 font-semibold">Exam</th>
                    <th className="py-2 px-3 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 10).map((r, i) => {
                    const sc = scoresFromCsv(r);
                    return (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-1.5 px-3">{r.admission || "—"}</td>
                        <td className="py-1.5 px-3">{r.subject || "—"}</td>
                        <td className="py-1.5 px-3">{r.term || "?"}</td>
                        <td className="py-1.5 px-3">{sc ? sc.test : "—"}</td>
                        <td className="py-1.5 px-3">{sc ? sc.exam : "—"}</td>
                        <td className="py-1.5 px-3 font-semibold">{sc ? sc.test + sc.exam : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {csvRows.length > 10 && <p className="text-[11px] text-slate-400 px-3 py-2">Showing first 10 of {csvRows.length} rows…</p>}
            </div>
            <button
              onClick={doImport}
              disabled={busy}
              className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-5 py-2.5 text-sm font-medium"
            >
              {busy ? <Spinner /> : <Upload className="w-4 h-4" />}
              {busy ? "Importing…" : `Import ${csvRows.length} Row${csvRows.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------ Input Results ----------------------------- */
export interface ScoreEntry {
  test: string;
  exam: string;
}

const EMPTY_ENTRY: ScoreEntry = { test: "", exam: "" };

/** Build the editable Test/Exam pair from a stored result row. */
function entryFromRow(r?: ResultRow): ScoreEntry {
  if (!r) return { ...EMPTY_ENTRY };
  if (r.test_score != null && r.exam_score != null) {
    return { test: String(r.test_score), exam: String(r.exam_score) };
  }
  // Older records only have a total — split it into Test/Exam for display
  const parts = splitScore(Number(r.score));
  return { test: String(parts.test), exam: String(parts.exam) };
}

function clampMark(value: string, max: number): number {
  const n = Number(value);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

/** Total (0-100) from a Test/Exam pair, or null if both boxes are empty. */
function entryTotal(e: ScoreEntry): number | null {
  if (e.test.trim() === "" && e.exam.trim() === "") return null;
  return clampMark(e.test, TEST_MAX) + clampMark(e.exam, EXAM_MAX);
}

export function ResultsScreen({ profile }: { profile: Profile }) {
  const { classes } = useClasses();
  const [mode, setMode] = useState<"subject" | "student">("subject");
  const { sessionNames, currentSession } = useSessions();
  const [session, setSession] = useState("");
  useEffect(() => { if (!session && currentSession) setSession(currentSession); }, [currentSession, session]);
  const [term, setTerm] = useState<string>(TERMS[0]);
  const [classId, setClassId] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // By Subject: one subject, every student in the class
  const [subjectId, setSubjectId] = useState("");
  const [classEntries, setClassEntries] = useState<Record<string, ScoreEntry>>({});

  // By Student: one student, every subject (report-card layout)
  const [studentId, setStudentId] = useState("");
  const [effectiveSubjects, setEffectiveSubjects] = useState<Subject[]>([]);
  const [studentEntries, setStudentEntries] = useState<Record<string, ScoreEntry>>({});

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  // Class -> students + subjects
  useEffect(() => {
    if (!classId) { setStudents([]); setSubjects([]); return; }
    fetchStudents(classId).then((list) => {
      const active = list.filter((s) => s.status === "active");
      setStudents(active);
      setStudentId((prev) => (active.some((s) => s.id === prev) ? prev : active[0]?.id ?? ""));
    });
    fetchSubjects(classId).then((list) => {
      setSubjects(list);
      setSubjectId((prev) => (list.some((s) => s.id === prev) ? prev : list[0]?.id ?? ""));
    });
  }, [classId]);

  // By Subject: load saved Test/Exam for the chosen subject & term
  useEffect(() => {
    if (mode !== "subject" || !subjectId || students.length === 0) { setClassEntries({}); return; }
    setLoading(true);
    supabase.from("results").select("*")
      .eq("subject_id", subjectId).eq("term", term).eq("session", session)
      .in("student_id", students.map((s) => s.id))
      .then(({ data }) => {
        const map: Record<string, ScoreEntry> = {};
        ((data ?? []) as ResultRow[]).forEach((r) => { map[r.student_id] = entryFromRow(r); });
        setClassEntries(map);
        setLoading(false);
      });
  }, [mode, subjectId, term, session, students]);

  // By Student: subjects the student offers (enrolled subjects, else all class subjects)
  useEffect(() => {
    if (mode !== "student" || !studentId) { setEffectiveSubjects([]); return; }
    (async () => {
      const { data } = await supabase.from("student_subjects").select("subject_id").eq("student_id", studentId);
      const enrolled = new Set(((data ?? []) as { subject_id: string }[]).map((e) => e.subject_id));
      setEffectiveSubjects(enrolled.size > 0 ? subjects.filter((s) => enrolled.has(s.id)) : subjects);
    })();
  }, [mode, studentId, subjects]);

  // By Student: load saved Test/Exam for the chosen student & term
  useEffect(() => {
    if (mode !== "student" || !studentId) { setStudentEntries({}); return; }
    setLoading(true);
    supabase.from("results").select("*")
      .eq("student_id", studentId).eq("term", term).eq("session", session)
      .then(({ data }) => {
        const map: Record<string, ScoreEntry> = {};
        ((data ?? []) as ResultRow[]).forEach((r) => { map[r.subject_id] = entryFromRow(r); });
        setStudentEntries(map);
        setLoading(false);
      });
  }, [mode, studentId, term, session]);

  const upsertEntry = async (
    student_id: string,
    subject_id: string,
    e: ScoreEntry
  ): Promise<{ err?: string; degraded?: boolean }> => {
    const total = entryTotal(e);
    if (total === null) {
      const { error } = await supabase.from("results").delete()
        .eq("student_id", student_id).eq("subject_id", subject_id).eq("term", term).eq("session", session);
      return error ? { err: error.message } : {};
    }
    const test = clampMark(e.test, TEST_MAX);
    const exam = clampMark(e.exam, EXAM_MAX);
    const res = await saveResultRows([{
      student_id, subject_id, term, session,
      test_score: test, exam_score: exam, score: test + exam,
      entered_by: profile.id,
    }]);
    return res.error ? { err: res.error } : { degraded: res.degraded };
  };

  const degradedNote =
    " Note: scores were saved as totals only — to also store the Test/Exam breakdown, run the latest database update (the 3-line SQL or the full setup script).";

  const saveBySubject = async () => {
    setSaving(true); setMsg(null);
    let saved = 0;
    let degraded = false;
    for (const s of students) {
      const entry = classEntries[s.id] ?? EMPTY_ENTRY;
      const res = await upsertEntry(s.id, subjectId, entry);
      if (res.err) { setSaving(false); setMsg({ type: "err", text: friendlyError(res.err) }); return; }
      if (res.degraded) degraded = true;
      if (entryTotal(entry) !== null) saved++;
    }
    setSaving(false);
    setMsg({ type: "ok", text: `Results saved — ${saved} student(s) for ${subjects.find((x) => x.id === subjectId)?.name ?? "subject"}, ${term}, ${session}. Totals were calculated automatically (Test + Exam).${degraded ? degradedNote : ""}` });
  };

  const saveByStudent = async () => {
    const student = students.find((s) => s.id === studentId);
    setSaving(true); setMsg(null);
    let saved = 0;
    let degraded = false;
    for (const subj of effectiveSubjects) {
      const entry = studentEntries[subj.id] ?? EMPTY_ENTRY;
      const res = await upsertEntry(studentId, subj.id, entry);
      if (res.err) { setSaving(false); setMsg({ type: "err", text: friendlyError(res.err) }); return; }
      if (res.degraded) degraded = true;
      if (entryTotal(entry) !== null) saved++;
    }
    setSaving(false);
    setMsg({ type: "ok", text: `Results saved — ${saved} subject(s) for ${student ? fullName(student) : "student"}, ${term}, ${session}. Totals were calculated automatically (Test + Exam).${degraded ? degradedNote : ""}` });
  };

  const selectedStudent = students.find((s) => s.id === studentId);
  const subjectEntered = students.filter((s) => entryTotal(classEntries[s.id] ?? EMPTY_ENTRY) !== null).length;
  const studentTotals = effectiveSubjects
    .map((subj) => entryTotal(studentEntries[subj.id] ?? EMPTY_ENTRY))
    .filter((t): t is number => t !== null);
  const termAverage = studentTotals.length
    ? studentTotals.reduce((a, b) => a + b, 0) / studentTotals.length
    : null;

  const markInput =
    "w-20 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-center text-slate-900 outline-none focus:border-[#0a4da8] focus:ring-2 focus:ring-[#0a4da8]/20 transition";

  const modeBtn = (active: boolean) =>
    `rounded-md py-2 px-3 transition ${active ? "bg-white text-[#0a4da8] shadow-sm font-semibold" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <div>
      <PageHeader
        title="Input Results"
        subtitle="Enter the Test (CA) and Exam scores for each term — the system calculates the total, grade and remark"
      />
      <div className="space-y-4">
        <Banner msg={msg} />

        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm w-full sm:w-96">
              <button type="button" onClick={() => setMode("subject")} className={modeBtn(mode === "subject")}>
                By Subject (whole class)
              </button>
              <button type="button" onClick={() => setMode("student")} className={modeBtn(mode === "student")}>
                By Student (report card)
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Test (CA) is over <b>{TEST_MAX}</b> · Exam is over <b>{EXAM_MAX}</b> · <b>Total = Test + Exam</b> (over 100) — the total is what appears on the report card.
            </p>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#0a4da8] text-[#0a4da8] hover:bg-blue-50 px-4 py-2.5 text-sm font-medium transition"
            >
              <Upload className="w-4 h-4" /> Import Scores (CSV)
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Session">
              <select className={fieldCls} value={session} onChange={(e) => setSession(e.target.value)}>
                {sessionNames.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Term">
              <select className={fieldCls} value={term} onChange={(e) => setTerm(e.target.value)}>
                {TERMS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Class">
              <select className={fieldCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select class…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            {mode === "subject" ? (
              <Field label="Subject">
                <select className={fieldCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!classId}>
                  {subjects.length === 0 && <option value="">No subjects — add some first</option>}
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Student">
                <select className={fieldCls} value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!classId}>
                  {students.length === 0 && <option value="">No students in this class</option>}
                  {students.map((s) => <option key={s.id} value={s.id}>{fullName(s)} ({s.admission_no})</option>)}
                </select>
              </Field>
            )}
          </div>
        </Card>

        {/* ------------------------- By Subject ------------------------- */}
        {mode === "subject" && classId && subjectId && (
          <Card>
            <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-3">
              <h3 className="font-bold text-slate-900 mr-auto">
                {subjects.find((s) => s.id === subjectId)?.name} · {className(classes, classId)} · {term}
              </h3>
              <span className="text-xs text-slate-500">{subjectEntered} of {students.length} entered</span>
              <button onClick={saveBySubject} disabled={saving || loading} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                {saving ? <Spinner /> : <Save className="w-4 h-4" />} {saving ? "Saving…" : "Save Results"}
              </button>
            </div>
            {loading ? (
              <div className="py-12 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
            ) : students.length === 0 ? (
              <EmptyState text="No students in this class yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="py-3 px-5 font-semibold">Student</th>
                      <th className="py-3 px-5 font-semibold text-center">Test ({TEST_MAX})</th>
                      <th className="py-3 px-5 font-semibold text-center">Exam ({EXAM_MAX})</th>
                      <th className="py-3 px-5 font-semibold text-center">Total (100)</th>
                      <th className="py-3 px-5 font-semibold">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const entry = classEntries[s.id] ?? EMPTY_ENTRY;
                      const total = entryTotal(entry);
                      const g = total !== null ? gradeOf(total) : null;
                      return (
                        <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                          <td className="py-2.5 px-5">
                            <div className="flex items-center gap-3">
                              <Avatar name={fullName(s)} />
                              <div>
                                <p className="font-medium text-slate-800">{fullName(s)}</p>
                                <p className="text-xs text-slate-400">{s.admission_no}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-5 text-center">
                            <input
                              type="number" min={0} max={TEST_MAX} className={markInput} placeholder="—"
                              value={entry.test} aria-label={`Test score for ${fullName(s)}`}
                              onChange={(e) => setClassEntries((p) => ({ ...p, [s.id]: { ...(p[s.id] ?? EMPTY_ENTRY), test: e.target.value } }))}
                            />
                          </td>
                          <td className="py-2.5 px-5 text-center">
                            <input
                              type="number" min={0} max={EXAM_MAX} className={markInput} placeholder="—"
                              value={entry.exam} aria-label={`Exam score for ${fullName(s)}`}
                              onChange={(e) => setClassEntries((p) => ({ ...p, [s.id]: { ...(p[s.id] ?? EMPTY_ENTRY), exam: e.target.value } }))}
                            />
                          </td>
                          <td className="py-2.5 px-5 text-center">
                            <span className="inline-flex min-w-12 justify-center rounded-md bg-slate-100 px-2 py-1.5 font-bold text-slate-800">
                              {total !== null ? total : "—"}
                            </span>
                          </td>
                          <td className="py-2.5 px-5">
                            {g ? <span className={`font-bold ${g.color}`}>{g.grade} · <span className="font-medium">{g.remark}</span></span> : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* ------------------ By Student (report-card layout) ------------------ */}
        {mode === "student" && classId && (
          <Card>
            {selectedStudent && (
              <div className="px-5 pt-5">
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                  <Avatar name={fullName(selectedStudent)} className="h-11 w-11 text-sm" />
                  <div className="mr-auto min-w-0">
                    <p className="font-bold text-slate-900 truncate">{fullName(selectedStudent)}</p>
                    <p className="text-xs text-slate-500">{className(classes, classId)} · {selectedStudent.admission_no} · {term} · {session} Session</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Term Average</p>
                    <p className="font-extrabold text-[#0a4da8]">
                      {termAverage !== null ? `${termAverage.toFixed(1)}% · ${gradeOf(termAverage).grade}` : "—"}
                    </p>
                  </div>
                  <button onClick={saveByStudent} disabled={saving || loading} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                    {saving ? <Spinner /> : <Save className="w-4 h-4" />} {saving ? "Saving…" : "Save Results"}
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="py-12 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
            ) : !selectedStudent ? (
              <EmptyState text="No students in this class yet." />
            ) : effectiveSubjects.length === 0 ? (
              <EmptyState text="This class has no subjects yet. Add them on the Subjects page first." />
            ) : (
              <div className="p-5 overflow-x-auto">
                <table className="w-full text-sm min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-[#0a4da8] text-white text-left font-semibold px-3 py-2.5 rounded-tl-lg">Subject</th>
                      <th className="bg-[#0a4da8] text-white font-semibold px-3 py-2.5 text-center w-28">Test ({TEST_MAX})</th>
                      <th className="bg-[#0a4da8] text-white font-semibold px-3 py-2.5 text-center w-28">Exam ({EXAM_MAX})</th>
                      <th className="bg-[#0a4da8] text-white font-semibold px-3 py-2.5 text-center w-24">Total (100)</th>
                      <th className="bg-[#0a4da8] text-white font-semibold px-3 py-2.5 text-center w-20">Grade</th>
                      <th className="bg-[#0a4da8] text-white text-left font-semibold px-3 py-2.5 rounded-tr-lg w-32">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveSubjects.map((subj, i) => {
                      const entry = studentEntries[subj.id] ?? EMPTY_ENTRY;
                      const total = entryTotal(entry);
                      const g = total !== null ? gradeOf(total) : null;
                      return (
                        <tr key={subj.id} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                          <td className="border border-slate-200 px-3 py-2 font-medium text-slate-800">{subj.name}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center">
                            <input
                              type="number" min={0} max={TEST_MAX} className={markInput} placeholder="—"
                              value={entry.test} aria-label={`Test score for ${subj.name}`}
                              onChange={(e) => setStudentEntries((p) => ({ ...p, [subj.id]: { ...(p[subj.id] ?? EMPTY_ENTRY), test: e.target.value } }))}
                            />
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center">
                            <input
                              type="number" min={0} max={EXAM_MAX} className={markInput} placeholder="—"
                              value={entry.exam} aria-label={`Exam score for ${subj.name}`}
                              onChange={(e) => setStudentEntries((p) => ({ ...p, [subj.id]: { ...(p[subj.id] ?? EMPTY_ENTRY), exam: e.target.value } }))}
                            />
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-center font-bold text-slate-900">
                            {total !== null ? total : "—"}
                          </td>
                          <td className={`border border-slate-200 px-3 py-2 text-center font-bold ${g ? g.color : "text-slate-300"}`}>
                            {g ? g.grade : "—"}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-slate-600">
                            {g ? g.remark : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 font-semibold">
                      <td className="border border-slate-200 px-3 py-2.5 text-slate-800" colSpan={3}>
                        Term Average ({studentTotals.length} subject{studentTotals.length === 1 ? "" : "s"} entered)
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center text-[#0a4da8]" colSpan={3}>
                        {termAverage !== null ? `${termAverage.toFixed(1)}% — ${gradeOf(termAverage).grade} (${gradeOf(termAverage).remark})` : "Enter scores to see the average"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <p className="text-xs text-slate-400 mt-3">
                  This is the same layout as the report card. When all three terms are entered, open
                  <b> Report Cards</b> to see the combined totals, class position and printable card.
                </p>
              </div>
            )}
          </Card>
        )}
      </div>

      {showImport && (
        <ScoreImportModal
          profile={profile}
          session={session || currentSession}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

/* ------------------------- Traits & Comments editor ------------------------ */
function RatingPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? 0 : n)}
          className={`h-8 w-8 rounded-md text-sm font-semibold transition ${
            value === n ? "bg-[#0a4da8] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function TraitsScreen({ profile }: { profile: Profile }) {
  const { classes } = useClasses();
  const isTeacherOnly = profile.role === "teacher";
  const { sessionNames, currentSession } = useSessions();
  const [session, setSession] = useState("");
  useEffect(() => { if (!session && currentSession) setSession(currentSession); }, [currentSession, session]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState(() => sessionStorage.getItem("edana_traits_student") ?? "");
  const [affective, setAffective] = useState<Record<string, number>>({});
  const [psychomotor, setPsychomotor] = useState<Record<string, number>>({});
  const [teacherComment, setTeacherComment] = useState("");
  const [principalComment, setPrincipalComment] = useState("");
  const [termBegins, setTermBegins] = useState("");
  const [termEnds, setTermEnds] = useState("");
  const [nextTerm, setNextTerm] = useState("");
  const [daysOpened, setDaysOpened] = useState("");
  const [daysPresent, setDaysPresent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  useEffect(() => { sessionStorage.removeItem("edana_traits_student"); }, []);

  useEffect(() => {
    if (!classId) { setStudents([]); return; }
    fetchStudents(classId).then((list) => {
      const active = list.filter((s) => s.status === "active");
      setStudents(active);
      if (studentId && !active.some((s) => s.id === studentId)) setStudentId("");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // If arriving from a report card, pre-select the student's class
  useEffect(() => {
    if (!studentId || classId) return;
    supabase.from("students").select("class_id").eq("id", studentId).maybeSingle()
      .then(({ data }) => { if (data?.class_id) setClassId(data.class_id as string); });
  }, [studentId, classId]);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    supabase.from("reports").select("*").eq("student_id", studentId).eq("session", session).maybeSingle()
      .then(({ data }) => {
        const r = data as ReportMeta | null;
        setAffective(r?.affective ?? {});
        setPsychomotor(r?.psychomotor ?? {});
        setTeacherComment(r?.teacher_comment ?? "");
        setPrincipalComment(r?.principal_comment ?? "");
        setTermBegins(r?.term_begins ?? "");
        setTermEnds(r?.term_ends ?? "");
        setNextTerm(r?.next_term_begins ?? "");
        setDaysOpened(r?.days_opened != null ? String(r.days_opened) : "");
        setDaysPresent(r?.days_present != null ? String(r.days_present) : "");
        setLoading(false);
      });
  }, [studentId, session]);

  const save = async () => {
    if (!studentId) return;
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("reports").upsert({
      student_id: studentId,
      session,
      affective, psychomotor,
      teacher_comment: teacherComment,
      principal_comment: principalComment,
      term_begins: termBegins || null,
      term_ends: termEnds || null,
      next_term_begins: nextTerm || null,
      days_opened: daysOpened === "" ? null : Number(daysOpened),
      days_present: daysPresent === "" ? null : Number(daysPresent),
    }, { onConflict: "student_id,session" });
    setSaving(false);
    setMsg(error
      ? { type: "err", text: friendlyError(error.message) }
      : { type: "ok", text: "Traits, comments and term dates saved for this student." });
  };

  const traitGroup = (
    title: string,
    traits: string[],
    values: Record<string, number>,
    setValues: (v: Record<string, number>) => void
  ) => (
    <Card className="p-6">
      <h3 className="font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-xs text-slate-400 mb-4">1 Very Poor · 2 Poor · 3 Fair · 4 Good · 5 Excellent</p>
      <ul className="divide-y divide-slate-50">
        {traits.map((t) => (
          <li key={t} className="flex items-center gap-3 py-2">
            <span className="mr-auto text-sm text-slate-700">{t}</span>
            <RatingPicker value={values[t] ?? 0} onChange={(v) => setValues({ ...values, [t]: v })} />
          </li>
        ))}
      </ul>
    </Card>
  );

  return (
    <div>
      <PageHeader title="Affective & Psychomotor" subtitle="Rate behaviour and skills, add comments and term dates for the report card" />
      <div className="space-y-4">
        <Banner msg={msg} />
        <Card className="p-5">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Session">
              <select className={fieldCls} value={session} onChange={(e) => setSession(e.target.value)}>
                {sessionNames.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Class">
              <select className={fieldCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select class…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Student">
              <select className={fieldCls} value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!classId}>
                <option value="">Select student…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
              </select>
            </Field>
          </div>
        </Card>

        {studentId && (
          loading ? (
            <div className="py-12 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
          ) : (
            <>
              <div className="grid lg:grid-cols-2 gap-4 items-start">
                {traitGroup("Affective Traits", AFFECTIVE_TRAITS, affective, setAffective)}
                {traitGroup("Psychomotor Skills", PSYCHOMOTOR_SKILLS, psychomotor, setPsychomotor)}
              </div>

              <Card className="p-6 space-y-4">
                <h3 className="font-bold text-slate-900">Comments & Term Information</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Class Teacher's Comment">
                    <textarea className={fieldCls} rows={3} value={teacherComment} onChange={(e) => setTeacherComment(e.target.value)} placeholder="e.g. Ayomikunsi is always outstanding because of her curiosity and dedication." />
                  </Field>
                  <Field label="Principal's Comment" hint={isTeacherOnly ? "Only the Admin/Principal edits this." : undefined}>
                    <textarea className={fieldCls} rows={3} value={principalComment} onChange={(e) => setPrincipalComment(e.target.value)} disabled={isTeacherOnly} placeholder="e.g. Outstanding work. Keep soaring higher." />
                  </Field>
                  <Field label="Term Begins"><input type="date" className={fieldCls} value={termBegins} onChange={(e) => setTermBegins(e.target.value)} /></Field>
                  <Field label="Term Ends"><input type="date" className={fieldCls} value={termEnds} onChange={(e) => setTermEnds(e.target.value)} /></Field>
                  <Field label="Next Term Begins"><input type="date" className={fieldCls} value={nextTerm} onChange={(e) => setNextTerm(e.target.value)} /></Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Days Opened"><input type="number" min={0} className={fieldCls} value={daysOpened} onChange={(e) => setDaysOpened(e.target.value)} /></Field>
                    <Field label="Days Present"><input type="number" min={0} className={fieldCls} value={daysPresent} onChange={(e) => setDaysPresent(e.target.value)} /></Field>
                  </div>
                </div>
                <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-5 py-2.5 text-sm font-medium">
                  {saving ? <Spinner /> : <Save className="w-4 h-4" />} {saving ? "Saving…" : "Save Traits & Comments"}
                </button>
              </Card>
            </>
          )
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Report Card ------------------------------- */
export interface SubjectRow {
  name: string;
  t1: number | null; t2: number | null; t3: number | null;
  total: number; average: number; hasScore: boolean;
}

export function ReportCardView({
  student, classLabel, session, rows, overall, position, classSize, report, signatureUrl,
  termFocus = TERMS[2], includedTerms = [...TERMS],
}: {
  student: Student;
  classLabel: string;
  session: string;
  rows: SubjectRow[];
  overall: number | null;
  position: number | null;
  classSize: number | null;
  report: ReportMeta | null;
  signatureUrl?: string | null;
  termFocus?: string;
  includedTerms?: string[];
}) {
  const avgGrade = overall !== null ? gradeOf(overall) : null;
  const cell = "border border-slate-300 px-2 py-1.5";
  const th = "border border-[#0a4da8] px-2 py-2 bg-[#0a4da8] text-white font-semibold";
  const [stamp] = useState(() => Date.now());
  const passportUrl = student.passport_path ? passportPublicUrl(student.passport_path, stamp) : null;
  const initials = fullName(student)
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const traitTable = (title: string, traits: string[], values: Record<string, number> | undefined) => (
    <div className="flex-1 min-w-[260px]">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr>
            <th className={th + " text-left"}>{title}</th>
            {[1, 2, 3, 4, 5].map((n) => <th key={n} className={th + " w-8 text-center"}>{n}</th>)}
          </tr>
        </thead>
        <tbody>
          {traits.map((t) => (
            <tr key={t}>
              <td className={cell}>{t}</td>
              {[1, 2, 3, 4, 5].map((n) => (
                <td key={n} className={cell + " text-center text-[#0a4da8] font-bold"}>
                  {values?.[t] === n ? "✓" : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div id="report-print" className="bg-white text-slate-800 mx-auto max-w-4xl border border-slate-300 shadow-sm p-5 sm:p-8 text-[13px]">
      {/* School header — passport photo at the top-left corner */}
      <div className="border-b-2 border-[#0a4da8] pb-4 flex items-start gap-3">
        <div className="shrink-0">
          {passportUrl ? (
            <img
              src={passportUrl}
              alt={`${fullName(student)} — passport`}
              className="w-[92px] h-[112px] object-cover border-2 border-[#0a4da8] rounded-md"
            />
          ) : (
            <div className="w-[92px] h-[112px] border-2 border-dashed border-slate-300 rounded-md flex flex-col items-center justify-center gap-1 text-slate-400">
              <span className="text-xl font-bold">{initials || "—"}</span>
              <span className="text-[9px] tracking-[0.2em]">PASSPORT</span>
            </div>
          )}
        </div>
        <div className="flex-1 text-center">
          <div className="flex justify-center"><Logo size="w-16 h-16" /></div>
          <h1 className="text-2xl font-extrabold tracking-wide text-[#0a4da8] mt-1">EDANA SCHOOLS</h1>
          <p className="text-xs tracking-[0.25em] uppercase text-slate-500">Raising to Greatness</p>
          <p className="mt-2 inline-block bg-[#0a4da8] text-white text-xs font-bold tracking-widest px-4 py-1 rounded-full">
            {termFocus === TERMS[2]
              ? `CUMULATIVE REPORT CARD · ${session} SESSION`
              : `${termFocus.toUpperCase()} REPORT CARD · ${session} SESSION`}
          </p>
        </div>
        <div className="w-[92px] shrink-0 hidden sm:block" aria-hidden="true" />
      </div>

      {/* Info row */}
      <div className="grid md:grid-cols-3 gap-3 mt-4">
        <table className="w-full text-[12px] border-collapse">
          <tbody>
            <tr><td className={cell + " bg-slate-50 font-semibold w-28"}>Name</td><td className={cell + " font-bold"}>{fullName(student)}</td></tr>
            <tr><td className={cell + " bg-slate-50 font-semibold"}>Class</td><td className={cell}>{classLabel}</td></tr>
            <tr><td className={cell + " bg-slate-50 font-semibold"}>Admission No.</td><td className={cell}>{student.admission_no}</td></tr>
          </tbody>
        </table>

        <div>
          <p className="text-center text-[11px] font-bold tracking-widest text-[#0a4da8] border border-b-0 border-slate-300 bg-slate-50 py-1">TERMINAL DURATION</p>
          <table className="w-full text-[12px] border-collapse text-center">
            <thead>
              <tr>
                <th className={cell + " bg-slate-50 font-semibold"}>Term Begins</th>
                <th className={cell + " bg-slate-50 font-semibold"}>Term Ends</th>
                <th className={cell + " bg-slate-50 font-semibold"}>Next Term Begins</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={cell}>{formatDate(report?.term_begins)}</td>
                <td className={cell}>{formatDate(report?.term_ends)}</td>
                <td className={cell}>{formatDate(report?.next_term_begins)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <table className="w-full text-[12px] border-collapse">
          <tbody>
            <tr><td className={cell + " bg-slate-50 font-semibold"}>Average Percentage</td><td className={cell + " text-right font-extrabold text-[#0a4da8] text-sm"}>{overall !== null ? overall.toFixed(1) + "%" : "—"}</td></tr>
            <tr><td className={cell + " bg-slate-50 font-semibold"}>Average Grade</td><td className={cell + " text-right font-extrabold"}>{avgGrade?.grade ?? "—"}</td></tr>
            <tr><td className={cell + " bg-slate-50 font-semibold"}>No. in Class</td><td className={cell + " text-right font-bold"}>{classSize ?? "—"}</td></tr>
            <tr><td className={cell + " bg-slate-50 font-semibold"}>Position</td><td className={cell + " text-right font-extrabold text-[#0a4da8]"}>{position !== null ? ordinal(position) : "—"}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Academic performance */}
      <p className="text-center text-[11px] font-bold tracking-[0.25em] text-[#0a4da8] mt-6 mb-2">ACADEMIC PERFORMANCE</p>
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr>
            <th className={th + " text-left"}>Subject</th>
            {includedTerms.map((t) => (
              <th key={t} className={th + " w-16 text-center"}>{t}</th>
            ))}
            {includedTerms.length > 1 && <th className={th + " w-14 text-center"}>Total</th>}
            {includedTerms.length > 1 && <th className={th + " w-16 text-center"}>Average</th>}
            <th className={th + " w-14 text-center"}>Grade</th>
            <th className={th + " w-24 text-left"}>Remark</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={includedTerms.length + 3 + (includedTerms.length > 1 ? 2 : 0)} className={cell + " text-center text-slate-400 py-4"}>No results recorded yet for this session.</td></tr>
          )}
          {rows.map((r, i) => {
            const g = gradeOf(r.average);
            const termValue = (t: string) => (t === TERMS[0] ? r.t1 : t === TERMS[1] ? r.t2 : r.t3);
            return (
              <tr key={r.name} className={i % 2 ? "bg-slate-50" : ""}>
                <td className={cell}>{r.name}</td>
                {includedTerms.map((t) => (
                  <td key={t} className={cell + " text-center"}>{termValue(t) ?? "—"}</td>
                ))}
                {includedTerms.length > 1 && (
                  <td className={cell + " text-center font-semibold"}>{r.hasScore ? r.total : "—"}</td>
                )}
                {includedTerms.length > 1 && (
                  <td className={cell + " text-center font-semibold"}>{r.hasScore ? Math.round(r.average) : "—"}</td>
                )}
                <td className={cell + ` text-center font-bold ${g.color}`}>{r.hasScore ? g.grade : "—"}</td>
                <td className={cell}>{r.hasScore ? g.remark : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Keys to grade rating */}
      <p className="text-center text-[11px] font-bold tracking-[0.25em] text-[#0a4da8] mt-5 mb-2">KEYS TO GRADE RATING</p>
      <div className="grid grid-cols-4 sm:grid-cols-7 border border-slate-300 divide-x divide-slate-300 text-center">
        {GRADE_SCALE.map((g) => (
          <div key={g.grade} className="py-2 px-1">
            <p className={`font-extrabold ${g.color}`}>{g.grade}</p>
            <p className="text-[11px] text-slate-500">{g.grade === "A+" ? "100–95" : g.grade === "A" ? "94–85" : g.grade === "B" ? "84–75" : g.grade === "C" ? "74–60" : g.grade === "D" ? "59–50" : g.grade === "E" ? "49–40" : "39–0"}</p>
            <p className="text-[10px] text-slate-400">{g.remark}</p>
          </div>
        ))}
      </div>

      {/* Traits */}
      <div className="flex flex-wrap gap-4 mt-5">
        {traitTable("AFFECTIVE TRAITS", AFFECTIVE_TRAITS, report?.affective)}
        <div className="flex-1 min-w-[260px]">
          {traitTable("PSYCHOMOTOR SKILLS", PSYCHOMOTOR_SKILLS, report?.psychomotor)}
          <div className="mt-3">
            <p className="text-[11px] font-bold tracking-widest text-[#0a4da8] border border-b-0 border-slate-300 bg-slate-50 px-2 py-1">KEYS TO RATING</p>
            <table className="w-full text-[12px] border-collapse">
              <tbody>
                {RATING_KEYS.map((k) => (
                  <tr key={k.value}>
                    <td className={cell + " w-10 text-center font-bold"}>{k.value}</td>
                    <td className={cell}>{k.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="mt-5 space-y-2">
        <p className="text-[12px]"><span className="font-bold text-[#0a4da8]">Class Teacher's Comment:</span> {report?.teacher_comment || "—"}</p>
        <p className="text-[12px]"><span className="font-bold text-[#0a4da8]">Principal's Comment:</span> {report?.principal_comment || "—"}</p>
      </div>

      {/* Footer */}
      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <div className="text-center">
          {signatureUrl ? (
            <img src={signatureUrl} alt="Proprietor's signature" className="h-12 max-w-44 mx-auto object-contain" />
          ) : (
            <div className="h-12" />
          )}
          <div className="w-40 border-b border-slate-400 mb-1" />
          <p className="text-[11px] text-slate-500">Principal's Signature</p>
        </div>
        <p className="text-[12px] text-slate-600">Next Resumption: <b>{formatDate(report?.next_term_begins)}</b></p>
      </div>
    </div>
  );
}

/* ---------------------------- Report Cards screen -------------------------- */
export function ReportCardsScreen({ profile, go }: { profile: Profile; go: (p: PageKey) => void }) {
  const { classes } = useClasses();
  const staff = isStaffRole(profile.role);
  const { sessionNames, currentSession } = useSessions();
  const [session, setSession] = useState("");
  useEffect(() => { if (!session && currentSession) setSession(currentSession); }, [currentSession, session]);
  /** Which term's card to generate. 3rd Term = cumulative (includes 1st & 2nd term scores). */
  const [termFocus, setTermFocus] = useState<string>(TERMS[2]);
  const includedTerms: string[] =
    termFocus === TERMS[0] ? [TERMS[0]] : termFocus === TERMS[1] ? [TERMS[0], TERMS[1]] : [...TERMS];
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [rows, setRows] = useState<SubjectRow[]>([]);
  const [overall, setOverall] = useState<number | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [report, setReport] = useState<ReportMeta | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  useEffect(() => { fetchSignatureUrl().then(setSignatureUrl); }, []);

  // Arriving from the demo card / student list: open that student's card directly
  useEffect(() => {
    const preselectTerm = sessionStorage.getItem("edana_report_term");
    if (preselectTerm && (TERMS as readonly string[]).includes(preselectTerm)) {
      setTermFocus(preselectTerm);
    }
    sessionStorage.removeItem("edana_report_term");
    const preselectId = sessionStorage.getItem("edana_report_student");
    if (!preselectId) return;
    sessionStorage.removeItem("edana_report_student");
    supabase.from("students").select("*").eq("id", preselectId).maybeSingle()
      .then(({ data }) => { if (data) setSelected(data as Student); });
  }, []);

  // Parent: children instead of class picker
  useEffect(() => {
    if (profile.role === "parent") {
      fetchMyChildren(profile.id).then((kids) => {
        setStudents(kids);
        if (kids[0]) setSelected(kids[0]);
      });
    }
  }, [profile]);

  useEffect(() => {
    if (!staff || !classId) return;
    fetchStudents(classId).then((list) => setStudents(list.filter((s) => s.status === "active")));
  }, [staff, classId]);

  useEffect(() => {
    if (!selected) return;
    setLoadingCard(true);
    (async () => {
      const studentClassId = selected.class_id;
      const subjects = studentClassId ? await fetchSubjects(studentClassId) : [];
      const { data: enrol } = await supabase.from("student_subjects").select("subject_id").eq("student_id", selected.id);
      const enrolledIds = new Set(((enrol ?? []) as { subject_id: string }[]).map((e) => e.subject_id));
      const effective = enrolledIds.size > 0 ? subjects.filter((s) => enrolledIds.has(s.id)) : subjects;

      const { data: myResults } = await supabase
        .from("results").select("*")
        .eq("student_id", selected.id).eq("session", session);
      const mine = (myResults ?? []) as ResultRow[];

      const subjectRows: SubjectRow[] = effective.map((subj) => {
        const forSubj = mine.filter((r) => r.subject_id === subj.id);
        const get = (t: string) => {
          const found = forSubj.find((r) => r.term === t);
          return found ? Number(found.score) : null;
        };
        const t1 = get(TERMS[0]); const t2 = get(TERMS[1]); const t3 = get(TERMS[2]);
        const byTerm: Record<string, number | null> = { [TERMS[0]]: t1, [TERMS[1]]: t2, [TERMS[2]]: t3 };
        const present = includedTerms
          .map((t) => byTerm[t])
          .filter((v): v is number => v !== null);
        const total = present.reduce((a, b) => a + b, 0);
        return {
          name: subj.name, t1, t2, t3,
          total, average: present.length ? total / present.length : 0,
          hasScore: present.length > 0,
        };
      });
      setRows(subjectRows);
      setOverall(overallAverage(mine.filter((r) => includedTerms.includes(r.term))));

      // Position within class (staff can see all classmates' results)
      if (staff && studentClassId) {
        const classmates = await fetchStudents(studentClassId);
        const ids = classmates.map((c) => c.id);
        const { data: classResults } = await supabase
          .from("results").select("student_id, subject_id, score, term")
          .in("student_id", ids).eq("session", session);
        const byStudent = new Map<string, { subject_id: string; score: number }[]>();
        ((classResults ?? []) as { student_id: string; subject_id: string; score: number; term: string }[])
          .filter((r) => includedTerms.includes(r.term))
          .forEach((r) => {
            const arr = byStudent.get(r.student_id) ?? [];
            arr.push(r); byStudent.set(r.student_id, arr);
          });
        const averages = new Map<string, number>();
        byStudent.forEach((rs, sid) => {
          const avg = overallAverage(rs);
          if (avg !== null) averages.set(sid, avg);
        });
        const ranks = rankMap(averages);
        setPosition(ranks.get(selected.id) ?? null);
      } else {
        setPosition(null);
      }

      const { data: rep } = await supabase
        .from("reports").select("*")
        .eq("student_id", selected.id).eq("session", session).maybeSingle();
      setReport((rep as ReportMeta) ?? null);
      setLoadingCard(false);
    })();
  }, [selected, session, staff, termFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-5 print:hidden">
          <button onClick={() => setSelected(null)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="font-semibold text-slate-800 mr-auto">{fullName(selected)} — {className(classes, selected.class_id)}</span>
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#0a4da8]"
            value={termFocus}
            onChange={(e) => setTermFocus(e.target.value)}
            aria-label="Report type"
          >
            {TERMS.map((t) => (
              <option key={t} value={t}>{t === TERMS[2] ? "3rd Term (Cumulative)" : `${t} Report`}</option>
            ))}
          </select>
          {staff && (
            <button
              onClick={() => { sessionStorage.setItem("edana_traits_student", selected.id); go("traits"); }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="w-4 h-4" /> Edit Traits & Comments
            </button>
          )}
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] text-white rounded-lg px-4 py-2.5 text-sm font-medium">
            <Printer className="w-4 h-4" /> Print Report Card
          </button>
        </div>
        {loadingCard ? (
          <div className="py-16 flex justify-center text-[#0a4da8]"><Spinner className="w-7 h-7" /></div>
        ) : (
          <ReportCardView
            student={selected}
            classLabel={className(classes, selected.class_id)}
            session={session}
            rows={rows}
            overall={overall}
            position={position}
            classSize={staff ? students.length || null : null}
            report={report}
            signatureUrl={signatureUrl}
            termFocus={termFocus}
            includedTerms={includedTerms}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Report Cards" subtitle={staff ? "Select a student to view and print their terminal report card" : "Your children's terminal report cards"} />
      <div className="space-y-4">
        <Card className="p-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl">
            <Field label="Session">
              <select className={fieldCls} value={session} onChange={(e) => setSession(e.target.value)}>
                {sessionNames.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Report Type">
              <select className={fieldCls} value={termFocus} onChange={(e) => setTermFocus(e.target.value)}>
                {TERMS.map((t) => (
                  <option key={t} value={t}>{t === TERMS[2] ? "3rd Term (Cumulative — all terms)" : `${t} Report`}</option>
                ))}
              </select>
            </Field>
            {staff && (
              <Field label="Class">
                <select className={fieldCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">Select class…</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            The <b>3rd Term (Cumulative)</b> report card includes the 1st and 2nd term scores with totals,
            averages and class position — as in your school's format.
          </p>
        </Card>

        {staff && !classId ? (
          <Card><EmptyState text="Choose a class to see its students." /></Card>
        ) : students.length === 0 ? (
          <Card><EmptyState text={profile.role === "parent" ? "No children are linked to your account yet. Please contact the school office." : "No students in this class yet."} /></Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {students.map((s) => (
              <button key={s.id} onClick={() => setSelected(s)} className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-[#0a4da8]/40 hover:shadow transition">
                <div className="flex items-center gap-3">
                  <Avatar name={fullName(s)} className="h-11 w-11 text-sm" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{fullName(s)}</p>
                    <p className="text-xs text-slate-500">{className(classes, s.class_id)} · {s.admission_no}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs font-medium text-[#0a4da8] flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> View {termFocus} Report · {session}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
