import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { supabase } from "../supabase";
import { Logo, friendlyError, Banner, Spinner } from "../components/ui";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
  };

  const forgot = async () => {
    if (!email.trim()) {
      setMsg({ type: "err", text: "Type your email in the box above first, then click Forgot Password." });
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setResetting(false);
    setMsg(
      error
        ? { type: "err", text: friendlyError(error.message) }
        : { type: "ok", text: "Password reset link sent — check your email inbox." }
    );
  };

  const input =
    "w-full rounded-lg border border-slate-300 bg-white pl-11 pr-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:border-[#0a4da8] focus:ring-2 focus:ring-[#0a4da8]/20 transition";

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 sm:p-10"
    >
      <Logo size="w-32 h-32" />
      <p className="text-center text-lg text-slate-700 font-medium mt-5">School Management System</p>

      <div className="mt-6 space-y-5">
        <Banner msg={msg} />

        <div>
          <label htmlFor="email" className="block text-slate-800 mb-2 font-medium">
            Email / Username
          </label>
          <div className="relative">
            <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className={input}
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-slate-800 mb-2 font-medium">
            Password
          </label>
          <div className="relative">
            <LockKeyhole className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="password"
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              className={input + " pr-12"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <div className="text-right mt-3">
            <button
              type="button"
              onClick={forgot}
              disabled={resetting}
              className="text-[#0a4da8] font-medium hover:underline disabled:opacity-60"
            >
              {resetting ? "Sending…" : "Forgot Password?"}
            </button>
          </div>
        </div>

        <button
          disabled={loading}
          className="w-full bg-[#0a4da8] hover:bg-[#083d86] active:bg-[#07336f] disabled:opacity-70 text-white rounded-lg py-3.5 font-medium transition flex justify-center items-center gap-2"
        >
          {loading && <Spinner />}
          {loading ? "Signing In…" : "Sign In"}
        </button>

      </div>

      <p className="text-center text-xs text-slate-400 mt-8">
        © {new Date().getFullYear()} · Built by: <span className="font-semibold text-slate-500">D.Prince Learning Hub</span>
      </p>
    </form>
  );
}
