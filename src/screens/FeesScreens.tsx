import { useEffect, useState, type FormEvent } from "react";
import {
  Wallet, Plus, Trash2, CreditCard, Check, ReceiptText, X, Eye,
  ShieldCheck, ShieldX, Send, Upload, FileText,
} from "lucide-react";
import { supabase } from "../supabase";
import type { Profile, Student, FeeItem, Payment } from "../types";
import { VERIFIED_STATUSES } from "../types";
import { TERMS, SESSIONS, CURRENT_SESSION, formatMoney, generateReference, fullName } from "../lib/school";
import { useClasses, className, fetchStudents, fetchMyChildren } from "../lib/data";
import {
  PageHeader, Card, Banner, Spinner, Field, fieldCls,
  Avatar, EmptyState, friendlyError, StatCard,
} from "../components/ui";

/*
 * PAYSTACK: paste your Paystack PUBLIC key below (from your Paystack
 * dashboard -> Settings -> API Keys). It looks like "pk_live_..." or
 * "pk_test_...". With a key, parents pay by real card and the payment
 * is verified automatically. Without a key, card payments run in demo
 * mode (recorded instantly so you can test the flow).
 */
const PAYSTACK_PUBLIC_KEY = "";

const isFinanceRole = (r: string) => r === "super_admin" || r === "admin" || r === "bursary";

export function FeesScreen({ profile }: { profile: Profile }) {
  return isFinanceRole(profile.role) ? <FinanceFees profile={profile} /> : <ParentFees profile={profile} />;
}

/* ------------------------------- Proof viewer ------------------------------ */
async function viewProof(path: string) {
  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    window.alert("Could not open the receipt. It may still be uploading — try again in a moment.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

export function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "Verified" || status === "Paid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "Pending Verification"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles}`}>
      {status}
    </span>
  );
}

