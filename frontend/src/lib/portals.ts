import type { Role } from "./types";

export interface PortalInfo {
  slug: string;
  title: string;
  subtitle: string;
  emailPlaceholder: string;
  icon: string;
  roles: Role[];
  tone: string;
}

export const PORTALS: PortalInfo[] = [
  { slug: "school-admin", title: "School Admin Portal", subtitle: "Manage your school's setup, people and academics", emailPlaceholder: "admin@school.com", icon: "settings", roles: ["school_admin"], tone: "bg-indigo-50 text-indigo-700" },
  { slug: "super-admin", title: "Super Admin Portal", subtitle: "Manage school workspaces and platform activity", emailPlaceholder: "admin@admin.com", icon: "shield", roles: ["super_admin"], tone: "bg-violet-50 text-violet-700" },
  { slug: "teacher", title: "Teacher Admin Portal", subtitle: "Your classes, students and marks entry", emailPlaceholder: "teacher@teacher.com", icon: "teacher", roles: ["teacher"], tone: "bg-sky-50 text-sky-700" },
  { slug: "student", title: "Student Login Portal", subtitle: "Your profile, exams, admit cards and results", emailPlaceholder: "student@student.com", icon: "student", roles: ["student"], tone: "bg-emerald-50 text-emerald-700" },
  { slug: "stre-admin", title: "Upcoming Exam Admin Portal", subtitle: "STRE talent exam registrations, payments and admit cards", emailPlaceholder: "exam@stre.com", icon: "award", roles: ["stre_admin"], tone: "bg-rose-50 text-rose-700" },
  { slug: "exam-controller", title: "Exam Controller Admin Portal", subtitle: "Exam schedules, admit cards and results", emailPlaceholder: "examcontroller@examcontroller.com", icon: "ticket", roles: ["exam_controller"], tone: "bg-amber-50 text-amber-700" },
];

export const portalBySlug = (slug: string) =>
  PORTALS.find((portal) => portal.slug === slug) ??
  (slug === "admin" ? PORTALS.find((portal) => portal.slug === "school-admin") : undefined);
