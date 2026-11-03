import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Users, UserPlus, RefreshCw, Eye, EyeOff, Copy, Check, Trash2, Dices, Info,
  CalendarDays, Plus, Star,
} from "lucide-react";
import { fetchSessionRows, type SessionRow } from "../lib/data";
import { supabase, createEphemeralClient } from "../supabase";
import type { Profile, Role } from "../types";
import { CREATABLE_ROLES, ROLE_LABELS } from "../types";
import { PageHeader, Card, RoleBadge, Avatar, Banner, Spinner, Field, fieldCls, friendlyError, EmptyState } from "../components/ui";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  let tail = "";
  bytes.forEach((b) => { tail += chars[b % chars.length]; });
  return `Edana-${tail}1`;
}

interface CreatedCreds {
  email: string;
  password: string;
  role: Role;
  needsConfirm: boolean;
}

/** Super Admin only: create login accounts and manage roles. */
export default function AccountsScreen({ me }: { me: User }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const [created, setCreated] = useState<CreatedCreds | null>(null);
  const [copied, setCopied] = useState(false);

  const loadProfiles = useCallback(async () => {
    setListLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) setListError(friendlyError(error.message));
    else setProfiles((data ?? []) as Profile[]);
    setListLoading(false);
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const createAccount = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setCreated(null);
    setCopied(false);
    setCreating(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const ephemeral = createEphemeralClient();
      const { data, error } = await ephemeral.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) throw error;
      const newUser = data.user;
      if (!newUser || (newUser.identities && newUser.identities.length === 0)) {
        setMsg({ type: "err", text: "An account with this email already exists. Use a different email, or check the accounts list." });
        return;
      }
      const { error: pErr } = await supabase.from("profiles").upsert({
        id: newUser.id,
        email: cleanEmail,
        full_name: fullName.trim(),
        role,
        created_by: me.id,
      });
      if (pErr) throw pErr;

      setCreated({ email: cleanEmail, password, role, needsConfirm: !data.session });
      setFullName(""); setEmail(""); setPassword("");
      await loadProfiles();
    } catch (err) {
      setMsg({ type: "err", text: friendlyError(err instanceof Error ? err.message : "Something went wrong.") });
    } finally {
      setCreating(false);
    }
  };

  const changeRole = async (p: Profile, next: Role) => {
    const { error } = await supabase.from("profiles").update({ role: next }).eq("id", p.id);
    if (error) { setMsg({ type: "err", text: friendlyError(error.message) }); return; }
    setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, role: next } : x)));
  };

  const removeProfile = async (p: Profile) => {
    if (!window.confirm(`Remove ${p.full_name || p.email} from the system? They will lose their role and app access.`)) return;
    const { error } = await supabase.from("profiles").delete().eq("id", p.id);
    if (error) { setMsg({ type: "err", text: friendlyError(error.message) }); return; }
    setProfiles((prev) => prev.filter((x) => x.id !== p.id));
  };

  const copyCreds = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(
        `Edana Schools login\nEmail: ${created.email}\nPassword: ${created.password}\nRole: ${ROLE_LABELS[created.role]}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div>
      <PageHeader
        title="User Accounts"
        subtitle="Only the Super Admin can create login accounts for Admins, Teachers, Students and Parents"
      />
      <div className="grid lg:grid-cols-5 gap-4 items-start">
        <Card className="lg:col-span-2 p-6">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <UserPlus className="w-5 h-5 text-[#0a4da8]" /> Create Account
          </h2>
          <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
            The person signs in from the normal login page with the email and password you set here.
          </p>

          <form onSubmit={createAccount} className="mt-5 space-y-4">
            <Banner msg={msg} />

            {created && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                <p className="font-semibold flex items-center gap-1.5"><Check className="w-4 h-4" /> Account created — share these details:</p>
                <p className="mt-2"><span className="text-emerald-600">Email:</span> <b>{created.email}</b></p>
                <p><span className="text-emerald-600">Password:</span> <b>{created.password}</b></p>
                <p><span className="text-emerald-600">Role:</span> <b>{ROLE_LABELS[created.role]}</b></p>
                {created.needsConfirm && (
                  <p className="mt-2 text-[13px] leading-relaxed">
                    Note: email confirmation is ON in Supabase, so this user must click the link in their
                    inbox before their first sign-in. To skip that step, turn off “Confirm email” under
                    Authentication → Providers → Email.
                  </p>
                )}
                <button
                  type="button"
                  onClick={copyCreds}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-medium transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy login details"}
                </button>
              </div>
            )}

            <Field label="Full Name">
              <input required className={fieldCls} placeholder="e.g. Mrs. Adaeze Okafor" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Email Address">
              <input type="email" required className={fieldCls} placeholder="name@edana.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role">
              <select className={fieldCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {CREATABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </Field>
            <Field label="Password">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    minLength={6}
                    className={fieldCls + " pr-10"}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label="Toggle password visibility">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setPassword(generatePassword()); setShowPw(true); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition whitespace-nowrap"
                >
                  <Dices className="w-4 h-4" /> Generate
                </button>
              </div>
            </Field>

            <button
              disabled={creating}
              className="w-full bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg py-3 text-sm font-medium transition flex justify-center items-center gap-2"
            >
              {creating && <Spinner />}
              {creating ? "Creating Account…" : "Create Account"}
            </button>

            <p className="flex gap-1.5 text-xs leading-relaxed text-slate-400">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Teachers only see student information, subjects, results and attendance. Parents only see
              their own children. Admins see everything except this account-creation page.
            </p>
          </form>
        </Card>

        <Card className="lg:col-span-3 p-6">
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 font-bold text-slate-900 mr-auto">
              <Users className="w-5 h-5 text-[#0a4da8]" /> All Accounts
            </h2>
            <button
              onClick={loadProfiles}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${listLoading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {listError ? (
            <div className="mt-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{listError}</div>
          ) : listLoading ? (
            <div className="py-12 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
          ) : profiles.length === 0 ? (
            <EmptyState text="No accounts yet. Create the first one using the form." />
          ) : (
            <div className="mt-4 overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm min-w-[540px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="py-2.5 pr-3 font-semibold">User</th>
                    <th className="py-2.5 pr-3 font-semibold">Role</th>
                    <th className="py-2.5 pr-3 font-semibold">Joined</th>
                    <th className="py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => {
                    const isSelf = p.id === me.id;
                    return (
                      <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={p.full_name} email={p.email} />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 truncate">
                                {p.full_name || "—"} {isSelf && <span className="text-xs text-slate-400">(you)</span>}
                              </p>
                              <p className="text-xs text-slate-500 truncate">{p.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3"><RoleBadge role={p.role} /></td>
                        <td className="py-3 pr-3 text-slate-500 whitespace-nowrap">
                          {new Date(p.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              value={p.role}
                              disabled={isSelf}
                              onChange={(e) => changeRole(p, e.target.value as Role)}
                              className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-[#0a4da8] disabled:opacity-50"
                              aria-label={`Change role for ${p.email}`}
                            >
                              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => removeProfile(p)}
                              disabled={isSelf}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                              aria-label={`Remove ${p.email}`}
                              title={isSelf ? "You can't remove your own account" : "Remove account"}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400 leading-relaxed">
            Removing a person deletes their profile and app access. Their login record can also be deleted
            in Supabase under Authentication → Users if needed.
          </p>
        </Card>
      </div>

      <SessionsSection />
    </div>
  );
}

/* ------------------------- Academic Sessions (Super Admin) ------------------------- */
function SessionsSection() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  const load = async () => {
    setRows(await fetchSessionRows());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const current = rows.find((r) => r.is_current);

  const nextSessionName = (): string => {
    if (rows.length === 0) return "2026/2027";
    const years = rows
      .map((r) => parseInt(r.name.split("/")[0], 10))
      .filter((y) => !isNaN(y));
    const max = years.length ? Math.max(...years) : 2025;
    return `${max + 1}/${max + 2}`;
  };

  const addSession = async (sessionName: string) => {
    const clean = sessionName.trim();
    const match = clean.match(/^(\d{4})\/(\d{4})$/);
    if (!match) {
      setMsg({ type: "err", text: "Session must look like 2027/2028 — four digits, a slash, four digits." });
      return;
    }
    if (parseInt(match[2], 10) !== parseInt(match[1], 10) + 1) {
      setMsg({ type: "err", text: `The second year must be one more than the first — did you mean ${match[1]}/${parseInt(match[1], 10) + 1}?` });
      return;
    }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("sessions").insert({
      name: clean,
      is_current: rows.length === 0,
    });
    setBusy(false);
    if (error) { setMsg({ type: "err", text: friendlyError(error.message) }); return; }
    setName("");
    setMsg({ type: "ok", text: `Session ${clean} added. It now appears in every session dropdown (results, fees, report cards).` });
    load();
  };

  const setCurrent = async (row: SessionRow) => {
    setBusy(true); setMsg(null);
    const { error: clearError } = await supabase
      .from("sessions")
      .update({ is_current: false })
      .neq("id", row.id);
    if (clearError) { setBusy(false); setMsg({ type: "err", text: friendlyError(clearError.message) }); return; }
    const { error } = await supabase.from("sessions").update({ is_current: true }).eq("id", row.id);
    setBusy(false);
    if (error) { setMsg({ type: "err", text: friendlyError(error.message) }); return; }
    setMsg({ type: "ok", text: `${row.name} is now the current session — it will be selected by default everywhere.` });
    load();
  };

  const removeSession = async (row: SessionRow) => {
    if (row.is_current) {
      setMsg({ type: "err", text: "That's the current session. Set another session as current first, then delete it." });
      return;
    }
    if (!window.confirm(`Delete the ${row.name} session from the list? (Results and fees already recorded under it are not deleted.)`)) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("sessions").delete().eq("id", row.id);
    setBusy(false);
    if (error) { setMsg({ type: "err", text: friendlyError(error.message) }); return; }
    setMsg({ type: "ok", text: `Session ${row.name} removed.` });
    load();
  };

  return (
    <Card className="p-6 mt-4">
      <h2 className="flex items-center gap-2 font-bold text-slate-900">
        <CalendarDays className="w-5 h-5 text-[#0a4da8]" /> Academic Sessions
      </h2>
      <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
        Only you, the Super Admin, can manage sessions. The <b>current session</b> is selected by
        default in results, fees and report cards across the whole portal.
      </p>

      <div className="mt-5 space-y-4">
        <Banner msg={msg} />

        <form
          onSubmit={(e) => { e.preventDefault(); addSession(name); }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="w-56">
            <Field label="New Session">
              <input
                className={fieldCls}
                placeholder="e.g. 2027/2028"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <button
            disabled={busy}
            className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium"
          >
            {busy ? <Spinner /> : <Plus className="w-4 h-4" />} Add Session
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => addSession(nextSessionName())}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Plus className="w-4 h-4" /> Add {nextSessionName()}
          </button>
        </form>

        {loading ? (
          <div className="py-8 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
        ) : rows.length === 0 ? (
          <EmptyState text="No sessions yet. Add your first session above." />
        ) : (
          <ul className="divide-y divide-slate-50">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="font-semibold text-slate-800 mr-auto">{r.name}</span>
                {r.is_current ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold">
                    <Star className="w-3 h-3" /> Current Session
                  </span>
                ) : (
                  <button
                    onClick={() => setCurrent(r)}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-[#0a4da8] hover:text-[#0a4da8] disabled:opacity-60"
                  >
                    Set as Current
                  </button>
                )}
                <button
                  onClick={() => removeSession(r)}
                  disabled={busy}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                  title={r.is_current ? "Current session can't be deleted" : `Delete ${r.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {current && (
          <p className="text-xs text-slate-400">
            Current session: <b className="text-slate-600">{current.name}</b> — new results, fees and report cards default to it.
          </p>
        )}
      </div>
    </Card>
  );
}
