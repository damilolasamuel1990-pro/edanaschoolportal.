import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Clock3, Crown, LogOut, Copy, Check, Database, RefreshCw, KeyRound } from "lucide-react";
import { supabase } from "../supabase";
import type { Profile } from "../types";
import { SETUP_SQL } from "../setupSql";
import { Logo, RoleBadge, Banner, Spinner } from "../components/ui";
import { ChangePasswordModal } from "../components/ChangePassword";

/* ------------------------- Pending / claim screen ------------------------- */
export function PendingScreen({ me, onClaimed }: { me: User; onClaimed: () => void }) {
  const [claiming, setClaiming] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  const claim = async () => {
    setMsg(null);
    setClaiming(true);
    // Works only if no Super Admin exists yet (enforced in the database rules)
    const { error } = await supabase.from("profiles").upsert({
      id: me.id,
      email: me.email ?? "",
      full_name: (me.user_metadata?.full_name as string) ?? "",
      role: "super_admin",
    });
    setClaiming(false);
    if (error) {
      setMsg({
        type: "err",
        text: "This didn't work — a Super Admin already exists for this school, or the database setup hasn't been run yet. Ask the Super Admin to assign your role.",
      });
    } else {
      onClaimed();
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 sm:p-10 text-center">
      <Logo />
      <span className="mt-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <Clock3 className="w-6 h-6" />
      </span>
      <h1 className="text-xl font-bold text-slate-900 mt-4">Account waiting for a role</h1>
      <p className="text-sm text-slate-600 mt-2 leading-relaxed">
        You're signed in as <b>{me.email}</b>, but the Super Admin hasn't assigned your role yet.
        Please ask them to set your role, then sign in again.
      </p>

      <div className="mt-6 space-y-3 text-left">
        <Banner msg={msg} />
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-[13px] font-semibold text-slate-700 flex items-center gap-1.5">
            <Crown className="w-4 h-4 text-purple-600" /> School owner setting up for the first time?
          </p>
          <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
            If no Super Admin exists yet, claim the role now. This only works once — after that, only the
            Super Admin can create and manage accounts.
          </p>
          <button
            onClick={claim}
            disabled={claiming}
            className="mt-3 w-full inline-flex justify-center items-center gap-2 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:opacity-70 text-white py-2.5 text-sm font-medium transition"
          >
            {claiming && <Spinner />}
            {claiming ? "Claiming…" : "Claim Super Admin Access"}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          onClick={() => setPwOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          <KeyRound className="w-4 h-4" /> Change Password
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
      {pwOpen && <ChangePasswordModal email={me.email ?? ""} onClose={() => setPwOpen(false)} />}
    </div>
  );
}

/* --------------------- Welcome screen (teacher/student/parent) ------------ */
const UPCOMING: Record<string, string[]> = {
  teacher: ["My Classes", "Attendance", "Grade Book", "Timetable"],
  student: ["My Subjects", "Results", "Timetable", "Assignments"],
  parent: ["Children", "Results", "Fees & Payments", "Announcements"],
};

export function RoleWelcomeScreen({ me, profile }: { me: User; profile: Profile }) {
  const [pwOpen, setPwOpen] = useState(false);
  const modules = UPCOMING[profile.role] ?? ["Dashboard"];
  return (
    <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 sm:p-10 text-center">
      <Logo />
      <h1 className="text-2xl font-bold text-slate-900 mt-5">
        Welcome{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
      </h1>
      <p className="text-slate-600 mt-2 text-sm">
        Signed in as <span className="font-semibold text-slate-800">{me.email}</span>
      </p>
      <div className="mt-3 flex justify-center"><RoleBadge role={profile.role} /></div>

      <div className="mt-7 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Coming to your dashboard</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {modules.map((m) => (
            <span key={m} className="rounded-full bg-blue-50 border border-blue-100 text-[#0a4da8] px-3 py-1.5 text-xs font-medium">
              {m}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={() => setPwOpen(true)}
        className="mt-8 w-full inline-flex justify-center items-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
      >
        <KeyRound className="w-4 h-4" /> Change Password
      </button>
      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-3 w-full bg-[#0a4da8] hover:bg-[#083d86] text-white rounded-lg py-3 font-medium transition inline-flex justify-center items-center gap-2"
      >
        <LogOut className="w-4 h-4" /> Sign Out
      </button>
      {pwOpen && <ChangePasswordModal email={me.email ?? ""} onClose={() => setPwOpen(false)} />}
    </div>
  );
}

/* --------------------------- Setup required screen ------------------------- */
const SQL_EDITOR_URL = "https://supabase.com/dashboard/project/cehqwkzztmfmsqtylshc/sql/new";

export function SetupScreen({ errorText, missingTables }: { errorText: string; missingTables?: string[] }) {
  const [copied, setCopied] = useState(false);

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl p-8 sm:p-10">
      <div className="text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#0a4da8]">
          <Database className="w-6 h-6" />
        </span>
        <h1 className="text-xl font-bold text-slate-900 mt-4">One-time database setup needed</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed max-w-lg mx-auto">
          The app is connected to your Supabase project, but some database tables haven't been created yet.
          Running the setup script once fixes everything — it also adds the <b>Reception 1 to SS 3</b> classes.
          It's safe to run even if you've run it before: it only adds what's missing and never deletes data.
        </p>
      </div>

      {missingTables && missingTables.length > 0 && (
        <div className="mt-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Missing tables detected</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {missingTables.map((t) => (
              <span key={t} className="text-xs font-mono bg-white border border-amber-200 text-amber-800 rounded-md px-2 py-0.5">{t}</span>
            ))}
          </div>
        </div>
      )}

      <ol className="mt-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0a4da8] text-white text-xs font-bold">1</span>
          <span>
            Click the blue button below to open <b>your</b> SQL Editor (sign in to Supabase if it asks).
            <a
              href={SQL_EDITOR_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#0a4da8] hover:bg-[#083d86] text-white px-4 py-2.5 text-sm font-medium transition"
            >
              Open My Supabase SQL Editor
            </a>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0a4da8] text-white text-xs font-bold">2</span>
          <span>Click <b>Copy SQL</b> under the script below, paste it into the SQL Editor, and click <b>Run</b> (top-right of the editor). Wait for “Success”.</span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0a4da8] text-white text-xs font-bold">3</span>
          <span>Come back to this page and click <b>Recheck</b> below.</span>
        </li>
      </ol>

      <div className="mt-6">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mr-auto">Setup script — copy all of it</p>
          <button
            onClick={copySql}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0a4da8] hover:bg-[#083d86] text-white px-3 py-1.5 text-xs font-medium transition"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy SQL"}
          </button>
        </div>
        <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 text-slate-100 text-[11px] leading-relaxed p-4 whitespace-pre">
          {SETUP_SQL}
        </pre>
      </div>

      <p className="mt-3 text-xs text-slate-400 break-words">Technical detail: {errorText}</p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0a4da8] hover:bg-[#083d86] text-white px-5 py-2.5 text-sm font-medium transition"
        >
          <RefreshCw className="w-4 h-4" /> I've Run It — Recheck
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  );
}
