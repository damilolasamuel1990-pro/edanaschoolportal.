import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Search, UserPlus, Pencil, Trash2, Eye, Download, Upload, ArrowUpCircle, Check, Sparkles, FileText, ImagePlus } from "lucide-react";
import { supabase } from "../supabase";
import type { Profile, Student } from "../types";
import { generateAdmissionNo, parseCSV, CSV_TEMPLATE, fullName, TERMS, CURRENT_SESSION, splitScore } from "../lib/school";
import { useClasses, className, fetchStudents, fetchSubjects, saveResultRows, passportPublicUrl, uploadStudentPassport, PASSPORT_BUCKET } from "../lib/data";
import {
  PageHeader, Card, Banner, Spinner, Modal, Field, fieldCls,
  Avatar, StudentAvatar, EmptyState, friendlyError,
} from "../components/ui";
import type { PageKey } from "../layout/DashboardLayout";

/* ------------------------------ Student form ------------------------------ */
export interface StudentFormState {
  first_name: string; last_name: string; gender: string; date_of_birth: string;
  class_id: string; admission_no: string; guardian_name: string; guardian_phone: string;
  guardian_email: string; address: string; parent_id: string;
}

export const emptyStudentForm = (): StudentFormState => ({
  first_name: "", last_name: "", gender: "", date_of_birth: "", class_id: "",
  admission_no: generateAdmissionNo(), guardian_name: "", guardian_phone: "",
  guardian_email: "", address: "", parent_id: "",
});

function StudentFields({
  form, setForm, parents,
}: {
  form: StudentFormState;
  setForm: (f: StudentFormState) => void;
  parents: Profile[];
}) {
  const { classes } = useClasses();
  const set = (k: keyof StudentFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="First Name *"><input required className={fieldCls} value={form.first_name} onChange={set("first_name")} placeholder="e.g. Adaeze" /></Field>
      <Field label="Last Name *"><input required className={fieldCls} value={form.last_name} onChange={set("last_name")} placeholder="e.g. Okafor" /></Field>
      <Field label="Admission Number *">
        <input required className={fieldCls} value={form.admission_no} onChange={set("admission_no")} />
      </Field>
      <Field
        label="Student Class *"
        hint={classes.length === 0
          ? "No classes loaded yet — an Admin can add Reception 1 to SS 3 in one click from the Classes page."
          : "Reception 1 to SS 3"}
      >
        <select required className={fieldCls} value={form.class_id} onChange={set("class_id")}>
          <option value="">{classes.length === 0 ? "No classes available yet" : "Select class…"}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Gender">
        <select className={fieldCls} value={form.gender} onChange={set("gender")}>
          <option value="">Select…</option>
          <option>Female</option><option>Male</option>
        </select>
      </Field>
      <Field label="Date of Birth">
        <input type="date" className={fieldCls} value={form.date_of_birth} onChange={set("date_of_birth")} />
      </Field>
      <Field label="Guardian Name"><input className={fieldCls} value={form.guardian_name} onChange={set("guardian_name")} placeholder="e.g. Mrs Okafor" /></Field>
      <Field label="Guardian Phone"><input className={fieldCls} value={form.guardian_phone} onChange={set("guardian_phone")} placeholder="0803…" /></Field>
      <Field label="Guardian Email"><input type="email" className={fieldCls} value={form.guardian_email} onChange={set("guardian_email")} /></Field>
      <Field
        label="Linked Parent Account"
        hint={parents.length > 0
          ? "The linked parent can view this child's report card, attendance and fees from their dashboard."
          : "No parent accounts yet — the Super Admin creates parent logins under User Accounts, then they can be linked here."}
      >
        <select className={fieldCls} value={form.parent_id} onChange={set("parent_id")}>
          <option value="">Not linked</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email} ({p.email})</option>)}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Home Address">
          <textarea className={fieldCls} rows={2} value={form.address} onChange={set("address")} />
        </Field>
      </div>
    </div>
  );
}

