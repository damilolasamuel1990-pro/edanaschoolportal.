import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Users, UserPlus, RefreshCw, Eye, EyeOff, Copy, Check, Trash2, Dices, Info,
} from "lucide-react";
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
    </div>
  );
}
