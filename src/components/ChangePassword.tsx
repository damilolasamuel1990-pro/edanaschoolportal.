import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { supabase } from "../supabase";
import { Modal, Banner, Spinner, Field, fieldCls, friendlyError } from "./ui";

/**
 * Change-your-own-password dialog, available to every signed-in user
 * (Super Admin, Admin, Teacher, Part-Time, Bursary, Parent...).
 * The current password is verified before the new one is set.
 */
export function ChangePasswordModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 6) {
      setMsg({ type: "err", text: "Your new password must be at least 6 characters." });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: "err", text: "The new passwords don't match. Please re-enter them." });
      return;
    }
    if (next === current) {
      setMsg({ type: "err", text: "The new password is the same as the current one. Choose a different password." });
      return;
    }
    setBusy(true);
    // Verify the current password first
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (verifyError) {
      setBusy(false);
      setMsg({ type: "err", text: "Your current password is incorrect. Please check it and try again." });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: friendlyError(error.message) });
    } else {
      setDone(true);
      setMsg({ type: "ok", text: "Password changed successfully. Use your new password next time you sign in." });
    }
  };

  const passwordField = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    auto: string
  ) => (
    <Field label={label}>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          required
          autoComplete={auto}
          className={fieldCls + " pr-11"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          aria-label={show ? "Hide passwords" : "Show passwords"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </Field>
  );

  return (
    <Modal title="Change Password" onClose={onClose}>
      {done ? (
        <div className="space-y-5">
          <Banner msg={msg} />
          <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
            <KeyRound className="w-5 h-5 shrink-0" />
            You're all set — your account now uses your own password, not the default one.
          </div>
          <button
            onClick={onClose}
            className="w-full bg-[#0a4da8] hover:bg-[#083d86] text-white rounded-lg py-3 text-sm font-medium transition"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Banner msg={msg} />
          <p className="text-sm text-slate-500 leading-relaxed">
            Signed in as <b className="text-slate-700">{email}</b>. If you were given a default password,
            change it here to your own private password.
          </p>
          {passwordField("Current Password", current, setCurrent, "current-password")}
          {passwordField("New Password", next, setNext, "new-password")}
          {passwordField("Confirm New Password", confirm, setConfirm, "new-password")}
          <button
            disabled={busy}
            className="w-full inline-flex justify-center items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg py-3 text-sm font-medium transition"
          >
            {busy && <Spinner />}
            {busy ? "Changing Password…" : "Change Password"}
          </button>
        </form>
      )}
    </Modal>
  );
}