function useParents() {
  const [parents, setParents] = useState<Profile[]>([]);
  useEffect(() => {
    supabase.from("profiles").select("*").eq("role", "parent").order("full_name")
      .then(({ data }) => setParents((data ?? []) as Profile[]));
  }, []);
  return parents;
}

/* --------------------------- Passport photo field -------------------------- */
export function PassportField({
  file, onFile, existingUrl, onRemove,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  existingUrl: string | null;
  onRemove: () => void;
}) {
  const preview = file ? URL.createObjectURL(file) : existingUrl;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      {preview ? (
        <img src={preview} alt="Student passport" className="h-20 w-16 rounded-md object-cover border border-slate-300" />
      ) : (
        <div className="h-20 w-16 rounded-md bg-slate-100 border border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400">
          <ImagePlus className="w-5 h-5" />
          <span className="text-[10px]">No photo</span>
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-slate-700">Passport Photograph</p>
        <p className="text-xs text-slate-400 mb-2.5 max-w-xs leading-relaxed">
          The student's passport appears on their details and at the top-left of the report card.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a4da8] hover:bg-[#083d86] text-white px-3.5 py-2 text-xs font-medium cursor-pointer transition">
            <Upload className="w-3.5 h-3.5" /> {preview ? "Change Photo" : "Upload Photo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {preview && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-red-600 hover:border-red-200 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formToRow(form: StudentFormState, meId: string) {
  return {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    gender: form.gender,
    date_of_birth: form.date_of_birth || null,
    class_id: form.class_id || null,
    admission_no: form.admission_no.trim(),
    guardian_name: form.guardian_name.trim(),
    guardian_phone: form.guardian_phone.trim(),
    guardian_email: form.guardian_email.trim(),
    address: form.address.trim(),
    parent_id: form.parent_id || null,
    created_by: meId,
  };
}

/* ------------------------------ Admit Student ----------------------------- */
export function AdmitStudentScreen({ profile, go }: { profile: Profile; go: (p: PageKey) => void }) {
  const [form, setForm] = useState<StudentFormState>(emptyStudentForm());
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const parents = useParents();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const { data: inserted, error } = await supabase
      .from("students")
      .insert(formToRow(form, profile.id))
      .select()
      .single();
    if (error) {
      setSaving(false);
      setMsg({ type: "err", text: friendlyError(error.message) });
      return;
    }
    let note = "";
    if (passportFile && inserted) {
      const up = await uploadStudentPassport((inserted as Student).id, passportFile);
      if (up.error) note = " (The passport photo could not be uploaded — edit the student later to add it.)";
    }
    setSaving(false);
    setMsg({
      type: "ok",
      text: `${form.first_name} ${form.last_name} has been admitted with admission number ${form.admission_no}.${note}`,
    });
    setForm(emptyStudentForm());
    setPassportFile(null);
  };

  return (
    <div>
      <PageHeader title="Admit Student" subtitle="Register a new student into the school" />
      <Card className="p-6 max-w-3xl">
        <form onSubmit={submit} className="space-y-5">
          <Banner msg={msg} />
          <PassportField file={passportFile} onFile={setPassportFile} existingUrl={null} onRemove={() => setPassportFile(null)} />
          <StudentFields form={form} setForm={setForm} parents={parents} />
          <div className="flex flex-wrap gap-2 pt-1">
            <button disabled={saving} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition">
              {saving ? <Spinner /> : <UserPlus className="w-4 h-4" />} {saving ? "Saving…" : "Admit Student"}
            </button>
            <button type="button" onClick={() => go("students")} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
              View All Students
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* --------------------------------- Demo data ------------------------------- */
const DEMO_ADMISSION_NO = "DEMO/001";

const DEMO_SUBJECT_SCORES: { name: string; scores: [number, number, number] }[] = [
  { name: "Basic Science and Technology", scores: [92, 100, 100] },
  { name: "Christian Religious Knowledge", scores: [97, 99, 99] },
  { name: "Cultural and Creative Art", scores: [93, 85, 94] },
  { name: "Diction", scores: [86, 96, 96] },
  { name: "English", scores: [93, 100, 97] },
  { name: "Handwriting", scores: [96, 96, 96] },
  { name: "History", scores: [95, 88, 98] },
  { name: "Mathematics", scores: [98, 100, 93] },
  { name: "National Values", scores: [98, 99, 100] },
  { name: "Pre-vocational Studies", scores: [89, 100, 98] },
  { name: "Project", scores: [100, 100, 100] },
  { name: "Yoruba", scores: [78, 100, 92] },
];

const DEMO_AFFECTIVE: Record<string, number> = {
  "Attentiveness": 5, "Attitude to School Work": 5, "Cooperation with Others": 4,
  "Emotional Stability": 5, "Leadership": 4, "Attendance": 5, "Neatness": 5,
  "Perseverance": 4, "Politeness": 5, "Punctuality": 4, "Speaking / Writing": 5,
  "Organisation Ability": 4, "Relationship with Others": 5,
};

const DEMO_PSYCHOMOTOR: Record<string, number> = {
  "Handling of Tools": 4, "Handwriting": 5, "Verbal Fluency": 5,
  "Processing Speed": 4, "Retentiveness": 5,
};

export function DemoStudentCard({
  profile, classes, onChanged, go,
}: {
  profile: Profile;
  classes: ReturnType<typeof useClasses>["classes"];
  onChanged: () => void;
  go: (p: PageKey) => void;
}) {
  const [demo, setDemo] = useState<Student | null>(null);
  const [demoClassId, setDemoClassId] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  const checkDemo = async () => {
    const { data } = await supabase
      .from("students")
      .select("*")
      .eq("admission_no", DEMO_ADMISSION_NO)
      .maybeSingle();
    setDemo((data as Student) ?? null);
    setChecking(false);
  };

  useEffect(() => { checkDemo(); }, []);

  // Default the demo student's class to Basic 4 (or the first available class)
  useEffect(() => {
    if (!demoClassId && classes.length > 0) {
      const preferred = classes.find((c) => c.name === "Basic 4") ?? classes[0];
      setDemoClassId(preferred.id);
    }
  }, [classes, demoClassId]);

  const addDemo = async () => {
    if (!demoClassId) { setMsg({ type: "err", text: "Choose a class for the demo student first." }); return; }
    setBusy(true); setMsg(null);
    try {
      const { data: stu, error } = await supabase.from("students").insert({
        admission_no: DEMO_ADMISSION_NO,
        first_name: "Ayomikun",
        last_name: "Demo (Sample)",
        gender: "Female",
        date_of_birth: "2017-03-15",
        class_id: demoClassId,
        guardian_name: "Demo Guardian",
        guardian_phone: "0803 000 0000",
        guardian_email: "demo@example.com",
        address: "Demo student — safe to delete anytime",
        created_by: profile.id,
      }).select().single();
      if (error) throw error;
      const studentId = (stu as Student).id;

      // Subjects: use the class subjects, or create the standard set if none exist
      let subjects = await fetchSubjects(demoClassId);
      if (subjects.length === 0) {
        const { error: sErr } = await supabase.from("subjects").insert(
          DEMO_SUBJECT_SCORES.map((s) => ({ name: s.name, class_id: demoClassId, created_by: profile.id }))
        );
        if (sErr) throw sErr;
        subjects = await fetchSubjects(demoClassId);
      }

      // Scores for all 3 terms
      const rows = subjects.flatMap((subj, idx) => {
        const pattern = DEMO_SUBJECT_SCORES[idx % DEMO_SUBJECT_SCORES.length].scores;
        return TERMS.map((term, ti) => {
          const total = pattern[ti];
          const { test, exam } = splitScore(total);
          return {
            student_id: studentId, subject_id: subj.id, term,
            session: CURRENT_SESSION, score: total, test_score: test, exam_score: exam,
            entered_by: profile.id,
          };
        });
      });
      const res = await saveResultRows(rows);
      if (res.error) throw new Error(res.error);
      const scoreNote = res.degraded
        ? " (Scores saved as totals only — run the latest database update to also store the Test/Exam breakdown.)"
        : "";

      // Traits, comments and term dates
      const { error: repErr } = await supabase.from("reports").upsert({
        student_id: studentId,
        session: CURRENT_SESSION,
        affective: DEMO_AFFECTIVE,
        psychomotor: DEMO_PSYCHOMOTOR,
        teacher_comment: "Ayomikun is always outstanding because of her curiosity and dedication.",
        principal_comment: "Outstanding work. Keep soaring higher.",
        term_begins: "2026-01-05",
        term_ends: "2026-04-10",
        next_term_begins: "2026-04-23",
        days_opened: 65,
        days_present: 63,
      }, { onConflict: "student_id,session" });
      if (repErr) throw repErr;

      setMsg({ type: "ok", text: `Demo student added with subjects, scores for all 3 terms, traits and comments. Open the report card to see it.${scoreNote}` });
      await checkDemo();
      onChanged();
    } catch (err) {
      setMsg({ type: "err", text: friendlyError(err instanceof Error ? err.message : "Could not add the demo student.") });
    } finally {
      setBusy(false);
    }
  };

  const deleteDemo = async () => {
    if (!demo) return;
    if (!window.confirm("Delete the demo student and all its demo results? This cannot be undone.")) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("students").delete().eq("id", demo.id);
    setBusy(false);
    if (error) { setMsg({ type: "err", text: friendlyError(error.message) }); return; }
    setDemo(null);
    setMsg({ type: "ok", text: "Demo student deleted." });
    onChanged();
  };

  const viewReport = () => {
    if (!demo) return;
    sessionStorage.setItem("edana_report_student", demo.id);
    go("reportcards");
  };

  return (
    <Card className="p-5 border-blue-200 bg-gradient-to-br from-blue-50/80 to-white">
      <div className="flex flex-wrap items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0a4da8] text-white">
          <Sparkles className="w-5 h-5" />
        </span>
        <div className="mr-auto min-w-[220px]">
          <h3 className="font-bold text-slate-900">Try the Demo Student</h3>
          <p className="text-[13px] text-slate-500 leading-relaxed max-w-xl">
            Add one ready-made demo student — with subjects, scores for 1st, 2nd and 3rd term, trait
            ratings and comments — so you can see a complete report card right away. Delete it anytime.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Banner msg={msg} />
        {checking ? (
          <p className="text-sm text-slate-400 flex items-center gap-2"><Spinner /> Checking for demo student…</p>
        ) : demo ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 border border-amber-200 text-amber-800 px-3 py-1.5 text-sm font-medium">
              Demo: {demo.first_name} {demo.last_name} · {className(classes, demo.class_id)} · {demo.admission_no}
            </span>
            <button onClick={viewReport} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] text-white rounded-lg px-4 py-2 text-sm font-medium">
              <FileText className="w-4 h-4" /> View Demo Report Card
            </button>
            <button onClick={deleteDemo} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 px-4 py-2 text-sm font-medium">
              {busy ? <Spinner /> : <Trash2 className="w-4 h-4" />} Delete Demo Student
            </button>
          </div>
        ) : classes.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            No classes exist yet. Run the database setup script first (it creates Reception 1 to SS 3), then come back to add the demo.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Field label="Demo Student's Class" hint="Reception 1 to SS 3">
                <select className={fieldCls} value={demoClassId} onChange={(e) => setDemoClassId(e.target.value)}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>
            <button onClick={addDemo} disabled={busy} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
              {busy ? <Spinner /> : <Sparkles className="w-4 h-4" />} {busy ? "Adding Demo…" : "Add Demo Student"}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* --------------------------- Student Information -------------------------- */
export function StudentInfoScreen({ profile, go }: { profile: Profile; go: (p: PageKey) => void }) {
  const { classes } = useClasses();
  const parents = useParents();
  const isAdmin = profile.role === "super_admin" || profile.role === "admin";
  /** Bursary can view student information but not change it */
  const canManage = isAdmin || profile.role === "teacher";

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  const [editing, setEditing] = useState<Student | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentFormState>(emptyStudentForm());
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [passportRemoved, setPassportRemoved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setStudents(await fetchStudents());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => students.filter((s) => {
    const q = query.toLowerCase();
    const matchesQ = !q || `${s.first_name} ${s.last_name} ${s.admission_no} ${s.guardian_phone}`.toLowerCase().includes(q);
    const matchesC = !classFilter || s.class_id === classFilter;
    return matchesQ && matchesC && s.status === "active";
  }), [students, query, classFilter]);

  const openAdd = () => {
    setAdding(true);
    setForm(emptyStudentForm());
    setPassportFile(null);
    setPassportRemoved(false);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setPassportFile(null);
    setPassportRemoved(false);
    setForm({
      first_name: s.first_name, last_name: s.last_name, gender: s.gender,
      date_of_birth: s.date_of_birth ?? "", class_id: s.class_id ?? "",
      admission_no: s.admission_no, guardian_name: s.guardian_name,
      guardian_phone: s.guardian_phone, guardian_email: s.guardian_email,
      address: s.address, parent_id: s.parent_id ?? "",
    });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const row = formToRow(form, profile.id);

    let studentId: string | null = editing?.id ?? null;
    let error = null;
    if (editing) {
      ({ error } = await supabase.from("students").update(row).eq("id", editing.id));
    } else {
      const res = await supabase.from("students").insert(row).select().single();
      error = res.error;
      studentId = (res.data as Student | null)?.id ?? null;
    }
    if (error) {
      setSaving(false);
      setMsg({ type: "err", text: friendlyError(error.message) });
      return;
    }

    // Passport photo: upload a new one, or remove the existing one
    let photoNote = "";
    if (studentId && passportFile) {
      const up = await uploadStudentPassport(studentId, passportFile);
      if (up.error) photoNote = " The passport photo could not be uploaded — try again from Edit Student.";
    } else if (studentId && passportRemoved && editing?.passport_path) {
      await supabase.storage.from(PASSPORT_BUCKET).remove([editing.passport_path]);
      await supabase.from("students").update({ passport_path: null }).eq("id", studentId);
    }

    setSaving(false);
    setEditing(null); setAdding(false);
    setPassportFile(null); setPassportRemoved(false);
    setMsg({
      type: photoNote ? "err" : "ok",
      text: (editing ? "Student updated successfully." : "Student admitted successfully.") + photoNote,
    });
    load();
  };

  const remove = async (s: Student) => {
    if (!window.confirm(`Delete ${fullName(s)} (${s.admission_no})? This removes the student and all their results.`)) return;
    const { error } = await supabase.from("students").delete().eq("id", s.id);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else { setMsg({ type: "ok", text: "Student deleted." }); load(); }
  };

  const parentName = (id: string | null) => {
    if (!id) return null;
    const p = parents.find((x) => x.id === id);
    return p ? (p.full_name || p.email) : "Linked";
  };

  return (
    <div>
      <PageHeader
        title="Student Information"
        subtitle={`${filtered.length} student${filtered.length === 1 ? "" : "s"}`}
        actions={canManage ? (
          <button onClick={openAdd} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] text-white rounded-lg px-4 py-2.5 text-sm font-medium transition">
            <UserPlus className="w-4 h-4" /> Admit Student
          </button>
        ) : undefined}
      />
      <div className="space-y-4">
        <Banner msg={msg} />
        {canManage && <DemoStudentCard profile={profile} classes={classes} onChanged={load} go={go} />}
        <Card className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className={fieldCls + " pl-9"} placeholder="Search name, admission no, phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className={fieldCls + " sm:w-56"} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Card>

        <Card>
          {loading ? (
            <div className="py-14 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState text="No students found. Admit a student to get started." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="py-3 px-4 font-semibold">Student</th>
                    <th className="py-3 px-4 font-semibold">Admission No</th>
                    <th className="py-3 px-4 font-semibold">Class</th>
                    <th className="py-3 px-4 font-semibold">Guardian</th>
                    <th className="py-3 px-4 font-semibold">Parent Portal</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <StudentAvatar name={fullName(s)} photoPath={s.passport_path} />
                          <div>
                            <p className="font-medium text-slate-800 flex items-center gap-2">
                              {fullName(s)}
                              {s.admission_no.startsWith("DEMO") && (
                                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5">DEMO</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500">{s.gender || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{s.admission_no}</td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{className(classes, s.class_id)}</td>
                      <td className="py-3 px-4">
                        <p className="text-slate-700">{s.guardian_name || "—"}</p>
                        <p className="text-xs text-slate-500">{s.guardian_phone || ""}</p>
                      </td>
                      <td className="py-3 px-4">
                        {parentName(s.parent_id)
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><Check className="w-3 h-3" />{parentName(s.parent_id)}</span>
                          : <span className="text-xs text-slate-400">Not linked</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setViewing(s)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-[#0a4da8] hover:bg-blue-50" title="View details"><Eye className="w-4 h-4" /></button>
                          {canManage && (
                            <button onClick={() => openEdit(s)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-[#0a4da8] hover:bg-blue-50" title="Edit"><Pencil className="w-4 h-4" /></button>
                          )}
                          {canManage && (isAdmin || s.admission_no.startsWith("DEMO")) && (
                            <button onClick={() => remove(s)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" title={s.admission_no.startsWith("DEMO") ? "Delete demo student" : "Delete"}><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {(adding || editing) && (
        <Modal title={editing ? "Edit Student" : "Admit Student"} onClose={() => { setAdding(false); setEditing(null); }} wide>
          <form onSubmit={save} className="space-y-5">
            <Banner msg={msg} />
            <PassportField
              file={passportFile}
              onFile={setPassportFile}
              existingUrl={editing && !passportRemoved && editing.passport_path ? passportPublicUrl(editing.passport_path) : null}
              onRemove={() => { setPassportFile(null); setPassportRemoved(true); }}
            />
            <StudentFields form={form} setForm={setForm} parents={parents} />
            <div className="flex gap-2">
              <button disabled={saving} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-5 py-2.5 text-sm font-medium">
                {saving && <Spinner />}{saving ? "Saving…" : editing ? "Save Changes" : "Admit Student"}
              </button>
              <button type="button" onClick={() => { setAdding(false); setEditing(null); }} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {viewing && (
        <Modal title="Student Details" onClose={() => setViewing(null)} wide>
          <div className="flex items-center gap-4 mb-5">
            <StudentAvatar name={fullName(viewing)} photoPath={viewing.passport_path} className="h-14 w-14 text-base" />
            <div>
              <p className="font-bold text-slate-900 text-lg leading-tight">{fullName(viewing)}</p>
              <p className="text-sm text-slate-500">{className(classes, viewing.class_id)} · {viewing.admission_no}</p>
            </div>
          </div>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ["Gender", viewing.gender || "—"],
              ["Date of Birth", viewing.date_of_birth ? new Date(viewing.date_of_birth).toLocaleDateString() : "—"],
              ["Status", viewing.status],
              ["Guardian", viewing.guardian_name || "—"],
              ["Guardian Phone", viewing.guardian_phone || "—"],
              ["Guardian Email", viewing.guardian_email || "—"],
              ["Parent Portal Account", parentName(viewing.parent_id) ?? "Not linked"],
              ["Address", viewing.address || "—"],
              ["Date Admitted", new Date(viewing.created_at).toLocaleDateString()],
            ].map(([k, v]) => (
              <div key={k} className="border-b border-slate-50 pb-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-slate-800 mt-0.5 capitalize">{v}</dd>
              </div>
            ))}
          </dl>
          {canManage && (
            <div className="flex gap-2 mt-6">
              <button onClick={() => { setViewing(null); openEdit(viewing); }} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                <Pencil className="w-4 h-4" /> Edit Student
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------- Bulk Upload ------------------------------ */
export function BulkUploadScreen({ profile }: { profile: Profile }) {
  const { classes } = useClasses();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  const parse = (value: string) => { setText(value); setRows(parseCSV(value)); };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    parse(await file.text());
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "edana-students-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const findClass = (name: string) => classes.find((c) => c.name.toLowerCase() === (name || "").trim().toLowerCase());

  const doImport = async () => {
    setImporting(true); setMsg(null);
    let ok = 0; const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const first = r["firstname"] ?? ""; const last = r["lastname"] ?? "";
      if (!first || !last) { errors.push(`Row ${i + 2}: missing first or last name`); continue; }
      const cls = findClass(r["class"] ?? "");
      if (!cls) { errors.push(`Row ${i + 2}: class "${r["class"]}" not found`); continue; }
      const { error } = await supabase.from("students").insert({
        first_name: first, last_name: last, gender: r["gender"] ?? "",
        date_of_birth: r["dateofbirth"] || null, class_id: cls.id,
        admission_no: (r["admissionno"] || "").trim() || generateAdmissionNo(),
        guardian_name: r["guardianname"] ?? "", guardian_phone: r["guardianphone"] ?? "",
        guardian_email: r["guardianemail"] ?? "", address: r["address"] ?? "",
        created_by: profile.id,
      });
      if (error) errors.push(`Row ${i + 2}: ${error.message}`);
      else ok++;
    }
    setImporting(false);
    setMsg({
      type: errors.length ? "err" : "ok",
      text: `Imported ${ok} of ${rows.length} students.${errors.length ? " Problems: " + errors.slice(0, 4).join(" · ") + (errors.length > 4 ? ` · and ${errors.length - 4} more` : "") : ""}`,
    });
    if (ok > 0) { setRows([]); setText(""); }
  };

  return (
    <div>
      <PageHeader title="Bulk Upload" subtitle="Admit many students at once using a spreadsheet (CSV) file" />
      <div className="space-y-4 max-w-4xl">
        <Banner msg={msg} />
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Download className="w-4 h-4" /> Download CSV Template
            </button>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
              <Upload className="w-4 h-4" /> Upload CSV File
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
          <Field label="…or paste CSV content here">
            <textarea className={fieldCls + " font-mono text-xs"} rows={7} value={text} onChange={(e) => parse(e.target.value)} placeholder={"First Name,Last Name,Gender,Class,Date of Birth,Guardian Name,Guardian Phone,Guardian Email,Address"} />
          </Field>
          <p className="text-xs text-slate-400">Class names must match exactly (e.g. “Basic 4”, “JSS 1”, “SS 3”). Admission numbers are generated automatically when left out.</p>
        </Card>

        {rows.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="font-bold text-slate-900 mr-auto">Preview — {rows.length} row{rows.length === 1 ? "" : "s"}</h3>
              <button onClick={doImport} disabled={importing} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                {importing ? <Spinner /> : <Upload className="w-4 h-4" />} {importing ? "Importing…" : "Import Students"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-3 font-semibold">#</th>
                    <th className="py-2 pr-3 font-semibold">Name</th>
                    <th className="py-2 pr-3 font-semibold">Class</th>
                    <th className="py-2 pr-3 font-semibold">Gender</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 15).map((r, i) => {
                    const clsOk = !!findClass(r["class"] ?? "");
                    const nameOk = !!(r["firstname"] && r["lastname"]);
                    return (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-2 pr-3 text-slate-400">{i + 1}</td>
                        <td className="py-2 pr-3">{(r["firstname"] ?? "") + " " + (r["lastname"] ?? "")}</td>
                        <td className="py-2 pr-3">{r["class"] || "—"}</td>
                        <td className="py-2 pr-3">{r["gender"] || "—"}</td>
                        <td className="py-2">{clsOk && nameOk
                          ? <span className="text-emerald-600 text-xs font-medium">Ready</span>
                          : <span className="text-red-600 text-xs font-medium">{!nameOk ? "Missing name" : "Class not found"}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 15 && <p className="text-xs text-slate-400 mt-2">Showing first 15 of {rows.length} rows…</p>}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Student Promotion -------------------------- */
export function PromotionScreen({ profile }: { profile: Profile }) {
  void profile;
  const { classes } = useClasses();
  const [fromClass, setFromClass] = useState("");
  const [toClass, setToClass] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  useEffect(() => {
    if (!fromClass) { setStudents([]); return; }
    setLoading(true);
    fetchStudents(fromClass).then((list) => {
      const active = list.filter((s) => s.status === "active");
      setStudents(active);
      setSelected(new Set(active.map((s) => s.id)));
      setLoading(false);
    });
    const idx = classes.findIndex((c) => c.id === fromClass);
    const next = classes[idx + 1];
    setToClass(next ? next.id : "GRADUATED");
  }, [fromClass, classes]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const promote = async () => {
    if (selected.size === 0) { setMsg({ type: "err", text: "Select at least one student to promote." }); return; }
    const targetName = toClass === "GRADUATED" ? "Graduated" : className(classes, toClass);
    if (!window.confirm(`Promote ${selected.size} student(s) to ${targetName}?`)) return;
    setWorking(true); setMsg(null);
    const ids = [...selected];
    const { error } = toClass === "GRADUATED"
      ? await supabase.from("students").update({ status: "graduated" }).in("id", ids)
      : await supabase.from("students").update({ class_id: toClass }).in("id", ids);
    setWorking(false);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else {
      setMsg({ type: "ok", text: `${ids.length} student(s) promoted to ${targetName}.` });
      const remaining = students.filter((s) => !selected.has(s.id));
      setStudents(remaining); setSelected(new Set());
    }
  };

  return (
    <div>
      <PageHeader title="Student Promotion" subtitle="Move students to the next class at the end of the session" />
      <div className="space-y-4 max-w-4xl">
        <Banner msg={msg} />
        <Card className="p-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="From Class">
              <select className={fieldCls} value={fromClass} onChange={(e) => setFromClass(e.target.value)}>
                <option value="">Select class…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Promote To">
              <select className={fieldCls} value={toClass} onChange={(e) => setToClass(e.target.value)} disabled={!fromClass}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="GRADUATED">Graduated (leaving school)</option>
              </select>
            </Field>
          </div>
        </Card>

        {fromClass && (
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h3 className="font-bold text-slate-900 mr-auto">
                {loading ? "Loading…" : `${students.length} student(s) in ${className(classes, fromClass)}`}
              </h3>
              <button onClick={() => setSelected(new Set(students.map((s) => s.id)))} className="text-sm text-[#0a4da8] font-medium hover:underline">Select all</button>
              <button onClick={() => setSelected(new Set())} className="text-sm text-slate-500 font-medium hover:underline">Clear</button>
              <button onClick={promote} disabled={working || selected.size === 0} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-60 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                {working ? <Spinner /> : <ArrowUpCircle className="w-4 h-4" />} Promote {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
            </div>
            {loading ? (
              <div className="py-10 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
            ) : students.length === 0 ? (
              <EmptyState text="No active students in this class." />
            ) : (
              <ul className="divide-y divide-slate-50">
                {students.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-slate-50/70 px-2 rounded-lg">
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="h-4 w-4 accent-[#0a4da8]" />
                      <Avatar name={fullName(s)} />
                      <span className="font-medium text-slate-800">{fullName(s)}</span>
                      <span className="text-xs text-slate-400 ml-auto">{s.admission_no}</span>
                    </label>
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
