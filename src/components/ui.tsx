import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { SUPABASE_URL, SUPABASE_KEY } from "../supabase";
import logoImg from "../assets/edana-logo.png";
import { passportPublicUrl } from "../lib/data";
import type { Role } from "../types";
import { ROLE_LABELS } from "../types";

/* ---------------------------------- Logo ---------------------------------- */
/** The official Edana Schools badge (image) — used across the whole portal. */
export function Logo({ size = "w-24 h-24" }: { size?: string }) {
  return (
    <img
      src={logoImg}
      alt="Edana Schools logo"
      className={`${size} block mx-auto rounded-full object-cover`}
      draggable={false}
    />
  );
}

/* --------------------------- Friendly error text --------------------------- */
export function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Incorrect email or password. If you don't have an account, the Super Admin must create one for you.";
  if (m.includes("email not confirmed"))
    return "This account's email hasn't been confirmed yet. Please click the confirmation link in your inbox, then sign in.";
  if (m.includes("already registered") || m.includes("duplicate key") || m.includes("already exists"))
    return "That record already exists (it may be a duplicate admission number, email or entry).";
  if (m.includes("password should be"))
    return "The password is too short — it must be at least 6 characters.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Couldn't reach the server. Check your internet connection and try again.";
  if (m.includes("invalid email"))
    return "Please enter a valid email address.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts. Please wait a few minutes and try again.";
  if (m.includes("row-level security") || m.includes("permission denied"))
    return "You don't have permission to do that. If you're the owner, make sure the database setup script has been run.";
  if (m.includes("bucket") || m.includes("storage") || m.includes("nosuchbucket"))
    return "The file storage (for signatures, passport photos and payment receipts) hasn't been created yet. Please run the latest setup script once in Supabase → SQL Editor — it only adds what's missing.";
  if (m.includes("column") && (m.includes("does not exist") || m.includes("schema cache")))
    return "The database is missing the latest update (a new column hasn't been added yet). Please run the newest setup script once — it only adds what's missing. The app shows the script on its setup screen.";
  if (m.includes("find the table") || m.includes("schema cache") || m.includes("does not exist"))
    return "Some database tables haven't been created yet. Please run the one-time setup script (the app shows it on the setup screen).";
  return message;
}

/* --------------------------- Connection indicator -------------------------- */
export type ConnState = "checking" | "ok" | "fail";

export function useConnectionStatus(): ConnState {
  const [state, setState] = useState<ConnState>("checking");
  useEffect(() => {
    let cancelled = false;
    fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => { if (!cancelled) setState(r.ok ? "ok" : "fail"); })
      .catch(() => { if (!cancelled) setState("fail"); });
    return () => { cancelled = true; };
  }, []);
  return state;
}

export function ConnectionBadge({ state }: { state: ConnState }) {
  const styles = {
    checking: "bg-amber-50 text-amber-700 border-amber-200",
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    fail: "bg-red-50 text-red-700 border-red-200",
  }[state];
  const dot = {
    checking: "bg-amber-500 animate-pulse",
    ok: "bg-emerald-500",
    fail: "bg-red-500",
  }[state];
  const label = {
    checking: "Checking connection to Supabase…",
    ok: "Connected to Supabase",
    fail: "Cannot reach Supabase — check your internet connection",
  }[state];
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${styles}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

/* --------------------------------- Spinner --------------------------------- */
export function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <span className={`${className} inline-block border-2 border-current/30 border-t-current rounded-full animate-spin`} />;
}

export function FullScreenSpinner() {
  return (
    <div className="flex flex-col items-center gap-3 text-[#0a4da8]">
      <span className="w-9 h-9 border-4 border-blue-200 border-t-[#0a4da8] rounded-full animate-spin" />
      <p className="text-sm text-slate-500">Loading…</p>
    </div>
  );
}

/* -------------------------------- Role badge ------------------------------- */
export function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    super_admin: "bg-purple-100 text-purple-800 border-purple-200",
    admin: "bg-blue-100 text-blue-800 border-blue-200",
    teacher: "bg-emerald-100 text-emerald-800 border-emerald-200",
    part_time: "bg-teal-100 text-teal-800 border-teal-200",
    bursary: "bg-cyan-100 text-cyan-800 border-cyan-200",
    student: "bg-amber-100 text-amber-800 border-amber-200",
    parent: "bg-pink-100 text-pink-800 border-pink-200",
    pending: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

/* ------------------------------ Message banner ----------------------------- */
export function Banner({ msg }: { msg: { type: "err" | "ok"; text: string } | null }) {
  if (!msg) return null;
  return (
    <div
      className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
        msg.type === "err"
          ? "bg-red-50 text-red-700 border border-red-200"
          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
      }`}
    >
      {msg.text}
    </div>
  );
}

/* --------------------------------- Avatar ---------------------------------- */
export function Avatar({ name, email, className = "h-9 w-9 text-xs" }: { name: string; email?: string; className?: string }) {
  const source = (name || email || "?").trim();
  const initials = source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#0a4da8]/10 text-[#0a4da8] font-bold ${className}`}>
      {initials}
    </span>
  );
}

/** Student avatar that shows the passport photo when one has been uploaded. */
export function StudentAvatar({
  name,
  photoPath,
  className = "h-9 w-9 text-xs",
}: {
  name: string;
  photoPath?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (photoPath && !failed) {
    return (
      <img
        src={passportPublicUrl(photoPath)}
        alt={name}
        onError={() => setFailed(true)}
        className={`${className} rounded-full object-cover shrink-0`}
        draggable={false}
      />
    );
  }
  return <Avatar name={name} className={className} />;
}

/* ------------------------------ Form styling ------------------------------- */
export const fieldCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#0a4da8] focus:ring-2 focus:ring-[#0a4da8]/20 transition disabled:bg-slate-50 disabled:text-slate-400";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/* -------------------------------- Page header ------------------------------ */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3 mb-5">
      <div className="mr-auto">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* --------------------------------- Stat card ------------------------------- */
export function StatCard({ label, value, icon: Icon, tint }: { label: string; value: string | number; icon: React.ElementType; tint: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 leading-none truncate">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

/* ---------------------------------- Card ----------------------------------- */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>;
}

/* ---------------------------------- Modal ---------------------------------- */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className={`relative bg-white w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl`}>
        <div className="sticky top-0 bg-white flex items-center gap-3 px-6 py-4 border-b border-slate-100 rounded-t-2xl z-10">
          <h3 className="font-bold text-slate-900 mr-auto">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------- Empty state ------------------------------ */
export function EmptyState({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-slate-500">{text}</p>;
}
