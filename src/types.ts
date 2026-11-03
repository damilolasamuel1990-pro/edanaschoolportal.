export type Role = "super_admin" | "admin" | "teacher" | "part_time" | "bursary" | "student" | "parent" | "pending";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  created_by: string | null;
  created_at: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  teacher: "Teacher",
  part_time: "Part-Time Staff",
  bursary: "Bursary",
  student: "Student",
  parent: "Parent",
  pending: "Pending",
};

/** Roles the Super Admin can assign when creating an account. */
export const CREATABLE_ROLES: Role[] = ["admin", "teacher", "part_time", "student", "parent"];

/* ------------------------------ School data ------------------------------- */

export interface ClassRoom {
  id: string;
  name: string;
  level: string;
  sort_order: number;
  class_teacher_id: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string | null;
  class_id: string | null;
  parent_id: string | null;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string;
  address: string;
  /** Storage path of the student's passport photo, if uploaded */
  passport_path: string | null;
  status: "active" | "graduated" | "left";
  created_by: string | null;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  class_id: string;
  created_by: string | null;
  created_at: string;
}

export interface StudentSubject {
  id: string;
  student_id: string;
  subject_id: string;
}

export interface ResultRow {
  id: string;
  student_id: string;
  subject_id: string;
  term: string;
  session: string;
  /** Term total (0-100) = test_score + exam_score */
  score: number;
  test_score: number | null;
  exam_score: number | null;
  entered_by: string | null;
}

export interface ReportMeta {
  id: string;
  student_id: string;
  session: string;
  affective: Record<string, number>;
  psychomotor: Record<string, number>;
  teacher_comment: string;
  principal_comment: string;
  term_begins: string | null;
  term_ends: string | null;
  next_term_begins: string | null;
  days_opened: number | null;
  days_present: number | null;
}

export type AttendanceStatus = "present" | "absent" | "late";

export interface AttendanceRow {
  id: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  marked_by: string | null;
}

export interface FeeItem {
  id: string;
  title: string;
  amount: number;
  class_id: string | null; // null = applies to all classes
  term: string;
  session: string;
  created_at: string;
}

export interface Payment {
  id: string;
  student_id: string;
  fee_item_id: string | null;
  amount: number;
  method: string;
  reference: string;
  /** "Verified" / "Paid" (counts toward balance), "Pending Verification", "Rejected" */
  status: string;
  paid_by: string | null;
  /** Storage path of the uploaded receipt (image/PDF), if any */
  proof_path: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

/** Statuses that count as real, confirmed money. */
export const VERIFIED_STATUSES = ["Paid", "Verified"];

export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: string;
  created_by: string | null;
  created_at: string;
}