/* ------------------------- Finance (Bursary/Admin) ------------------------- */
function FinanceFees({ profile }: { profile: Profile }) {
  const { classes } = useClasses();
  const [session, setSession] = useState(CURRENT_SESSION);
  const [items, setItems] = useState<FeeItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [sendingNotice, setSendingNotice] = useState(false);
  const [clearing, setClearing] = useState(false);
  /** Only Super Admin and Admin may clear payment records */
  const canClear = profile.role === "super_admin" || profile.role === "admin";

  // fee item form
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [feeClass, setFeeClass] = useState("");
  const [feeTerm, setFeeTerm] = useState<string>(TERMS[0]);
  const [saving, setSaving] = useState(false);

  // manual payment form
  const [payStudent, setPayStudent] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Bank Transfer");
  const [recording, setRecording] = useState(false);

  const load = async () => {
    const [{ data: fi }, { data: pm }, allStudents] = await Promise.all([
      supabase.from("fee_items").select("*").order("created_at", { ascending: false }),
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(200),
      fetchStudents(),
    ]);
    setItems(((fi ?? []) as FeeItem[]).filter((f) => f.session === session));
    setPayments((pm ?? []) as Payment[]);
    setStudents(allStudents);
    setLoading(false);
  };
  useEffect(() => { load(); }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const studentName = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? fullName(s) : "—";
  };
  const studentClass = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? className(classes, s.class_id) : "";
  };

  const collected = payments
    .filter((p) => VERIFIED_STATUSES.includes(p.status))
    .reduce((a, p) => a + Number(p.amount), 0);
  const pending = payments.filter((p) => p.status === "Pending Verification");

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("fee_items").insert({
      title: title.trim(), amount: Number(amount), class_id: feeClass || null, term: feeTerm, session,
    });
    setSaving(false);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else { setTitle(""); setAmount(""); setMsg({ type: "ok", text: "Fee added. Parents can now see it on their dashboard." }); load(); }
  };

  const deleteItem = async (item: FeeItem) => {
    if (!window.confirm(`Delete fee "${item.title}"?`)) return;
    const { error } = await supabase.from("fee_items").delete().eq("id", item.id);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else load();
  };

  const recordPayment = async (e: FormEvent) => {
    e.preventDefault();
    setRecording(true); setMsg(null);
    const { error } = await supabase.from("payments").insert({
      student_id: payStudent, amount: Number(payAmount), method: payMethod,
      reference: generateReference(), status: "Verified",
      paid_by: profile.id, verified_by: profile.id, verified_at: new Date().toISOString(),
    });
    setRecording(false);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else { setPayAmount(""); setMsg({ type: "ok", text: "Payment recorded and verified." }); load(); }
  };

  const verifyPayment = async (p: Payment, approve: boolean) => {
    if (!approve && !window.confirm(`Reject this payment of ${formatMoney(Number(p.amount))} from ${studentName(p.student_id)}? The parent will see it as rejected.`)) return;
    setVerifyingId(p.id); setMsg(null);
    const { error } = await supabase.from("payments").update({
      status: approve ? "Verified" : "Rejected",
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
    }).eq("id", p.id);
    setVerifyingId(null);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else {
      setMsg({ type: "ok", text: approve ? "Payment verified — it now counts toward the student's balance." : "Payment rejected." });
      load();
    }
  };

  /** Super Admin / Admin only: delete ALL payment records (resets Fees Collected to ₦0). */
  const clearPayments = async () => {
    if (payments.length === 0) {
      setMsg({ type: "err", text: "There are no payment records to clear." });
      return;
    }
    const first = window.confirm(
      `Clear ALL ${payments.length} payment record(s)?\n\n` +
      `This permanently deletes the payment history and resets "Fees Collected" to ₦0. ` +
      `Students' balances will go back to showing the full fees owed. This cannot be undone.`
    );
    if (!first) return;
    const typed = window.prompt('To confirm, type CLEAR and click OK:');
    if (typed !== "CLEAR") {
      setMsg({ type: "err", text: "Clear cancelled — you must type CLEAR exactly to confirm." });
      return;
    }
    setClearing(true); setMsg(null);
    const { error } = await supabase
      .from("payments")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    setClearing(false);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else {
      setMsg({ type: "ok", text: "All payment records cleared. Fees Collected is now ₦0." });
      load();
    }
  };

  /** Send this session's fee details to all parents as a notice. */
  const sendFeesToParents = async () => {
    if (items.length === 0) {
      setMsg({ type: "err", text: "Add at least one fee for this session first, then send the details to parents." });
      return;
    }
    setSendingNotice(true); setMsg(null);
    const lines = items.map((f) =>
      `• ${f.title}: ${formatMoney(Number(f.amount))}${f.term ? ` (${f.term})` : ""}${f.class_id ? ` — ${className(classes, f.class_id)} only` : " — all classes"}`
    );
    const body =
      `Dear Parents,\n\nPlease find the school fees for the ${session} session below:\n\n${lines.join("\n")}\n\n` +
      `You can see your child's exact bill and pay from your parent dashboard under "School Fees". ` +
      `If you pay by bank transfer, please upload your receipt (photo or PDF) after paying so the bursary can verify it.\n\nThank you.\n— Edana Schools Bursary`;
    const { error } = await supabase.from("notices").insert({
      title: `School Fees — ${session} Session`,
      body,
      audience: "parents",
      created_by: profile.id,
    });
    setSendingNotice(false);
    if (error) setMsg({ type: "err", text: friendlyError(error.message) });
    else setMsg({ type: "ok", text: "Fee details sent to all parents. They'll see it on the Notice Board and their fees on the School Fees page." });
  };

  return (
    <div>
      <PageHeader
        title="School Fees — Bursary"
        subtitle="Set fees, send bills to parents, record payments and verify receipts"
        actions={
          <>
            {canClear && (
              <button
                onClick={clearPayments}
                disabled={clearing}
                title="Delete all payment records and reset Fees Collected to ₦0 (Super Admin / Admin only)"
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 px-4 py-2.5 text-sm font-medium transition"
              >
                {clearing ? <Spinner /> : <Trash2 className="w-4 h-4" />}
                {clearing ? "Clearing…" : "Clear Fees Collected"}
              </button>
            )}
            <button
              onClick={sendFeesToParents}
              disabled={sendingNotice}
              className="inline-flex items-center gap-2 rounded-lg border border-[#0a4da8] text-[#0a4da8] hover:bg-blue-50 disabled:opacity-60 px-4 py-2.5 text-sm font-medium transition"
            >
              {sendingNotice ? <Spinner /> : <Send className="w-4 h-4" />}
              {sendingNotice ? "Sending…" : "Send Fees to Parents"}
            </button>
            <select className={fieldCls + " w-44"} value={session} onChange={(e) => setSession(e.target.value)}>
              {SESSIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </>
        }
      />
      <div className="space-y-4">
        <Banner msg={msg} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Fees Collected (Verified)" value={formatMoney(collected)} icon={Wallet} tint="bg-cyan-50 text-cyan-700" />
          <StatCard label="Awaiting Verification" value={pending.length} icon={ReceiptText} tint="bg-amber-50 text-amber-700" />
          <StatCard label={`Fee Items (${session})`} value={items.length} icon={CreditCard} tint="bg-emerald-50 text-emerald-700" />
          <StatCard label="Payments Recorded" value={payments.length} icon={FileText} tint="bg-blue-50 text-[#0a4da8]" />
        </div>

        {/* Verification queue */}
        {pending.length > 0 && (
          <Card className="p-6 border-amber-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-amber-600" /> Payments Awaiting Verification ({pending.length})
            </h3>
            <p className="text-[13px] text-slate-500 mt-1">
              Parents submitted these payments with receipts. Open the receipt to check it, then verify or reject.
            </p>
            <ul className="divide-y divide-slate-100 mt-3">
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar name={studentName(p.student_id)} />
                  <div className="mr-auto min-w-[160px]">
                    <p className="font-medium text-slate-800">{studentName(p.student_id)}</p>
                    <p className="text-xs text-slate-400">
                      {studentClass(p.student_id)} · {p.method} · {new Date(p.created_at).toLocaleDateString()} · Ref {p.reference}
                    </p>
                  </div>
                  <span className="font-bold text-slate-900">{formatMoney(Number(p.amount))}</span>
                  {p.proof_path ? (
                    <button onClick={() => viewProof(p.proof_path!)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Eye className="w-3.5 h-3.5" /> View Receipt
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">No receipt attached</span>
                  )}
                  <button
                    onClick={() => verifyPayment(p, true)}
                    disabled={verifyingId === p.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-3 py-2 text-xs font-semibold"
                  >
                    {verifyingId === p.id ? <Spinner className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />} Verify
                  </button>
                  <button
                    onClick={() => verifyPayment(p, false)}
                    disabled={verifyingId === p.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 px-3 py-2 text-xs font-semibold"
                  >
                    <ShieldX className="w-3.5 h-3.5" /> Reject
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid lg:grid-cols-5 gap-4 items-start">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-6">
              <h3 className="font-bold text-slate-900 mb-4">Add Fee — {session}</h3>
              <form onSubmit={addItem} className="space-y-4">
                <Field label="Fee Title"><input required className={fieldCls} placeholder="e.g. School Fees, PTA Levy" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
                <Field label="Amount (₦)"><input required type="number" min={0} className={fieldCls} placeholder="85000" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Applies To">
                    <select className={fieldCls} value={feeClass} onChange={(e) => setFeeClass(e.target.value)}>
                      <option value="">All Classes</option>
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Term">
                    <select className={fieldCls} value={feeTerm} onChange={(e) => setFeeTerm(e.target.value)}>
                      {TERMS.map((t) => <option key={t}>{t}</option>)}
                      <option value="">Whole Session</option>
                    </select>
                  </Field>
                </div>
                <button disabled={saving} className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                  {saving ? <Spinner /> : <Plus className="w-4 h-4" />} Add Fee
                </button>
              </form>
            </Card>

            <Card className="p-6">
              <h3 className="font-bold text-slate-900 mb-4">Record Offline Payment</h3>
              <form onSubmit={recordPayment} className="space-y-4">
                <Field label="Student">
                  <select required className={fieldCls} value={payStudent} onChange={(e) => setPayStudent(e.target.value)}>
                    <option value="">Select student…</option>
                    {students.filter((s) => s.status === "active").map((s) => (
                      <option key={s.id} value={s.id}>{fullName(s)} — {className(classes, s.class_id)}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (₦)"><input required type="number" min={1} className={fieldCls} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></Field>
                  <Field label="Method">
                    <select className={fieldCls} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                      <option>Bank Transfer</option><option>Cash</option><option>POS</option><option>Cheque</option>
                    </select>
                  </Field>
                </div>
                <button disabled={recording} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                  {recording ? <Spinner /> : <Check className="w-4 h-4" />} Record Payment
                </button>
              </form>
            </Card>
          </div>

          <div className="lg:col-span-3 space-y-4">
            <Card className="p-6">
              <h3 className="font-bold text-slate-900 mb-3">Fee Items — {session}</h3>
              {loading ? (
                <div className="py-8 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
              ) : items.length === 0 ? (
                <EmptyState text="No fees set for this session yet." />
              ) : (
                <ul className="divide-y divide-slate-50">
                  {items.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 py-3">
                      <div className="mr-auto min-w-0">
                        <p className="font-medium text-slate-800 truncate">{f.title}</p>
                        <p className="text-xs text-slate-400">{f.class_id ? className(classes, f.class_id) : "All Classes"}{f.term ? ` · ${f.term}` : ""}</p>
                      </div>
                      <span className="font-bold text-slate-900">{formatMoney(Number(f.amount))}</span>
                      <button onClick={() => deleteItem(f)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete fee">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h3 className="font-bold text-slate-900 px-6 pt-5 pb-2">All Payments</h3>
              {payments.length === 0 ? (
                <EmptyState text="No payments recorded yet." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[680px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="py-3 px-5 font-semibold">Student</th>
                        <th className="py-3 px-5 font-semibold">Amount</th>
                        <th className="py-3 px-5 font-semibold">Method</th>
                        <th className="py-3 px-5 font-semibold">Status</th>
                        <th className="py-3 px-5 font-semibold">Receipt</th>
                        <th className="py-3 px-5 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.slice(0, 30).map((p) => (
                        <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                          <td className="py-3 px-5">
                            <p className="font-medium text-slate-800">{studentName(p.student_id)}</p>
                            <p className="text-xs text-slate-400">{p.reference}</p>
                          </td>
                          <td className="py-3 px-5 font-semibold">{formatMoney(Number(p.amount))}</td>
                          <td className="py-3 px-5 text-slate-500">{p.method}</td>
                          <td className="py-3 px-5"><StatusBadge status={p.status} /></td>
                          <td className="py-3 px-5">
                            {p.proof_path ? (
                              <button onClick={() => viewProof(p.proof_path!)} className="inline-flex items-center gap-1 text-xs font-medium text-[#0a4da8] hover:underline">
                                <Eye className="w-3.5 h-3.5" /> View
                              </button>
                            ) : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          <td className="py-3 px-5 text-slate-500">{new Date(p.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Parent --------------------------------- */
function ParentFees({ profile }: { profile: Profile }) {
  const { classes } = useClasses();
  const [session, setSession] = useState(CURRENT_SESSION);
  const [children, setChildren] = useState<Student[]>([]);
  const [items, setItems] = useState<FeeItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const [payingFor, setPayingFor] = useState<Student | null>(null);

  const load = async () => {
    const kids = await fetchMyChildren(profile.id);
    setChildren(kids);
    const [{ data: fi }, { data: pm }] = await Promise.all([
      supabase.from("fee_items").select("*"),
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
    ]);
    setItems((fi ?? []) as FeeItem[]);
    setPayments((pm ?? []) as Payment[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const summaryFor = (child: Student) => {
    const due = items
      .filter((f) => f.session === session && (f.class_id === null || f.class_id === child.class_id))
      .reduce((a, f) => a + Number(f.amount), 0);
    const childPayments = payments.filter((p) => p.student_id === child.id);
    const paid = childPayments
      .filter((p) => VERIFIED_STATUSES.includes(p.status))
      .reduce((a, p) => a + Number(p.amount), 0);
    const pendingAmt = childPayments
      .filter((p) => p.status === "Pending Verification")
      .reduce((a, p) => a + Number(p.amount), 0);
    return { due, paid, pendingAmt, balance: Math.max(0, due - paid), childPayments };
  };

  return (
    <div>
      <PageHeader
        title="School Fees"
        subtitle="View your children's school fees and pay online"
        actions={
          <select className={fieldCls + " w-44"} value={session} onChange={(e) => setSession(e.target.value)}>
            {SESSIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        }
      />
      <div className="space-y-4">
        <Banner msg={msg} />
        {loading ? (
          <div className="py-14 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
        ) : children.length === 0 ? (
          <Card><EmptyState text="No children are linked to your account yet. Please contact the school office." /></Card>
        ) : (
          children.map((child) => {
            const { due, paid, pendingAmt, balance, childPayments } = summaryFor(child);
            const feesForChild = items.filter((f) => f.session === session && (f.class_id === null || f.class_id === child.class_id));
            const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;
            return (
              <Card key={child.id} className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={fullName(child)} className="h-11 w-11 text-sm" />
                  <div className="mr-auto min-w-0">
                    <p className="font-semibold text-slate-900">{fullName(child)}</p>
                    <p className="text-xs text-slate-500">{className(classes, child.class_id)} · {child.admission_no}</p>
                  </div>
                  <button
                    onClick={() => setPayingFor(child)}
                    disabled={balance <= 0}
                    className="inline-flex items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-medium"
                  >
                    <CreditCard className="w-4 h-4" /> {balance <= 0 ? "Fully Paid" : "Pay Now"}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 text-center">
                  <div className="rounded-xl bg-slate-50 py-3 px-1">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Total Fees ({session})</p>
                    <p className="font-bold text-slate-900 mt-0.5">{formatMoney(due)}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 py-3 px-1">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-500">Paid (Verified)</p>
                    <p className="font-bold text-emerald-700 mt-0.5">{formatMoney(paid)}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 py-3 px-1">
                    <p className="text-[11px] uppercase tracking-wide text-amber-500">Awaiting Verification</p>
                    <p className="font-bold text-amber-700 mt-0.5">{formatMoney(pendingAmt)}</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 py-3 px-1">
                    <p className="text-[11px] uppercase tracking-wide text-rose-400">Balance</p>
                    <p className="font-bold text-rose-600 mt-0.5">{formatMoney(balance)}</p>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 mt-3 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>

                {feesForChild.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Fee Breakdown</p>
                    <ul className="divide-y divide-slate-50 text-sm">
                      {feesForChild.map((f) => (
                        <li key={f.id} className="flex py-2">
                          <span className="mr-auto text-slate-700">{f.title}{f.term ? <span className="text-slate-400"> · {f.term}</span> : null}</span>
                          <span className="font-medium">{formatMoney(Number(f.amount))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {childPayments.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Payment History</p>
                    <ul className="divide-y divide-slate-50 text-sm">
                      {childPayments.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                          <span className="mr-auto text-slate-700">
                            {formatMoney(Number(p.amount))} <span className="text-slate-400">via {p.method}</span>
                          </span>
                          {p.proof_path && (
                            <button onClick={() => viewProof(p.proof_path!)} className="inline-flex items-center gap-1 text-xs font-medium text-[#0a4da8] hover:underline">
                              <Eye className="w-3.5 h-3.5" /> Receipt
                            </button>
                          )}
                          <span className="text-xs text-slate-400">{p.reference}</span>
                          <span className="text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString()}</span>
                          <StatusBadge status={p.status} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {payingFor && (
        <PayModal
          child={payingFor}
          balance={summaryFor(payingFor).balance}
          parentId={profile.id}
          parentEmail={profile.email}
          onClose={() => setPayingFor(null)}
          onDone={(text) => { setMsg({ type: "ok", text }); load(); }}
        />
      )}
    </div>
  );
}

/* --------------------------------- Pay modal -------------------------------- */
interface PaystackResponse { reference: string; }
interface PaystackHandler { openIframe: () => void; }
interface PaystackPopType {
  setup: (options: {
    key: string; email: string; amount: number; currency: string; ref: string;
    callback: (res: PaystackResponse) => void; onClose: () => void;
  }) => PaystackHandler;
}

function loadPaystackScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as { PaystackPop?: PaystackPopType }).PaystackPop) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function PayModal({
  child, balance, parentId, parentEmail, onClose, onDone,
}: {
  child: Student;
  balance: number;
  parentId: string;
  parentEmail: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<"card" | "transfer">("card");
  const [file, setFile] = useState<File | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordPayment = async (status: string, methodLabel: string, reference: string): Promise<Payment | null> => {
    const { data, error } = await supabase.from("payments").insert({
      student_id: child.id, amount: Number(amount), method: methodLabel,
      reference, status, paid_by: parentId,
    }).select().single();
    if (error) { setError(friendlyError(error.message)); return null; }
    return data as Payment;
  };

  const finishVerified = async (reference: string, methodLabel: string) => {
    const row = await recordPayment("Verified", methodLabel, reference);
    setPaying(false);
    if (row) {
      onDone(`Payment of ${formatMoney(Number(amount))} for ${fullName(child)} was successful. Reference: ${reference}. Thank you!`);
      onClose();
    }
  };

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) { setError("Enter a valid amount."); return; }
    if (value > balance) { setError(`Amount is more than the balance of ${formatMoney(balance)}.`); return; }
    setError(null);

    if (method === "transfer") {
      setPaying(true);
      const row = await recordPayment("Pending Verification", "Bank Transfer", generateReference());
      if (!row) { setPaying(false); return; }
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${parentId}/${row.id}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("payment-proofs")
          .upload(path, file, { upsert: true });
        if (!upErr) {
          await supabase.from("payments").update({ proof_path: path }).eq("id", row.id);
        }
      }
      setPaying(false);
      onDone(
        `Your payment of ${formatMoney(value)} for ${fullName(child)} has been sent to the bursary${file ? " with your receipt" : ""}. ` +
        `It will reflect on your balance once the bursary verifies it. Reference: ${row.reference}.`
      );
      onClose();
      return;
    }

    // Card payment via Paystack
    if (!PAYSTACK_PUBLIC_KEY) {
      // Demo mode: no live key configured yet
      setPaying(true);
      await finishVerified(generateReference(), "Card (Demo)");
      return;
    }
    setPaying(true);
    const loaded = await loadPaystackScript();
    const paystack = (window as unknown as { PaystackPop?: PaystackPopType }).PaystackPop;
    if (!loaded || !paystack) {
      setPaying(false);
      setError("Could not load the Paystack payment window. Check your internet connection and try again.");
      return;
    }
    const reference = generateReference();
    let completed = false;
    const handler = paystack.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: parentEmail,
      amount: Math.round(value * 100), // Paystack charges in kobo
      currency: "NGN",
      ref: reference,
      callback: (res) => {
        completed = true;
        void finishVerified(res.reference || reference, "Card (Paystack)");
      },
      onClose: () => {
        if (!completed) {
          setPaying(false);
          setError("Payment window closed. If you completed the payment, please wait a moment and check your payment history.");
        }
      },
    });
    handler.openIframe();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6 m-0 sm:m-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-1">
          <h3 className="font-bold text-slate-900 mr-auto">Pay School Fees</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500">{fullName(child)} · Balance <b className="text-slate-800">{formatMoney(balance)}</b></p>

        <form onSubmit={pay} className="mt-5 space-y-4">
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

          <Field label="Amount (₦)">
            <input type="number" min={1} required className={fieldCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>

          <Field label="How do you want to pay?">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setMethod("card")}
                className={`rounded-lg border px-3 py-3 text-sm font-medium transition text-left ${method === "card" ? "border-[#0a4da8] bg-blue-50 text-[#0a4da8]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
              >
                <CreditCard className="w-4 h-4 mb-1" />
                Card (Paystack)
                <span className="block text-[11px] font-normal opacity-70">Verified instantly</span>
              </button>
              <button
                type="button" onClick={() => setMethod("transfer")}
                className={`rounded-lg border px-3 py-3 text-sm font-medium transition text-left ${method === "transfer" ? "border-[#0a4da8] bg-blue-50 text-[#0a4da8]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
              >
                <Upload className="w-4 h-4 mb-1" />
                Bank Transfer
                <span className="block text-[11px] font-normal opacity-70">Upload receipt for verification</span>
              </button>
            </div>
          </Field>

          {method === "transfer" && (
            <Field label="Upload your receipt (photo or PDF)" hint="Take a photo of your transfer receipt or attach the PDF. The bursary will check it and verify your payment.">
              <label className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 cursor-pointer hover:border-[#0a4da8]/50 transition">
                <Upload className="w-5 h-5 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-600 truncate">
                  {file ? file.name : "Tap to choose an image or PDF…"}
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </Field>
          )}

          <button disabled={paying} className="w-full inline-flex justify-center items-center gap-2 bg-[#0a4da8] hover:bg-[#083d86] disabled:opacity-70 text-white rounded-lg py-3 text-sm font-semibold">
            {paying ? <Spinner /> : method === "card" ? <CreditCard className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {paying
              ? "Processing…"
              : method === "card"
                ? `Pay ${amount ? formatMoney(Number(amount) || 0) : ""} with Paystack`
                : "Submit Payment for Verification"}
          </button>

          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            {method === "card"
              ? PAYSTACK_PUBLIC_KEY
                ? "You'll complete this payment securely in the Paystack window. It reflects on your balance immediately."
                : "Card payments are in demo mode until the school connects its Paystack account — payments are recorded instantly so you can test."
              : "After you submit, the bursary checks your receipt and verifies the payment. Verified payments reduce your balance."}
          </p>
        </form>
      </div>
    </div>
  );
}
