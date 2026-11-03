import { useEffect, useState, type FormEvent } from "react";
import { CalendarCheck, School, GraduationCap, Users, Megaphone, Plus, Trash2, Save, Link2, Unlink, Sparkles, BookOpen } from "lucide-react";
import { supabase } from "../supabase";
import type { Profile, Student, Notice, AttendanceRow, AttendanceStatus, Subject } from "../types";
import { fullName, formatDate } from "../lib/school";
import { useClasses, className, fetchStudents, fetchMyChildren, seedDefaultClasses } from "../lib/data";
import {
  PageHeader, Card, Banner, Spinner, Field, fieldCls,
  Avatar, EmptyState, friendlyError, RoleBadge,
} from "../components/ui";

const isAdminRole = (r: string) => r === "super_admin" || r === "admin";

/* ------------------------------- Attendance ------------------------------- */
export function AttendanceScreen({ profile }: { profile: Profile }) {
  const { classes } = useClasses();
  const isParent = profile.role === "parent";

  // staff state
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // parent state
  const [children, setChildren] = useState<Student[]>([]);
  const [childId, setChildId] = useState("");
  const [records, setRecords] = useState<AttendanceRow[]>([]);

  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  useEffect(() => {
    if (isParent) {
      fetchMyChildren(profile.id).then((kids) => {
        setChildren(kids);
        if (kids[0]) setChildId(kids[0].id);
      });
    }
  }, [isParent, profile.id]);

  useEffect(() => {
    if (isParent || !classId) return;
    setLoading(true);
    (async () => {
      const list = (await fetchStudents(classId)).filter((s) => s.status === "active");
      setStudents(list);
      const { data } = await supabase.from("attendance").select("*").eq("date", date).in("student_id", list.map((s) => s.id));
      const map: Record<string, AttendanceStatus> = {};
      ((data ?? []) as AttendanceRow[]).forEach((r) => { map[r.student_id] = r.status; });
      setMarks(map);
      setLoading(false);
    })();
  }, [isParent, classId, date]);

  useEffect(() => {
    if (!isParent || !childId) return;
    supabase.from("attendance").select("*").eq("student_id", childId)
      .order("date", { ascending: false }).limit(60)
      .then(({ data }) => setRecords((data ?? []) as AttendanceRow[]));
  }, [isParent, childId]);

  const save = async () => {
    setSaving(true); setMsg(null);
    const rows = Object.entries(marks).map(([student_id, status]) => ({
      student_id, date, status, marked_by: profile.id,
    }));
    if (rows.length === 0) { setSaving(false); setMsg({ type: "err", text: "Mark at least one student first." }); return; }
    const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,date" });
    setSaving(false);
    setMsg(error
      ? { type: "err", text: friendlyError(error.message) }
      : { type: "ok", text: `Attendance saved for ${formatDate(date)} — ${rows.length} student(s) marked.` });
  };

  const setAll = (status: AttendanceStatus) => {
    const map: Record<string, AttendanceStatus> = {};
    students.forEach((s) => { map[s.id] = status; });
    setMarks(map);
  };

  const statusBtn = (active: boolean, color: string) =>
    `px-3 py-1.5 rounded-md text-xs font-semibold border transition ${active ? color : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"}`;

  if (isParent) {
    const present = records.filter((r) => r.status === "present").length;
    const late = records.filter((r) => r.status === "late").length;
    const absent = records.filter((r) => r.status === "absent").length;
    const pct = records.length ? Math.round(((present + late) / records.length) * 100) : 0;
    return (
      <div>
        <PageHeader title="Attendance" subtitle="Your children's school attendance (view only)" />
        <div className="space-y-4">
          {children.length > 1 && (
            <Card className="p-5 max-w-md">
              <Field label="Child">
                <select className={fieldCls} value={childId} onChange={(e) => setChildId(e.target.value)}>
                  {children.map((c) => <option key={c.id} value={c.id}>{fullName(c)} — {className(classes, c.class_id)}</option>)}
                </select>
              </Field>
            </Card>
          )}
          {children.length === 0 ? (
            <Card><EmptyState text="No children are linked to your account yet. Please contact the school office." /></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Days Recorded", value: records.length, tint: "text-slate-900" },
                  { label: "Present", value: present, tint: "text-emerald-600" },
                  { label: "Late", value: late, tint: "text-amber-600" },
                  { label: "Absent", value: absent, tint: "text-red-600" },
                ].map((s) => (
                  <Card key={s.label} className="p-5">
                    <p className={`text-2xl font-bold ${s.tint}`}>{s.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                  </Card>
                ))}
              </div>
              <Card className="p-5">
                <p className="text-sm text-slate-600">Attendance rate: <b className="text-slate-900">{records.length ? pct + "%" : "—"}</b></p>
                <div className="h-2.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </Card>
              <Card>
                {records.length === 0 ? (
                  <EmptyState text="No attendance records yet." />
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {records.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                        <CalendarCheck className="w-4 h-4 text-slate-300" />
                        <span className="text-sm text-slate-700 mr-auto">{new Date(r.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</span>
                        <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 border ${
                          r.status === "present" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : r.status === "late" ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-red-50 text-red-700 border-red-200"}`}>
                          {r.status.toUpperCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Mark daily attendance for a class" />
      <div className="space-y-4">
        <Banner msg={msg} />
        <Card className="p-5">
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
            <Field label="Class">
              <select className={fieldCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select class…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" className={fieldCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        </Card>

        {classId && (
          <Card>
            <div className="flex flex-wrap items-center gap-2 px-5 pt-5 pb-3">
              <h3 className="font-bold text-slate-900 mr-auto">{className(classes, classId)} · {formatDate(date)}</h3>
              <button onClick={() => setAll("present")} className="text-xs font-medium text-[#0a4da8] hover:underline">Mark all present</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                {saving ? <Spinner /> : <Save className="w-4 h-4" />} {saving ? "Saving…" : "Save Attendance"}
              </button>
            </div>
            {loading ? (
              <div className="py-12 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
            ) : students.length === 0 ? (
              <EmptyState text="No students in this class." />
            ) : (
              <ul className="divide-y divide-slate-50">
                {students.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Avatar name={fullName(s)} />
                    <div className="mr-auto min-w-[140px]">
                      <p className="font-medium text-slate-800 text-sm">{fullName(s)}</p>
                      <p className="text-xs text-slate-400">{s.admission_no}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setMarks((m) => ({ ...m, [s.id]: "present" }))} className={statusBtn(marks[s.id] === "present", "bg-emerald-600 text-white border-emerald-600")}>Present</button>
                      <button onClick={() => setMarks((m) => ({ ...m, [s.id]: "late" }))} className={statusBtn(marks[s.id] === "late", "bg-amber-500 text-white border-amber-500")}>Late</button>
                      <button onClick={() => setMarks((m) => ({ ...m, [s.id]: "absent" }))} className={statusBtn(marks[s.id] === "absent", "bg-red-600 text-white border-red-600")}>Absent</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Classes --------------------------------- */
export function ClassesScreen() {
  const { classes, reload } = useClasses();
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [level, setLevel] = useState("Basic");
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const loadDefaults = async () => {
    setSeeding(true); setMsg(null);
    const { error } = await seedDefaultClasses();
    setSeeding(false);
    if (error) {
      setMsg({
        type: "err",
        text: friendlyError(error) + " If this says the table doesn't exist, run the one-time database setup script first (Supabase → SQL Editor).",
      });
    } else {
      setMsg({ type: "ok", text: "Classes loaded: Reception 1 to SS 3 are now active in all class dropdowns (Admit Student, Results, Attendance, and more)." });
      reload();
    }
  };

  useEffect(() => {
    supabase.from("profiles").select("*").eq("role", "teacher").order("full_name")
      .then(({ data }) => setTeachers((data ?? []) as Profile[]));
    supabase.from("students").select("class_id").eq("status", "active")
      .then(({ data }) => {
        const map: Record<string, number> = {};
        ((data ?? []) as { class_id: string | null }[]).forEach((r) => {
          if (r.class_id) map[r.class_id] = (map[r.class_id] ?? 0) + 1;
        });
        setCounts(map);
      });
  }, []);

  const addClass = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const nextOrder = classes.length ? Math.max(...classes.map((c) => c.sort_order)) + 1 : 1;
    const { error } = await supabase.from("classes").insert({ name: name.trim(), level, sort_order: nextOrder });
    setSaving(false);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else { setName(""); setMsg({ type: "ok", text: "Class added." }); reload(); }
  };

  const setTeacher = async (classId: string, teacherId: string) => {
    const { error } = await supabase.from("classes").update({ class_teacher_id: teacherId || null }).eq("id", classId);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else reload();
  };

  const remove = async (id: string, label: string) => {
    if (!window.confirm(`Delete class "${label}"? Subjects in the class will also be deleted. Students will become unassigned.`)) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else { setMsg({ type: "ok", text: "Class deleted." }); reload(); }
  };

  return (
    <div>
      <PageHeader
        title="Classes"
        subtitle="From Reception 1 to SS 3 — manage classes and class teachers"
        actions={
          <button
            onClick={loadDefaults}
            disabled={seeding}
            className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition"
          >
            {seeding ? <Spinner /> : <Sparkles className="w-4 h-4" />}
            {seeding ? "Loading Classes…" : "Load Reception 1 – SS 3 Classes"}
          </button>
        }
      />
      <div className="space-y-4">
        <Banner msg={msg} />
        {classes.length === 0 && (
          <Card className="p-6 border-amber-200 bg-amber-50/60">
            <h3 className="font-bold text-slate-900">No classes yet — that's why class dropdowns are empty</h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              Click the button below to add all 16 classes at once: Reception 1, Reception 2, Nursery 1–2,
              Basic 1–6, JSS 1–3 and SS 1–3. They'll immediately become active in Admit Student,
              Student Information, Results, Attendance, Report Cards and Fees. You can rename or remove
              any of them afterwards.
            </p>
            <button
              onClick={loadDefaults}
              disabled={seeding}
              className="mt-4 inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition"
            >
              {seeding ? <Spinner /> : <Sparkles className="w-4 h-4" />}
              {seeding ? "Loading Classes…" : "Add Reception 1 – SS 3 Classes"}
            </button>
          </Card>
        )}
        <Card className="p-5">
          <form onSubmit={addClass} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Field label="New Class Name"><input required className={fieldCls} placeholder="e.g. Basic 4" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            </div>
            <div className="w-48">
              <Field label="Level">
                <select className={fieldCls} value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option>Early Years</option><option>Basic</option><option>Junior Secondary</option><option>Senior Secondary</option>
                </select>
              </Field>
            </div>
            <button disabled={saving} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
              {saving ? <Spinner /> : <Plus className="w-4 h-4" />} Add Class
            </button>
          </form>
        </Card>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="py-3 px-5 font-semibold">Class</th>
                  <th className="py-3 px-5 font-semibold">Level</th>
                  <th className="py-3 px-5 font-semibold">Students</th>
                  <th className="py-3 px-5 font-semibold">Class Teacher</th>
                  <th className="py-3 px-5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="py-3 px-5 font-medium text-slate-800">
                      <span className="inline-flex items-center gap-2"><School className="w-4 h-4 text-slate-300" />{c.name}</span>
                    </td>
                    <td className="py-3 px-5 text-slate-500">{c.level}</td>
                    <td className="py-3 px-5 text-slate-600">{counts[c.id] ?? 0}</td>
                    <td className="py-3 px-5">
                      <select className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-[#0a4da8]" value={c.class_teacher_id ?? ""} onChange={(e) => setTeacher(c.id, e.target.value)}>
                        <option value="">Not assigned</option>
                        {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}
                      </select>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <button onClick={() => remove(c.id, c.name)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete class">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* --------------------- Part-time staff & their subjects -------------------- */
interface StaffSubjectRow { id: string; profile_id: string; subject_id: string; }

function PartTimeStaffSection() {
  const { classes } = useClasses();
  const [partTimers, setPartTimers] = useState<Profile[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [links, setLinks] = useState<StaffSubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const [sel, setSel] = useState<Record<string, { classId: string; subjectId: string }>>({});

  const load = async () => {
    const [{ data: pts }, { data: subs }, { data: ls }] = await Promise.all([
      supabase.from("profiles").select("*").eq("role", "part_time").order("full_name"),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("staff_subjects").select("*"),
    ]);
    setPartTimers((pts ?? []) as Profile[]);
    setAllSubjects((subs ?? []) as Subject[]);
    setLinks((ls ?? []) as StaffSubjectRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const subjectLabel = (subjectId: string) => {
    const s = allSubjects.find((x) => x.id === subjectId);
    return s ? `${s.name} — ${className(classes, s.class_id)}` : "Unknown subject";
  };

  const assign = async (profileId: string) => {
    const choice = sel[profileId];
    if (!choice?.subjectId) { setMsg({ type: "err", text: "Choose a class and a subject first." }); return; }
    const { error } = await supabase.from("staff_subjects").insert({ profile_id: profileId, subject_id: choice.subjectId });
    if (error) { setMsg({ type: "err", text: friendlyError(error.message) }); return; }
    setMsg({ type: "ok", text: "Subject assigned. That part-time staff member will now see the students offering it and can enter their Test/Exam scores." });
    load();
  };

  const unassign = async (linkId: string) => {
    const { error } = await supabase.from("staff_subjects").delete().eq("id", linkId);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else load();
  };

  return (
    <section>
      <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-1 mt-2">
        <BookOpen className="w-5 h-5 text-teal-700" /> Part-Time Staff & Their Subjects
      </h2>
      <p className="text-[13px] text-slate-500 mb-4 leading-relaxed">
        Part-time staff accounts are created by the Super Admin under User Accounts. Assign each person
        the subject they teach — they will only see students offering that subject, and can enter
        Test/Exam scores for them. Class teachers automatically see those scores in class results.
      </p>
      <div className="space-y-4">
        <Banner msg={msg} />
        {loading ? (
          <Card className="py-12 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></Card>
        ) : partTimers.length === 0 ? (
          <Card><EmptyState text="No part-time staff accounts yet. The Super Admin can create them under User Accounts (role: Part-Time Staff)." /></Card>
        ) : (
          partTimers.map((p) => {
            const mine = links.filter((l) => l.profile_id === p.id);
            const choice = sel[p.id] ?? { classId: "", subjectId: "" };
            const classSubjects = allSubjects.filter((s) => s.class_id === choice.classId);
            return (
              <Card key={p.id} className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={p.full_name} email={p.email} className="h-11 w-11 text-sm" />
                  <div className="mr-auto min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{p.full_name || "—"}</p>
                    <p className="text-xs text-slate-500 truncate">{p.email}</p>
                  </div>
                  <RoleBadge role="part_time" />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {mine.length === 0 && <span className="text-sm text-slate-400">No subject assigned yet.</span>}
                  {mine.map((l) => (
                    <span key={l.id} className="inline-flex items-center gap-2 rounded-full bg-teal-50 border border-teal-200 pl-3 pr-1.5 py-1 text-sm text-teal-800">
                      {subjectLabel(l.subject_id)}
                      <button onClick={() => unassign(l.id)} className="inline-flex items-center gap-1 rounded-full bg-white border border-teal-200 px-2 py-0.5 text-[11px] font-medium text-teal-700 hover:text-red-600 hover:border-red-200" title="Remove subject">
                        <Unlink className="w-3 h-3" /> Remove
                      </button>
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <select
                    className={fieldCls + " sm:w-52"}
                    value={choice.classId}
                    onChange={(e) => setSel((prev) => ({ ...prev, [p.id]: { classId: e.target.value, subjectId: "" } }))}
                  >
                    <option value="">Select class…</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select
                    className={fieldCls + " sm:w-64"}
                    value={choice.subjectId}
                    disabled={!choice.classId}
                    onChange={(e) => setSel((prev) => ({ ...prev, [p.id]: { classId: choice.classId, subjectId: e.target.value } }))}
                  >
                    <option value="">{choice.classId ? "Select subject…" : "Select a class first"}</option>
                    {classSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button onClick={() => assign(p.id)} disabled={!choice.subjectId} className="inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                    <Link2 className="w-4 h-4" /> Assign Subject
                  </button>
                </div>
                {choice.classId && classSubjects.length === 0 && (
                  <p className="text-xs text-amber-600 mt-2">That class has no subjects yet — add them on the Subjects page first.</p>
                )}
              </Card>
            );
          })
        )}
      </div>
    </section>
  );
}

/* --------------------------------- Teachers -------------------------------- */
export function TeachersScreen() {
  const { classes } = useClasses();
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("profiles").select("*").eq("role", "teacher").order("full_name")
      .then(({ data }) => { setTeachers((data ?? []) as Profile[]); setLoading(false); });
  }, []);

  const assignedClass = (teacherId: string) => classes.find((c) => c.class_teacher_id === teacherId)?.name;

  return (
    <div className="space-y-4">
      <div>
      <PageHeader title="Teachers" subtitle="Teaching staff, their classes, and part-time staff subjects" />
      <Card>
        <div className="px-5 pt-4">
          <p className="text-[13px] text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-blue-800">
            Teacher login accounts are created by the <b>Super Admin</b> under <b>User Accounts</b>. Assign each teacher a
            class from the <b>Classes</b> page.
          </p>
        </div>
        {loading ? (
          <div className="py-12 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
        ) : teachers.length === 0 ? (
          <EmptyState text="No teacher accounts yet. The Super Admin can create them under User Accounts." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="py-3 px-5 font-semibold">Teacher</th>
                  <th className="py-3 px-5 font-semibold">Email</th>
                  <th className="py-3 px-5 font-semibold">Class Teacher Of</th>
                  <th className="py-3 px-5 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.full_name} email={t.email} />
                        <span className="font-medium text-slate-800">{t.full_name || "—"}</span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-slate-600">{t.email}</td>
                    <td className="py-3 px-5">
                      {assignedClass(t.id)
                        ? <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5"><GraduationCap className="w-3.5 h-3.5" />{assignedClass(t.id)}</span>
                        : <span className="text-xs text-slate-400">Not assigned</span>}
                    </td>
                    <td className="py-3 px-5 text-slate-500">{formatDate(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>
      <PartTimeStaffSection />
    </div>
  );
}

/* --------------------------------- Parents --------------------------------- */
export function ParentsScreen({ profile }: { profile: Profile }) {
  /** Admins manage links; bursary sees parent information view-only */
  const canManage = isAdminRole(profile.role);
  const [parents, setParents] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});

  const load = async () => {
    const [{ data: p }, allStudents] = await Promise.all([
      supabase.from("profiles").select("*").eq("role", "parent").order("full_name"),
      fetchStudents(),
    ]);
    setParents((p ?? []) as Profile[]);
    setStudents(allStudents);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const childrenOf = (parentId: string) => students.filter((s) => s.parent_id === parentId);

  const link = async (parentId: string) => {
    const studentId = linkChoice[parentId];
    if (!studentId) return;
    const { error } = await supabase.from("students").update({ parent_id: parentId }).eq("id", studentId);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else { setMsg({ type: "ok", text: "Child linked. The parent can now view the child's report card, attendance and fees." }); load(); }
  };

  const unlink = async (student: Student) => {
    const { error } = await supabase.from("students").update({ parent_id: null }).eq("id", student.id);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else load();
  };

  return (
    <div>
      <PageHeader title="Parents" subtitle="Parent portal accounts and their linked children" />
      <div className="space-y-4">
        <Banner msg={msg} />
        <Card className="px-5 py-4">
          <p className="text-[13px] bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-blue-800">
            {canManage ? (
              <>Parent login accounts are created by the <b>Super Admin</b> under <b>User Accounts</b>. Link each parent to
              their children below — parents only ever see their own children.</>
            ) : (
              <>Parent information and their linked children (view only). Linking children to parents is done by the Admin.</>
            )}
          </p>
        </Card>
        {loading ? (
          <Card className="py-14 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></Card>
        ) : parents.length === 0 ? (
          <Card><EmptyState text="No parent accounts yet. The Super Admin can create them under User Accounts." /></Card>
        ) : (
          parents.map((p) => {
            const kids = childrenOf(p.id);
            const linkable = students.filter((s) => s.parent_id !== p.id);
            return (
              <Card key={p.id} className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={p.full_name} email={p.email} className="h-11 w-11 text-sm" />
                  <div className="mr-auto min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{p.full_name || "—"}</p>
                    <p className="text-xs text-slate-500 truncate">{p.email}</p>
                  </div>
                  <RoleBadge role="parent" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {kids.length === 0 && <span className="text-sm text-slate-400">No children linked yet.</span>}
                  {kids.map((k) => (
                    <span key={k.id} className="inline-flex items-center gap-2 rounded-full bg-slate-50 border border-slate-200 pl-3 pr-1.5 py-1 text-sm text-slate-700">
                      {fullName(k)}
                      {canManage && (
                        <button onClick={() => unlink(k)} className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-red-600 hover:border-red-200" title="Unlink child">
                          <Unlink className="w-3 h-3" /> Unlink
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {canManage && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <select className={fieldCls + " sm:w-80"} value={linkChoice[p.id] ?? ""} onChange={(e) => setLinkChoice((prev) => ({ ...prev, [p.id]: e.target.value }))}>
                      <option value="">Select a student to link…</option>
                      {linkable.map((s) => <option key={s.id} value={s.id}>{fullName(s)} ({s.admission_no})</option>)}
                    </select>
                    <button onClick={() => link(p.id)} disabled={!linkChoice[p.id]} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-60 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                      <Link2 className="w-4 h-4" /> Link Child
                    </button>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Notices --------------------------------- */
export function NoticesScreen({ profile }: { profile: Profile }) {
  const admin = isAdminRole(profile.role);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  const load = async () => {
    const { data } = await supabase.from("notices").select("*").order("created_at", { ascending: false });
    setNotices((data ?? []) as Notice[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const visible = notices.filter((n) =>
    n.audience === "all" ||
    (n.audience === "teachers" && ["super_admin", "admin", "teacher"].includes(profile.role)) ||
    (n.audience === "parents" && ["super_admin", "admin", "parent", "bursary"].includes(profile.role)) ||
    (n.audience === "students" && ["super_admin", "admin"].includes(profile.role)) ||
    admin
  );

  const post = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("notices").insert({ title: title.trim(), body: body.trim(), audience, created_by: profile.id });
    setSaving(false);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else { setTitle(""); setBody(""); setAudience("all"); setMsg({ type: "ok", text: "Notice posted." }); load(); }
  };

  const remove = async (n: Notice) => {
    if (!window.confirm(`Delete notice "${n.title}"?`)) return;
    const { error } = await supabase.from("notices").delete().eq("id", n.id);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else load();
  };

  const audienceLabel: Record<string, string> = { all: "Everyone", teachers: "Teachers", parents: "Parents", students: "Students" };

  return (
    <div>
      <PageHeader title="Notice Board" subtitle="Announcements for the school community" />
      <div className="space-y-4">
        <Banner msg={msg} />
        {admin && (
          <Card className="p-6 max-w-3xl">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Megaphone className="w-5 h-5 text-[#0a4da8]" /> Post a Notice
            </h3>
            <form onSubmit={post} className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <Field label="Title"><input required className={fieldCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Midterm break begins Friday" /></Field>
                </div>
                <Field label="Audience">
                  <select className={fieldCls} value={audience} onChange={(e) => setAudience(e.target.value)}>
                    <option value="all">Everyone</option>
                    <option value="teachers">Teachers</option>
                    <option value="parents">Parents</option>
                    <option value="students">Students</option>
                  </select>
                </Field>
              </div>
              <Field label="Message">
                <textarea required className={fieldCls} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the announcement…" />
              </Field>
              <button disabled={saving} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-5 py-2.5 text-sm font-medium">
                {saving ? <Spinner /> : <Plus className="w-4 h-4" />} {saving ? "Posting…" : "Post Notice"}
              </button>
            </form>
          </Card>
        )}

        {loading ? (
          <div className="py-12 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
        ) : visible.length === 0 ? (
          <Card><EmptyState text="No notices yet." /></Card>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {visible.map((n) => (
              <Card key={n.id} className="p-5">
                <div className="flex items-start gap-3">
                  <div className="mr-auto min-w-0">
                    <p className="font-semibold text-slate-900">{n.title}</p>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{n.body}</p>
                    <p className="text-xs text-slate-400 mt-2.5 flex items-center gap-2">
                      <span>{new Date(n.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-100 text-[#0a4da8] px-2 py-0.5 font-medium"><Users className="w-3 h-3" />{audienceLabel[n.audience] ?? n.audience}</span>
                    </p>
                  </div>
                  {admin && (
                    <button onClick={() => remove(n)} className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete notice">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
