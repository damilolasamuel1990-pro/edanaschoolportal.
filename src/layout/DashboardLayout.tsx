import { useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import {
  LayoutDashboard, UserPlus, Upload, Users, ArrowUpCircle, BookOpen, ClipboardList,
  FileText, Heart, CalendarCheck, GraduationCap, Wallet, Megaphone, School,
  ShieldCheck, Baby, Menu, X, ChevronDown, LogOut, KeyRound,
} from "lucide-react";
import { supabase } from "../supabase";
import type { Profile, Role } from "../types";
import { Logo, RoleBadge, Avatar } from "../components/ui";
import { ChangePasswordModal } from "../components/ChangePassword";

export type PageKey =
  | "dashboard" | "admit" | "bulk" | "students" | "promotion"
  | "subjects" | "results" | "traits" | "reportcards" | "attendance"
  | "teachers" | "parents" | "fees" | "notices" | "classes" | "accounts"
  | "children" | "mysubjects";

export const PAGE_TITLES: Record<PageKey, string> = {
  dashboard: "Dashboard",
  admit: "Admit Student",
  bulk: "Bulk Upload",
  students: "Student Information",
  promotion: "Student Promotion",
  subjects: "Subjects",
  results: "Input Results",
  traits: "Affective & Psychomotor",
  reportcards: "Report Cards",
  attendance: "Attendance",
  teachers: "Teachers",
  parents: "Parents",
  fees: "School Fees",
  notices: "Notice Board",
  classes: "Classes",
  accounts: "User Accounts",
  children: "My Children",
  mysubjects: "My Subjects & Results",
};

interface MenuItem {
  key: PageKey;
  label: string;
  icon: React.ElementType;
  roles: Role[];
}

interface MenuSection {
  label: string;
  items: MenuItem[];
}

const ADMIN: Role[] = ["super_admin", "admin"];
const STAFF: Role[] = ["super_admin", "admin", "teacher"];
const ALL: Role[] = ["super_admin", "admin", "teacher", "parent"];

const WITH_PART_TIME: Role[] = [...ALL, "part_time", "bursary"];

const MENU: MenuSection[] = [
  {
    label: "Main",
    items: [{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: WITH_PART_TIME }],
  },
  {
    label: "My Subjects",
    items: [{ key: "mysubjects", label: "Subjects & Results", icon: BookOpen, roles: ["part_time"] }],
  },
  {
    label: "Student",
    items: [
      { key: "admit", label: "Admit Student", icon: UserPlus, roles: STAFF },
      { key: "bulk", label: "Bulk Upload", icon: Upload, roles: ADMIN },
      { key: "students", label: "Student Information", icon: Users, roles: [...STAFF, "bursary"] },
      { key: "promotion", label: "Student Promotion", icon: ArrowUpCircle, roles: ADMIN },
    ],
  },
  {
    label: "Academics",
    items: [
      { key: "subjects", label: "Subjects", icon: BookOpen, roles: STAFF },
      { key: "results", label: "Input Results", icon: ClipboardList, roles: STAFF },
      { key: "reportcards", label: "Report Cards", icon: FileText, roles: ALL },
    ],
  },
  {
    label: "Affective Psychomotor",
    items: [{ key: "traits", label: "Traits & Comments", icon: Heart, roles: STAFF }],
  },
  {
    label: "Attendance",
    items: [{ key: "attendance", label: "Attendance", icon: CalendarCheck, roles: ALL }],
  },
  {
    label: "Teacher",
    items: [{ key: "teachers", label: "Teachers", icon: GraduationCap, roles: ADMIN }],
  },
  {
    label: "Parents",
    items: [
      { key: "children", label: "My Children", icon: Baby, roles: ["parent"] },
      { key: "parents", label: "Parents", icon: Users, roles: [...ADMIN, "bursary"] },
    ],
  },
  {
    label: "Fees",
    items: [{ key: "fees", label: "School Fees", icon: Wallet, roles: ["super_admin", "admin", "bursary", "parent"] }],
  },
  {
    label: "Notice Board",
    items: [{ key: "notices", label: "Notice Board", icon: Megaphone, roles: WITH_PART_TIME }],
  },
  {
    label: "Class",
    items: [{ key: "classes", label: "Classes", icon: School, roles: ADMIN }],
  },
  {
    label: "System",
    items: [{ key: "accounts", label: "User Accounts", icon: KeyRound, roles: ["super_admin"] }],
  },
];

export function pagesForRole(role: Role): PageKey[] {
  const pages: PageKey[] = [];
  MENU.forEach((s) => s.items.forEach((i) => { if (i.roles.includes(role)) pages.push(i.key); }));
  return pages;
}

export default function DashboardLayout({
  me, profile, page, setPage, children,
}: {
  me: User;
  profile: Profile;
  page: PageKey;
  setPage: (p: PageKey) => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const sections = MENU
    .map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(profile.role)) }))
    .filter((s) => s.items.length > 0);

  const isOpen = (label: string) => openSections[label] ?? true;

  const sidebar = (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#0a4da8] to-[#083d86] text-white">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-5 border-b border-white/15">
        <span className="bg-white rounded-full p-1 shrink-0">
          <Logo size="w-10 h-10" />
        </span>
        <div className="min-w-0">
          <p className="font-bold leading-tight tracking-wide">EDANA Schools</p>
          <p className="text-[11px] text-blue-200 truncate leading-tight">{me.email}</p>
        </div>
        <button className="ml-auto lg:hidden text-white/80 hover:text-white" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {sections.map((section) => {
          const open = isOpen(section.label);
          return (
            <div key={section.label} className="mb-1">
              <button
                onClick={() => setOpenSections((p) => ({ ...p, [section.label]: !open }))}
                className="w-full flex items-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-200 hover:text-white transition"
              >
                <span className="mr-auto">{section.label}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
              </button>
              {open && (
                <div className="space-y-0.5 mb-2">
                  {section.items.map((item) => {
                    const active = item.key === page;
                    return (
                      <button
                        key={item.key}
                        onClick={() => { setPage(item.key); setMobileOpen(false); }}
                        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                          active ? "bg-white text-[#0a4da8] font-semibold shadow-sm" : "text-blue-50 hover:bg-white/10"
                        }`}
                      >
                        <item.icon className="w-[18px] h-[18px] shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="border-t border-white/15 px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar name={profile.full_name} email={profile.email} className="h-9 w-9 text-xs bg-white/15 text-white" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{profile.full_name || "Edana User"}</p>
            <p className="text-[11px] text-blue-200 leading-tight">{profile.role.replace("_", " ").toUpperCase()}</p>
          </div>
        </div>
        <button
          onClick={() => setPwOpen(true)}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-blue-50 hover:bg-white/10 transition"
        >
          <KeyRound className="w-[18px] h-[18px]" /> Change Password
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-blue-50 hover:bg-white/10 transition"
        >
          <LogOut className="w-[18px] h-[18px]" /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-slate-100 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-72 shrink-0 h-screen sticky top-0">{sidebar}</aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] shadow-xl">{sidebar}</aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3 print:hidden">
          <button className="lg:hidden text-slate-600 hover:text-slate-900" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="w-6 h-6" />
          </button>
          <div className="mr-auto min-w-0">
            <h1 className="font-bold text-slate-900 leading-tight truncate">{PAGE_TITLES[page]}</h1>
            <p className="text-xs text-slate-500 leading-tight hidden sm:block">Edana Schools · Raising to Greatness</p>
          </div>
          <div className="hidden md:block text-right">
            <p className="text-sm font-medium text-slate-800 leading-tight">{profile.full_name || me.email}</p>
            <p className="text-xs text-slate-500 leading-tight">{me.email}</p>
          </div>
          <RoleBadge role={profile.role} />
          <span className="hidden sm:block">
            <ShieldCheck className="w-5 h-5 text-[#0a4da8]" />
          </span>
        </header>
        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto print:p-0 print:max-w-none">{children}</main>
      </div>

      {pwOpen && <ChangePasswordModal email={me.email ?? ""} onClose={() => setPwOpen(false)} />}
    </div>
  );
}
