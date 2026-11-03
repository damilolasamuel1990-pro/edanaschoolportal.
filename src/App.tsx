import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile } from "./types";
import LoginScreen from "./screens/LoginScreen";
import DashboardLayout, { pagesForRole, type PageKey } from "./layout/DashboardLayout";
import DashboardHome from "./screens/DashboardHome";
import { AdmitStudentScreen, StudentInfoScreen, BulkUploadScreen, PromotionScreen } from "./screens/StudentsScreens";
import { SubjectsScreen, ResultsScreen, TraitsScreen, ReportCardsScreen } from "./screens/AcademicsScreens";
import { AttendanceScreen, ClassesScreen, TeachersScreen, ParentsScreen, NoticesScreen } from "./screens/OperationsScreens";
import { FeesScreen } from "./screens/FeesScreens";
import { ChildrenScreen } from "./screens/ParentScreens";
import { PartTimeSubjectsScreen } from "./screens/PartTimeScreens";
import AccountsScreen from "./screens/AccountsScreen";
import { PendingScreen, RoleWelcomeScreen, SetupScreen } from "./screens/StatusScreens";
import { FullScreenSpinner } from "./components/ui";

type ProfileState =
  | { status: "loading" }
  | { status: "setup"; error: string; missing?: string[] }
  | { status: "ready"; profile: Profile };

const PORTAL_ROLES = ["super_admin", "admin", "teacher", "part_time", "bursary", "parent"];

/** Tables the portal needs. The app checks for these after sign-in and
 *  sends the user to the setup screen (with the SQL script) if any are missing. */
const REQUIRED_TABLES = [
  "classes", "students", "subjects", "student_subjects", "results",
  "reports", "attendance", "fee_items", "payments", "notices", "staff_subjects",
];

function isMissingTableError(error: { code?: string; message: string }): boolean {
  const m = error.message.toLowerCase();
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    m.includes("schema cache") ||
    m.includes("find the table") ||
    m.includes("does not exist")
  );
}

async function checkMissingTables(): Promise<string[]> {
  const results = await Promise.all(
    REQUIRED_TABLES.map(async (t) => {
      const { error } = await supabase.from(t).select("id").limit(1);
      return error && isMissingTableError(error) ? t : null;
    })
  );
  return results.filter((x): x is string => x !== null);
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState>({ status: "loading" });
  const [page, setPage] = useState<PageKey>("dashboard");

  const loadProfile = useCallback(async (user: User) => {
    setProfileState({ status: "loading" });
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      // Most commonly: the database setup script hasn't been run yet.
      setProfileState({ status: "setup", error: error.message });
      return;
    }

    let profile: Profile;

    if (data) {
      profile = data as Profile;
    } else {
      // No profile row (e.g. the auto-create trigger doesn't exist yet):
      // create a basic "pending" profile so the Super Admin can assign a role.
      const fallback: Profile = {
        id: user.id,
        email: user.email ?? "",
        full_name: (user.user_metadata?.full_name as string) ?? "",
        role: "pending",
        created_by: null,
        created_at: new Date().toISOString(),
      };
      const { error: insErr } = await supabase.from("profiles").insert(fallback);
      if (insErr) {
        setProfileState({ status: "setup", error: insErr.message });
        return;
      }
      profile = fallback;
    }

    // Make sure all the school tables exist; if not, show the setup screen
    // with the one-time SQL script (it creates whatever is missing).
    const missing = await checkMissingTables();
    if (missing.length > 0) {
      setProfileState({
        status: "setup",
        error: `Missing database tables: ${missing.join(", ")}`,
        missing,
      });
      return;
    }

    setProfileState({ status: "ready", profile });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session?.user) loadProfile(data.session.user);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) loadProfile(s.user);
      else setPage("dashboard");
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  /* ------------------------- Not signed in / loading ------------------------ */
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-4">
        <FullScreenSpinner />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-4">
        <LoginScreen />
      </div>
    );
  }

  if (profileState.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-4">
        <FullScreenSpinner />
      </div>
    );
  }

  if (profileState.status === "setup") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-4 py-8">
        <SetupScreen errorText={profileState.error} missingTables={profileState.missing} />
      </div>
    );
  }

  const profile = profileState.profile;
  const user = session.user;

  if (profile.role === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-4">
        <PendingScreen me={user} onClaimed={() => loadProfile(user)} />
      </div>
    );
  }

  if (!PORTAL_ROLES.includes(profile.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-4">
        <RoleWelcomeScreen me={user} profile={profile} />
      </div>
    );
  }

  /* ------------------------------ Portal screens ---------------------------- */
  const allowed = pagesForRole(profile.role);
  const current: PageKey = allowed.includes(page) ? page : "dashboard";
  const go = (p: PageKey) => setPage(p);

  const renderPage = () => {
    switch (current) {
      case "dashboard": return <DashboardHome me={user} profile={profile} go={go} />;
      case "admit": return <AdmitStudentScreen profile={profile} go={go} />;
      case "bulk": return <BulkUploadScreen profile={profile} />;
      case "students": return <StudentInfoScreen profile={profile} go={go} />;
      case "promotion": return <PromotionScreen profile={profile} />;
      case "subjects": return <SubjectsScreen profile={profile} />;
      case "results": return <ResultsScreen profile={profile} />;
      case "traits": return <TraitsScreen profile={profile} />;
      case "reportcards": return <ReportCardsScreen profile={profile} go={go} />;
      case "attendance": return <AttendanceScreen profile={profile} />;
      case "teachers": return <TeachersScreen />;
      case "parents": return <ParentsScreen profile={profile} />;
      case "children": return <ChildrenScreen profile={profile} go={go} />;
      case "mysubjects": return <PartTimeSubjectsScreen profile={profile} />;
      case "fees": return <FeesScreen profile={profile} />;
      case "notices": return <NoticesScreen profile={profile} />;
      case "classes": return <ClassesScreen />;
      case "accounts": return <AccountsScreen me={user} />;
      default: return <DashboardHome me={user} profile={profile} go={go} />;
    }
  };

  return (
    <DashboardLayout me={user} profile={profile} page={current} setPage={go}>
      {renderPage()}
    </DashboardLayout>
  );
}
