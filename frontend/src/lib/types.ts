export type Role = "super_admin" | "school_admin" | "teacher" | "student" | "exam_controller" | "stre_admin";

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  school: string | null;
  phone: string;
  profile_photo?: string | null;
  session?: { idle_minutes: number; max_hours: number; expires_at?: number };
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  school_admin: "School Admin",
  teacher: "Teacher",
  student: "Student",
  exam_controller: "Exam Controller",
  stre_admin: "Exam Portal Admin",
};
