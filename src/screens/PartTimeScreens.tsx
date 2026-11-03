import { useEffect, useState } from "react";
import { BookOpen, Save, Eye, Users } from "lucide-react";
import { supabase } from "../supabase";
import type { Profile, Student, Subject, ResultRow } from "../types";
import {
  TERMS, SESSIONS, CURRENT_SESSION, TEST_MAX, EXAM_MAX,
  gradeOf, splitScore, fullName,
} from "../lib/school";
import { useClasses, className, fetchStudents, saveResultRows } from "../lib/data";
import {
  PageHeader, Card, Banner, Spinner, Field, fieldCls,
  Avatar, EmptyState, Modal, friendlyError,
} from "../components/ui";

interface ScoreEntry { test: string; exam: string; }
const EMPTY_ENTRY: ScoreEntry = { test: "", exam: "" };

function entryFromRow(r?: ResultRow): ScoreEntry {
  if (!r) return { ...EMPTY_ENTRY };
  if (r.test_score != null && r.exam_score != null) {
    return { test: String(r.test_score), exam: String(r.exam_score) };
  }
  const parts = splitScore(Number(r.score));
  return { test: String(parts.test), exam: String(parts.exam) };
}

function clampMark(value: string, max: number): number {
  const n = Number(value);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

function entryTotal(e: ScoreEntry): number | null {
  if (e.test.trim() === "" && e.exam.trim() === "") return null;
  return clampMark(e.test, TEST_MAX) + clampMark(e.exam, EXAM_MAX);
}

interface MySubject extends Subject {
  studentCount: number;
}

/**
 * Part-time staff workspace: they only see students offering THEIR subject,
 * and can enter Test/Exam scores for those students.
 */
export function PartTimeSubjectsScreen({ profile }: { profile: Profile }) {
  const { classes } = useClasses();
  const [mySubjects, setMySubjects] = useState<MySubject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [session, setSession] = useState(CURRENT_SESSION);
  const [term, setTerm] = useState<string>(TERMS[0]);
  const [roster, setRoster] = useState<Student[]>([]);
  const [entries, setEntries] = useState<Record<string, ScoreEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const [viewing, setViewing] = useState<Student | null>(null);

  // Load the subjects assigned to this part-time staff member
  useEffect(() => {
    (async () => {
      const { data: links } = await supabase
        .from("staff_subjects")
        .select("subject_id")
        .eq("profile_id", profile.id);
      const ids = ((links ?? []) as { subject_id: string }[]).map((l) => l.subject_id);
      if (ids.length === 0) { setMySubjects([]); setLoading(false); return; }
      const { data: subs } = await supabase.from("subjects").select("*").in("id", ids);
      const subjects = ((subs ?? []) as Subject[]).sort((a, b) => a.name.localeCompare(b.name));

      const withCounts: MySubject[] = [];
      for (const subj of subjects) {
        const students = await studentsOffering(subj);
        withCounts.push({ ...subj, studentCount: students.length });
      }
      setMySubjects(withCounts);
      setSubjectId((prev) => (withCounts.some((s) => s.id === prev) ? prev : withCounts[0]?.id ?? ""));
      setLoading(false);
    })();
  }, [profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Students offering a subject: enrolled students if enrolments exist, else the whole class. */
  async function studentsOffering(subj: Subject): Promise<Student[]> {
    const classStudents = (await fetchStudents(subj.class_id)).filter((s) => s.status === "active");
    const { data } = await supabase
      .from("student_subjects")
      .select("student_id")
      .eq("subject_id", subj.id);
    const enrolledIds = new Set(((data ?? []) as { student_id: string }[]).map((e) => e.student_id));
    if (enrolledIds.size === 0) return classStudents;
    return classStudents.filter((s) => enrolledIds.has(s.id));
  }

  const selectedSubject = mySubjects.find((s) => s.id === subjectId);

  // Load roster + saved scores for the selected subject/term
  useEffect(() => {
    if (!selectedSubject) { setRoster([]); return; }
    setLoading(true);
    (async () => {
      const students = await studentsOffering(selectedSubject);
      setRoster(students);
      if (students.length === 0) { setEntries({}); setLoading(false); return; }
      const { data } = await supabase.from("results").select("*")
        .eq("subject_id", selectedSubject.id).eq("term", term).eq("session", session)
        .in("student_id", students.map((s) => s.id));
      const map: Record<string, ScoreEntry> = {};
      ((data ?? []) as ResultRow[]).forEach((r) => { map[r.student_id] = entryFromRow(r); });
      setEntries(map);
      setLoading(false);
    })();
  }, [subjectId, term, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!selectedSubject) return;
    setSaving(true); setMsg(null);
    let saved = 0;
    let degraded = false;
    for (const s of roster) {
      const entry = entries[s.id] ?? EMPTY_ENTRY;
      const total = entryTotal(entry);
      if (total === null) {
        const { error } = await supabase.from("results").delete()
          .eq("student_id", s.id).eq("subject_id", selectedSubject.id).eq("term", term).eq("session", session);
        if (error) { setSaving(false); setMsg({ type: "err", text: friendlyError(error.message) }); return; }
        continue;
      }
      const test = clampMark(entry.test, TEST_MAX);
      const exam = clampMark(entry.exam, EXAM_MAX);
      const res = await saveResultRows([{
        student_id: s.id, subject_id: selectedSubject.id, term, session,
        test_score: test, exam_score: exam, score: test + exam, entered_by: profile.id,
      }]);
      if (res.error) { setSaving(false); setMsg({ type: "err", text: friendlyError(res.error) }); return; }
      if (res.degraded) degraded = true;
      saved++;
    }
    setSaving(false);
    setMsg({
      type: "ok",
      text: `Scores saved — ${saved} student(s) in ${selectedSubject.name}, ${term}, ${session}. The class teacher can now see these scores.${degraded ? " (Saved as totals only until the latest database update is run.)" : ""}`,
    });
  };

  const markInput =
    "w-20 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-center text-slate-900 outline-none focus:border-[#0a4da8] focus:ring-2 focus:ring-[#0a4da8]/20 transition";

  const enteredCount = roster.filter((s) => entryTotal(entries[s.id] ?? EMPTY_ENTRY) !== null).length;

  return (
    <div>
      <PageHeader
        title="My Subjects & Results"
        subtitle="You only see students offering your subject(s). Enter their Test and Exam scores — totals are calculated automatically."
      />
      <div className="space-y-4">
        <Banner msg={msg} />

        {loading && mySubjects.length === 0 ? (
          <div className="py-14 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
        ) : mySubjects.length === 0 ? (
          <Card className="p-8 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <BookOpen className="w-6 h-6" />
            </span>
            <h3 className="font-bold text-slate-900 mt-4">No subject assigned to you yet</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
              Please ask the Admin or Super Admin to assign your subject to you
              (Teachers page → Part-Time Staff). Once assigned, the students offering
              your subject will appear here.
            </p>
          </Card>
        ) : (
          <>
            {/* Subject picker */}
            <div className="flex flex-wrap gap-2">
              {mySubjects.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSubjectId(s.id)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    s.id === subjectId
                      ? "bg-[#0a4da8] border-[#0a4da8] text-white shadow-sm"
                      : "bg-white border-slate-200 text-slate-700 hover:border-[#0a4da8]/40"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold text-sm">
                    <BookOpen className="w-4 h-4" /> {s.name}
                  </span>
                  <span className={`text-xs ${s.id === subjectId ? "text-blue-100" : "text-slate-400"}`}>
                    {className(classes, s.class_id)} · {s.studentCount} student{s.studentCount === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </div>

            <Card className="p-5">
              <div className="grid sm:grid-cols-3 gap-4 max-w-2xl">
                <Field label="Session">
                  <select className={fieldCls} value={session} onChange={(e) => setSession(e.target.value)}>
                    {SESSIONS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Term">
                  <select className={fieldCls} value={term} onChange={(e) => setTerm(e.target.value)}>
                    {TERMS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Subject">
                  <select className={fieldCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                    {mySubjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} — {className(classes, s.class_id)}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Test (CA) is over <b>{TEST_MAX}</b> · Exam is over <b>{EXAM_MAX}</b> · <b>Total = Test + Exam</b> (over 100).
              </p>
            </Card>

            <Card>
              <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-3">
                <h3 className="font-bold text-slate-900 mr-auto flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#0a4da8]" />
                  {selectedSubject?.name} · {selectedSubject ? className(classes, selectedSubject.class_id) : ""} · {term}
                </h3>
                <span className="text-xs text-slate-500">{enteredCount} of {roster.length} entered</span>
                <button onClick={save} disabled={saving || loading} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                  {saving ? <Spinner /> : <Save className="w-4 h-4" />} {saving ? "Saving…" : "Save Scores"}
                </button>
              </div>
              {loading ? (
                <div className="py-12 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
              ) : roster.length === 0 ? (
                <EmptyState text="No students are offering this subject yet." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[660px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="py-3 px-5 font-semibold">Student</th>
                        <th className="py-3 px-5 font-semibold text-center">Test ({TEST_MAX})</th>
                        <th className="py-3 px-5 font-semibold text-center">Exam ({EXAM_MAX})</th>
                        <th className="py-3 px-5 font-semibold text-center">Total (100)</th>
                        <th className="py-3 px-5 font-semibold">Grade</th>
                        <th className="py-3 px-5 font-semibold text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((s) => {
                        const entry = entries[s.id] ?? EMPTY_ENTRY;
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
                                onChange={(e) => setEntries((p) => ({ ...p, [s.id]: { ...(p[s.id] ?? EMPTY_ENTRY), test: e.target.value } }))}
                              />
                            </td>
                            <td className="py-2.5 px-5 text-center">
                              <input
                                type="number" min={0} max={EXAM_MAX} className={markInput} placeholder="—"
                                value={entry.exam} aria-label={`Exam score for ${fullName(s)}`}
                                onChange={(e) => setEntries((p) => ({ ...p, [s.id]: { ...(p[s.id] ?? EMPTY_ENTRY), exam: e.target.value } }))}
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
                            <td className="py-2.5 px-5 text-right">
                              <button onClick={() => setViewing(s)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-[#0a4da8] hover:bg-blue-50" title="View student details">
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {viewing && (
        <Modal title="Student Details" onClose={() => setViewing(null)}>
          <div className="flex items-center gap-4 mb-5">
            <Avatar name={fullName(viewing)} className="h-14 w-14 text-base" />
            <div>
              <p className="font-bold text-slate-900 text-lg leading-tight">{fullName(viewing)}</p>
              <p className="text-sm text-slate-500">{selectedSubject ? className(classes, selectedSubject.class_id) : ""} · {viewing.admission_no}</p>
            </div>
          </div>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ["Subject", selectedSubject?.name ?? "—"],
              ["Gender", viewing.gender || "—"],
              ["Date of Birth", viewing.date_of_birth ? new Date(viewing.date_of_birth).toLocaleDateString() : "—"],
              ["Guardian", viewing.guardian_name || "—"],
              ["Guardian Phone", viewing.guardian_phone || "—"],
              ["Status", viewing.status],
            ].map(([k, v]) => (
              <div key={k} className="border-b border-slate-50 pb-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-slate-800 mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-slate-400 mt-5 leading-relaxed">
            As part-time staff, you can view and score only students offering your subject.
            The class teacher sees these scores in the class results and report cards.
          </p>
        </Modal>
      )}
    </div>
  );
}
