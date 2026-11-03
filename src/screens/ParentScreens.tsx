import { useEffect, useState } from "react";
import { FileText, CalendarCheck, Wallet } from "lucide-react";
import type { Profile, Student } from "../types";
import { CURRENT_SESSION, formatMoney } from "../lib/school";
import { useClasses, className, fetchMyChildren, overallAverage } from "../lib/data";
import { supabase } from "../supabase";
import { PageHeader, Card, StudentAvatar, Spinner, EmptyState } from "../components/ui";
import type { PageKey } from "../layout/DashboardLayout";

interface ChildStats {
  average: number | null;
  attendancePct: number | null;
  balance: number;
}

export function ChildrenScreen({ profile, go }: { profile: Profile; go: (p: PageKey) => void }) {
  const { classes } = useClasses();
  const [children, setChildren] = useState<Student[]>([]);
  const [stats, setStats] = useState<Record<string, ChildStats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const kids = await fetchMyChildren(profile.id);
      setChildren(kids);
      const map: Record<string, ChildStats> = {};
      for (const kid of kids) {
        const [{ data: results }, { data: att }, { data: feeItems }, { data: pays }] = await Promise.all([
          supabase.from("results").select("subject_id, score").eq("student_id", kid.id).eq("session", CURRENT_SESSION),
          supabase.from("attendance").select("status").eq("student_id", kid.id),
          supabase.from("fee_items").select("amount, class_id").eq("session", CURRENT_SESSION),
          supabase.from("payments").select("amount, status").eq("student_id", kid.id),
        ]);
        const attRows = (att ?? []) as { status: string }[];
        const attended = attRows.filter((a) => a.status !== "absent").length;
        const due = ((feeItems ?? []) as { amount: number; class_id: string | null }[])
          .filter((f) => f.class_id === null || f.class_id === kid.class_id)
          .reduce((a, f) => a + Number(f.amount), 0);
        const paid = ((pays ?? []) as { amount: number; status: string }[])
          .filter((p) => p.status === "Paid")
          .reduce((a, p) => a + Number(p.amount), 0);
        map[kid.id] = {
          average: overallAverage(((results ?? []) as { subject_id: string; score: number }[])),
          attendancePct: attRows.length ? Math.round((attended / attRows.length) * 100) : null,
          balance: Math.max(0, due - paid),
        };
      }
      setStats(map);
      setLoading(false);
    })();
  }, [profile.id]);

  return (
    <div>
      <PageHeader title="My Children" subtitle="Your children at Edana Schools — tap a card to see details" />
      {loading ? (
        <div className="py-14 flex justify-center text-[#0a4da8]"><Spinner className="w-6 h-6" /></div>
      ) : children.length === 0 ? (
        <Card><EmptyState text="No children are linked to your account yet. Please contact the school office so they can link your children to your account." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {children.map((child) => {
            const st = stats[child.id];
            return (
              <Card key={child.id} className="p-5">
                <div className="flex items-center gap-3">
                  <StudentAvatar name={`${child.first_name} ${child.last_name}`} photoPath={child.passport_path} className="h-12 w-12 text-sm" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{child.first_name} {child.last_name}</p>
                    <p className="text-xs text-slate-500">{className(classes, child.class_id)} · {child.admission_no}</p>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="rounded-lg bg-blue-50 py-2.5 px-1">
                    <dd className="font-bold text-[#0a4da8]">{st?.average !== null && st?.average !== undefined ? st.average.toFixed(1) + "%" : "—"}</dd>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-500 mt-0.5">Average</dt>
                  </div>
                  <div className="rounded-lg bg-emerald-50 py-2.5 px-1">
                    <dd className="font-bold text-emerald-700">{st?.attendancePct !== null && st?.attendancePct !== undefined ? st.attendancePct + "%" : "—"}</dd>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-500 mt-0.5">Attendance</dt>
                  </div>
                  <div className="rounded-lg bg-amber-50 py-2.5 px-1">
                    <dd className="font-bold text-amber-700">{st ? formatMoney(st.balance) : "—"}</dd>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-500 mt-0.5">Fee Balance</dt>
                  </div>
                </dl>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <button onClick={() => go("reportcards")} className="inline-flex justify-center items-center gap-1.5 rounded-lg bg-[#0a4da8] hover:bg-[#083d86] text-white text-xs font-medium py-2.5 transition">
                    <FileText className="w-3.5 h-3.5" /> Report
                  </button>
                  <button onClick={() => go("attendance")} className="inline-flex justify-center items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium py-2.5 transition">
                    <CalendarCheck className="w-3.5 h-3.5" /> Attendance
                  </button>
                  <button onClick={() => go("fees")} className="inline-flex justify-center items-center gap-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-medium py-2.5 transition">
                    <Wallet className="w-3.5 h-3.5" /> Fees
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
