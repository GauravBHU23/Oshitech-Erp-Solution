import { api } from "./api";
import type { Role, Row, User } from "./types";
import { createElement, type ReactNode } from "react";

const AUDIT_FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone number",
  qualification: "Qualification",
  is_public: "Public profile visibility",
  email: "Email address",
  role: "Portal role",
  name: "Name",
  status: "Status",
  course: "Course",
  subject: "Subject",
  academic_year: "Academic year",
  classroom: "Classroom",
  date: "Date",
  start_date: "Start date",
  end_date: "End date",
  marks_obtained: "Marks",
  is_absent: "Absent status",
  remarks: "Remarks",
};

function auditFieldNames(fields: string[]) {
  const names = new Set(fields);
  const labels: string[] = [];
  if (names.has("first_name") || names.has("last_name")) labels.push("Name");
  for (const field of fields) {
    if (field === "first_name" || field === "last_name") continue;
    labels.push(AUDIT_FIELD_LABELS[field] ?? field.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()));
  }
  return [...new Set(labels)].join(", ");
}

export interface Field {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "date" | "time" | "number" | "select" | "checkbox" | "textarea" | "file" | "pdf";
  required?: boolean;
  optionalOnEdit?: boolean;
  createOnly?: boolean; // edit form me nahi dikhega
  editOnly?: boolean; // sirf edit form me
  fromUser?: boolean; // edit ke waqt row.user[name] se prefill
  from?: string; // dropdown options endpoint
  options?: { value: string; label: string }[];
  default?: string | boolean;
  roles?: Role[]; // sirf in roles ko field dikhega (super admin ko hamesha)
}

export interface FilterDef {
  param: string;
  label: string;
  from?: string;
  options?: { value: string; label: string }[];
}

export interface ToolbarAction {
  label: string;
  roles: Role[];
  confirm?: string;
  run: () => Promise<string>;
}

export interface Column {
  key: string;
  label: string;
  fk?: string; // endpoint: id ko label me badalne ke liye
  render?: (row: Row) => ReactNode;
}

export interface RowAction {
  label: string;
  roles: Role[];
  confirm?: string;
  fields?: Field[];
  show?: (row: Row, user?: User | null) => boolean;
  run: (row: Row, values: Record<string, unknown>) => Promise<string>;
}

export interface Resource {
  key: string;
  title: string;
  endpoint: string;
  columns: Column[];
  fields: Field[];
  writeRoles: Role[];
  deleteRoles?: Role[];
  canDelete?: boolean;
  search?: boolean;
  filter?: FilterDef;
  filters?: FilterDef[];
  actions?: RowAction[];
  toolbarActions?: ToolbarAction[];
  createRoles?: Role[]; // "+ Add" kaun dekh sakta hai (default: writeRoles)
  rowEditable?: (row: Row, user: User) => boolean; // Edit/Delete button kis row par dikhe
  platform?: boolean; // school se nahi juda (jaise STRE) — school field/column nahi
}

export const CLASS_LEVELS = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: "Class " + (index + 1) }));
export const classLabel = (value: unknown) => (value ? "Class " + value : "—");
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((value) => ({ value, label: value }));
export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const rupees = (value: unknown) => "₹" + Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const CLASS_OR_ALL = (label: string) => ({ name: "class_level", label, type: "select" as const, options: CLASS_LEVELS });
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, i) => ({ value: String(i + 1), label }));
const FEE_STATUS: Record<string, [string, "green" | "amber" | "red" | "slate"]> = { paid: ["Paid", "green"], partial: ["Partly paid", "amber"], overdue: ["Overdue", "red"], unpaid: ["Unpaid", "slate"] };
const ACTIVE_FILTER = { param: "is_active", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] };
export const statusPill = (value: string, tone: "green" | "amber" | "slate" | "red" | "indigo") =>
  createElement("span", { className: "status-pill status-pill--" + tone }, value);
const activePill = (r: Row) => (r.is_active ? statusPill("Active", "green") : statusPill("Inactive", "slate"));

const ADMIN: Role[] = ["school_admin"];
const EXAM: Role[] = ["school_admin", "exam_controller"];
const MARKS: Role[] = ["school_admin", "exam_controller", "teacher"];

const COURSES = "/academics/courses/";
const YEARS = "/academics/academic-years/";
const SUBJECTS = "/academics/subjects/";
const CLASSROOMS = "/academics/classrooms/";
const TEACHERS = "/teachers/";
const STUDENTS = "/students/";
const EXAMS = "/exams/exams/";
const ASSIGNMENTS = "/academics/teaching-assignments/";

const yn = (v: unknown) => (v ? "Yes" : "No");
const person = (row: Row) => {
  const name = `${row.user?.first_name ?? ""} ${row.user?.last_name ?? ""}`.trim() || "—";
  const photo = row.user?.profile_photo;
  const initial = name === "—" ? "?" : name.slice(0, 1).toUpperCase();
  return createElement("span", { className: "inline-flex min-w-0 items-center gap-2.5" },
    photo
      ? createElement("img", { src: photo, alt: "", className: "h-8 w-8 shrink-0 rounded-full border border-slate-200 object-cover" })
      : createElement("span", { className: "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700" }, initial),
    createElement("span", { className: "truncate" }, name),
  );
};
const auditDetails = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "No change details";
  const changes = value as Record<string, unknown>;
  const fields = Array.isArray(changes.fields)
    ? changes.fields.filter((field): field is string => typeof field === "string")
    : [];
  const labels: Record<string, string> = {
    first_name: "First name",
    last_name: "Last name",
    phone: "Phone",
    email: "Email",
    is_active: "Status",
  };
  if (fields.length) {
    return `${fields.map((field) => labels[field] ?? field.replaceAll("_", " ")).join(", ")} updated`;
  }
  const entries = Object.entries(changes);
  if (!entries.length) return "No change details";
  return entries.map(([key, item]) => `${labels[key] ?? key.replaceAll("_", " ")}: ${String(item)}`).join(" | ");
};

const userFields: Field[] = [
  { name: "profile_photo", label: "Profile photo (JPG, PNG, GIF or WebP; max 5 MB)", type: "file" },
  { name: "first_name", label: "First name", required: true, fromUser: true },
  { name: "last_name", label: "Last name", fromUser: true },
  { name: "email", label: "Login email", type: "email", required: true, fromUser: true },
  { name: "password", label: "Password (min 10 chars)", type: "password", required: true, createOnly: true },
];

const list: Resource[] = [
  {
    key: "schools",
    title: "Schools",
    endpoint: "/schools/",
    search: true,
    writeRoles: ADMIN,
    createRoles: [],
    deleteRoles: [],
    canDelete: true,
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "city", label: "City", render: (r) => r.city || "—" },
      { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
      { key: "plan", label: "Plan", render: (r) => (r.plan === "premium" ? "Premium" : "Standard") },
      { key: "is_active", label: "Status", render: activePill },
    ],
    fields: [
      { name: "name", label: "School / college name", required: true },
      { name: "code", label: "School code (students use it to register)", required: true, createOnly: true },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone" },
      { name: "address", label: "Address (printed on ID & admit cards)", type: "textarea" },
      { name: "city", label: "City" },
      { name: "state", label: "State" },
      { name: "pincode", label: "PIN code" },
      {
        name: "plan",
        label: "Plan",
        type: "select",
        required: true,
        default: "standard",
        roles: [],
        options: [
          { value: "standard", label: "Standard" },
          { value: "premium", label: "Premium" },
        ],
      },
      { name: "is_active", label: "Active", type: "checkbox", default: true, roles: [] },
    ],
    actions: [
      {
        label: "Create admin",
        roles: ["super_admin"],
        fields: [
          { name: "first_name", label: "First name", required: true },
          { name: "last_name", label: "Last name" },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "profile_photo", label: "Profile photo (JPG, PNG, GIF or WebP; max 5 MB)", type: "file" },
          { name: "password", label: "Password (min 10 chars)", type: "password", required: true },
        ],
        run: async (row, values) => {
          await api(`/schools/${row.id}/create-admin/`, { method: "POST", body: values });
          return "School administrator created.";
        },
      },
    ],
  },
  {
    key: "academic-years",
    title: "Academic Years",
    endpoint: YEARS,
    writeRoles: ADMIN,
    canDelete: true,
    columns: [
      { key: "name", label: "Year" },
      { key: "start_date", label: "Start" },
      { key: "end_date", label: "End" },
      { key: "is_current", label: "Current", render: (r) => (r.is_current ? statusPill("Current", "green") : "—") },
    ],
    fields: [
      { name: "name", label: "Name (e.g. 2026-27)", required: true },
      { name: "start_date", label: "Start date", type: "date", required: true },
      { name: "end_date", label: "End date", type: "date", required: true },
      { name: "is_current", label: "Current year (only one year can be current)", type: "checkbox" },
    ],
  },
  {
    key: "courses",
    title: "Courses",
    endpoint: COURSES,
    search: true,
    writeRoles: ADMIN,
    canDelete: true,
    columns: [
      { key: "name", label: "Class / course" },
      { key: "code", label: "Code" },
      { key: "subject_count", label: "Subjects" },
      { key: "is_active", label: "Status", render: activePill },
    ],
    toolbarActions: [
      {
        label: "Create Class 1–12",
        roles: ADMIN,
        confirm: "Create Class 1 to Class 12 with their common subjects? Classes and subjects that already exist are kept.",
        run: async () => (await api<{ detail: string }>("/academics/courses/seed-classes/", { method: "POST", body: { with_subjects: true } })).detail,
      },
    ],
    fields: [
      { name: "name", label: "Class / course name (e.g. Class 10, B.Sc. Physics)", required: true },
      { name: "code", label: "Code", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "subjects",
    title: "Subjects",
    endpoint: SUBJECTS,
    search: true,
    writeRoles: ADMIN,
    canDelete: true,
    filter: { param: "course", label: "Class", from: COURSES },
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "course", label: "Class / course", render: (r) => r.course_name ?? "—" },
    ],
    fields: [
      { name: "course", label: "Class / course", type: "select", required: true, from: COURSES },
      { name: "name", label: "Subject name", required: true },
      { name: "code", label: "Code", required: true },
    ],
  },
  {
    key: "classrooms",
    title: "Classrooms",
    endpoint: CLASSROOMS,
    writeRoles: ADMIN,
    canDelete: true,
    filters: [{ param: "course", label: "Class", from: COURSES }, { param: "academic_year", label: "Year", from: YEARS }],
    columns: [
      { key: "course", label: "Class / course", render: (r) => r.course_name ?? "—" },
      { key: "section", label: "Section", render: (r) => r.section || "—" },
      { key: "academic_year", label: "Year", render: (r) => r.academic_year_name ?? "—" },
      { key: "class_teacher", label: "Class teacher", render: (r) => r.class_teacher_name || "—" },
      { key: "capacity", label: "Students", render: (r) => (r.student_count ?? 0) + " / " + r.capacity },
    ],
    fields: [
      { name: "course", label: "Class / course", type: "select", required: true, from: COURSES },
      { name: "academic_year", label: "Academic year", type: "select", required: true, from: YEARS },
      { name: "section", label: "Section (A, B...)" },
      { name: "capacity", label: "Capacity", type: "number", default: "40" },
      { name: "class_teacher", label: "Class teacher", type: "select", from: TEACHERS },
    ],
  },
  {
    key: "teaching-assignments",
    title: "Teacher Assignments",
    endpoint: ASSIGNMENTS,
    writeRoles: ADMIN,
    canDelete: true,
    filters: [{ param: "teacher", label: "Teacher", from: TEACHERS }, { param: "classroom", label: "Classroom", from: CLASSROOMS }],
    columns: [
      { key: "teacher", label: "Teacher", render: (r) => r.teacher_name ?? "—" },
      { key: "classroom", label: "Classroom", render: (r) => r.classroom_name ?? "—" },
      { key: "subject", label: "Subject", render: (r) => r.subject_name ?? "—" },
    ],
    fields: [
      { name: "teacher", label: "Teacher", type: "select", required: true, from: TEACHERS },
      { name: "classroom", label: "Classroom", type: "select", required: true, from: CLASSROOMS },
      { name: "subject", label: "Subject", type: "select", required: true, from: SUBJECTS },
    ],
  },
  {
    key: "teachers",
    title: "Teachers",
    endpoint: TEACHERS,
    search: true,
    writeRoles: ADMIN,
    canDelete: true,
    columns: [
      { key: "employee_id", label: "Employee ID" },
      { key: "name", label: "Name", render: person },
      { key: "email", label: "Email", render: (r) => r.user?.email ?? "" },
      { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
      { key: "is_active", label: "Status", render: activePill },
    ],
    filters: [ACTIVE_FILTER],
    fields: [
      { name: "employee_id", label: "Employee ID", required: true },
      ...userFields,
      { name: "phone", label: "Phone" },
      { name: "qualification", label: "Qualification" },
      { name: "joining_date", label: "Joining date", type: "date" },
      { name: "is_public", label: "Show on public teacher directory", type: "checkbox", default: true },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "students",
    title: "Students",
    endpoint: STUDENTS,
    search: true,
    writeRoles: ADMIN,
    canDelete: true,
    filters: [{ param: "class_level", label: "Class", options: CLASS_LEVELS }, { param: "classroom", label: "Section", from: CLASSROOMS }, ACTIVE_FILTER],
    columns: [
      { key: "admission_no", label: "Admission no." },
      { key: "name", label: "Name", render: person },
      { key: "class_level", label: "Class", render: (r) => classLabel(r.class_level) },
      { key: "classroom", label: "Section", render: (r) => r.classroom_name || statusPill("Not placed", "amber") },
      { key: "roll_no", label: "Roll", render: (r) => r.roll_no || "—" },
      { key: "father_name", label: "Father / Mother", render: (r) => createElement("span", null, createElement("span", { className: "block" }, r.father_name || "—"), createElement("span", { className: "block text-xs text-slate-500" }, r.mother_name || "—")) },
      { key: "guardian_phone", label: "Parent phone", render: (r) => r.guardian_phone || "—" },
      { key: "is_active", label: "Status", render: activePill },
    ],
    fields: [
      { name: "admission_no", label: "Admission no.", required: true },
      { name: "roll_no", label: "Roll no." },
      { name: "class_level", label: "Class", type: "select", required: true, optionalOnEdit: true, options: CLASS_LEVELS },
      { name: "classroom", label: "Classroom / section", type: "select", from: CLASSROOMS },
      ...userFields,
      { name: "date_of_birth", label: "Date of birth", type: "date" },
      {
        name: "gender",
        label: "Gender",
        type: "select",
        options: [
          { value: "M", label: "Male" },
          { value: "F", label: "Female" },
          { value: "O", label: "Other" },
        ],
      },
      { name: "blood_group", label: "Blood group (printed on ID card)", type: "select", options: BLOOD_GROUPS },
      { name: "father_name", label: "Father's name", required: true, optionalOnEdit: true },
      { name: "mother_name", label: "Mother's name", required: true, optionalOnEdit: true },
      { name: "guardian_phone", label: "Parent phone" },
      { name: "address", label: "Address", type: "textarea" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "exams",
    title: "Exams",
    endpoint: EXAMS,
    search: true,
    writeRoles: EXAM,
    deleteRoles: ADMIN,
    canDelete: true,
    columns: [
      { key: "name", label: "Exam" },
      { key: "course", label: "Class / course", render: (r) => r.course_name ?? "—" },
      { key: "start_date", label: "Start" },
      { key: "end_date", label: "End" },
      { key: "status", label: "Status", render: (r) => statusPill(({ draft: "Draft", scheduled: "Scheduled", ongoing: "Ongoing", completed: "Completed" } as Record<string, string>)[r.status] ?? String(r.status), r.status === "completed" ? "slate" : r.status === "draft" ? "amber" : "indigo") },
      {
        key: "results_published",
        label: "Result",
        render: (r) => (r.results_published ? statusPill("Published (locked)", "green") : statusPill("Not published", "slate")),
      },
    ],
    filters: [
      { param: "course", label: "Class", from: COURSES },
      { param: "status", label: "Status", options: [{ value: "draft", label: "Draft" }, { value: "scheduled", label: "Scheduled" }, { value: "ongoing", label: "Ongoing" }, { value: "completed", label: "Completed" }] },
    ],
    fields: [
      { name: "name", label: "Exam name", required: true },
      { name: "course", label: "Class / course", type: "select", required: true, from: COURSES },
      { name: "academic_year", label: "Academic year", type: "select", required: true, from: YEARS },
      { name: "start_date", label: "Start date", type: "date", required: true },
      { name: "end_date", label: "End date", type: "date", required: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        default: "draft",
        options: [
          { value: "draft", label: "Draft (not visible to students)" },
          { value: "scheduled", label: "Scheduled" },
          { value: "ongoing", label: "Ongoing" },
          { value: "completed", label: "Completed" },
        ],
      },
    ],
    actions: [
      {
        label: "Generate admit cards",
        roles: EXAM,
        confirm: "Generate admit cards for all students in this exam? Continue?",
        run: async (row) => {
          const r = await api<{ created: number; total_students: number }>(
            `/exams/exams/${row.id}/generate-admit-cards/`,
            { method: "POST" }
          );
          return `${r.created} admit cards generated for ${r.total_students} students.`;
        },
      },
      {
        label: "Publish results",
        roles: EXAM,
        show: (r) => !r.results_published,
        confirm: "Publishing locks the results and makes them visible to students. Continue?",
        run: async (row) => {
          await api(`/exams/exams/${row.id}/publish-results/`, { method: "POST" });
          return "Results published and locked.";
        },
      },
      {
        label: "Unlock results",
        roles: ADMIN,
        show: (r) => !!r.results_locked,
        confirm: "This will unpublish and unlock the results. The action will be recorded in the audit log. Continue?",
        run: async (row) => {
          await api(`/exams/exams/${row.id}/unlock-results/`, { method: "POST" });
          return "Results unlocked.";
        },
      },
    ],
  },
  {
    key: "schedules",
    title: "Exam Schedule",
    endpoint: "/exams/schedules/",
    writeRoles: EXAM,
    deleteRoles: ADMIN,
    canDelete: true,
    filter: { param: "exam", label: "Exam", from: EXAMS },
    columns: [
      { key: "exam", label: "Exam", render: (r) => r.exam_name ?? "—" },
      { key: "subject", label: "Subject", render: (r) => r.subject_name ?? "—" },
      { key: "date", label: "Date" },
      { key: "start_time", label: "Start", render: (r) => String(r.start_time ?? "").slice(0, 5) },
      { key: "end_time", label: "End", render: (r) => String(r.end_time ?? "").slice(0, 5) },
      { key: "max_marks", label: "Max / Pass", render: (r) => r.max_marks + " / " + r.pass_marks },
      { key: "venue", label: "Venue", render: (r) => r.venue || "—" },
    ],
    fields: [
      { name: "exam", label: "Exam", type: "select", required: true, from: EXAMS },
      { name: "subject", label: "Subject", type: "select", required: true, from: SUBJECTS },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "start_time", label: "Start time", type: "time", required: true },
      { name: "end_time", label: "End time", type: "time", required: true },
      { name: "max_marks", label: "Max marks", type: "number", default: "100" },
      { name: "pass_marks", label: "Pass marks", type: "number", default: "33" },
      { name: "venue", label: "Venue" },
    ],
  },
  {
    key: "results",
    title: "Results",
    endpoint: "/exams/results/",
    writeRoles: MARKS,
    deleteRoles: ADMIN,
    canDelete: true,
    search: true,
    filters: [{ param: "exam", label: "Exam", from: EXAMS }, { param: "subject", label: "Subject", from: SUBJECTS }],
    columns: [
      { key: "exam", label: "Exam", render: (r) => r.exam_name ?? "—" },
      { key: "student", label: "Student", render: (r) => (r.student_name || "—") + (r.admission_no ? " (" + r.admission_no + ")" : "") },
      { key: "subject", label: "Subject", render: (r) => r.subject_name ?? "—" },
      { key: "marks_obtained", label: "Marks", render: (r) => (r.is_absent ? statusPill("Absent", "red") : Number(r.marks_obtained ?? 0) + (r.max_marks ? " / " + r.max_marks : "")) },
      { key: "result", label: "Result", render: (r) => (r.is_absent || r.pass_marks == null ? "—" : Number(r.marks_obtained) >= Number(r.pass_marks) ? statusPill("Pass", "green") : statusPill("Fail", "red")) },
      { key: "remarks", label: "Remarks", render: (r) => r.remarks || "—" },
    ],
    fields: [
      { name: "exam", label: "Exam", type: "select", required: true, from: EXAMS },
      { name: "student", label: "Student", type: "select", required: true, from: STUDENTS },
      { name: "subject", label: "Subject", type: "select", required: true, from: SUBJECTS },
      { name: "marks_obtained", label: "Marks obtained", type: "number" },
      { name: "is_absent", label: "Absent", type: "checkbox" },
      { name: "remarks", label: "Remarks" },
    ],
  },

  {
    key: "notices",
    title: "Notice Board",
    endpoint: "/notices/",
    search: true,
    writeRoles: ["school_admin", "exam_controller"],
    canDelete: true,
    filters: [
      { param: "category", label: "Type", options: [{ value: "notice", label: "Notice" }, { value: "circular", label: "Circular" }, { value: "holiday", label: "Holiday" }, { value: "event", label: "Event" }, { value: "exam", label: "Exam" }] },
    ],
    columns: [
      { key: "title", label: "Title", render: (r) => createElement("span", { className: "font-medium" }, (r.is_pinned ? "📌 " : "") + r.title) },
      { key: "category", label: "Type", render: (r) => statusPill(String(r.category).replace(/^./, (c: string) => c.toUpperCase()), r.category === "holiday" ? "green" : r.category === "exam" ? "amber" : "indigo") },
      { key: "audience", label: "For", render: (r) => ({ all: "Everyone", students: "Students", teachers: "Teachers", staff: "All staff" } as Record<string, string>)[r.audience] + (r.class_level ? " · Class " + r.class_level : "") },
      { key: "event_date", label: "Date", render: (r) => (r.event_date ? r.event_date + (r.end_date && r.end_date !== r.event_date ? " → " + r.end_date : "") : "—") },
      { key: "publish_on", label: "Published" },
      { key: "is_public", label: "Website", render: (r) => (r.is_public ? statusPill("On homepage", "green") : "—") },
      { key: "body", label: "Details", render: (r) => createElement("span", { className: "block max-w-xs truncate", title: r.body }, r.body || "—") },
      { key: "attachment_url", label: "PDF", render: (r) => (r.attachment_url ? createElement("a", { href: r.attachment_url, target: "_blank", rel: "noopener", className: "font-semibold text-indigo-600 hover:underline" }, "View PDF") : "—") },
    ],
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "body", label: "Details", type: "textarea" },
      { name: "attachment", label: "Attach PDF (optional, max 10 MB) — anyone who sees this notice can open it", type: "pdf" },
      { name: "remove_attachment", label: "Remove the attached PDF", type: "checkbox", editOnly: true },
      { name: "category", label: "Type", type: "select", required: true, default: "notice", options: [{ value: "notice", label: "Notice" }, { value: "circular", label: "Circular" }, { value: "holiday", label: "Holiday" }, { value: "event", label: "Event" }, { value: "exam", label: "Exam" }] },
      { name: "audience", label: "Who should see it", type: "select", required: true, default: "all", options: [{ value: "all", label: "Everyone" }, { value: "students", label: "Students" }, { value: "teachers", label: "Teachers" }, { value: "staff", label: "All staff" }] },
      CLASS_OR_ALL("Only for class (leave empty for all classes)"),
      { name: "event_date", label: "Holiday / event date", type: "date" },
      { name: "end_date", label: "Ends on (for multi-day holidays)", type: "date" },
      { name: "publish_on", label: "Publish on", type: "date", required: true, default: today() },
      { name: "expires_on", label: "Hide after", type: "date" },
      { name: "is_pinned", label: "Pin to top", type: "checkbox" },
      { name: "is_public", label: "Show on website homepage (notice board & scrolling ticker)", type: "checkbox", roles: ["school_admin", "exam_controller"] },
    ],
  },
  {
    key: "timetable",
    title: "Timetable Setup",
    endpoint: "/timetable/",
    writeRoles: ADMIN,
    canDelete: true,
    filters: [{ param: "classroom", label: "Classroom", from: CLASSROOMS }, { param: "day", label: "Day", options: DAYS }],
    columns: [
      { key: "day", label: "Day", render: (r) => r.day_name },
      { key: "period", label: "Period" },
      { key: "start_time", label: "Time", render: (r) => String(r.start_time).slice(0, 5) + "–" + String(r.end_time).slice(0, 5) },
      { key: "classroom", label: "Classroom", render: (r) => r.classroom_name },
      { key: "subject", label: "Subject", render: (r) => r.subject_name },
      { key: "teacher", label: "Teacher", render: (r) => r.teacher_name || "—" },
      { key: "room", label: "Room", render: (r) => r.room || "—" },
    ],
    fields: [
      { name: "classroom", label: "Classroom", type: "select", required: true, from: CLASSROOMS },
      { name: "day", label: "Day", type: "select", required: true, options: DAYS },
      { name: "period", label: "Period number", type: "number", required: true, default: "1" },
      { name: "start_time", label: "Start time", type: "time", required: true },
      { name: "end_time", label: "End time", type: "time", required: true },
      { name: "subject", label: "Subject", type: "select", required: true, from: SUBJECTS },
      { name: "teacher", label: "Teacher", type: "select", from: TEACHERS },
      { name: "room", label: "Room" },
    ],
  },
  {
    key: "homework",
    title: "Homework",
    endpoint: "/homework/",
    search: true,
    writeRoles: ["school_admin", "teacher"],
    canDelete: true,
    rowEditable: (row, user) => user.role !== "teacher" || row.assigned_by === user.id,
    filters: [{ param: "classroom", label: "Classroom", from: CLASSROOMS }, { param: "subject", label: "Subject", from: SUBJECTS }],
    columns: [
      { key: "title", label: "Homework", render: (r) => createElement("span", { className: "block max-w-xs" }, createElement("b", { className: "block font-medium" }, r.title), r.description ? createElement("span", { className: "block truncate text-xs text-slate-500", title: r.description }, r.description) : null) },
      { key: "classroom", label: "Class", render: (r) => r.classroom_name },
      { key: "subject", label: "Subject", render: (r) => r.subject_name },
      { key: "assigned_on", label: "Given on" },
      { key: "due_date", label: "Due", render: (r) => (r.due_date < today() ? statusPill(r.due_date + " · closed", "slate") : statusPill(r.due_date, r.due_date === today() ? "amber" : "indigo")) },
      { key: "assigned_by", label: "By", render: (r) => r.assigned_by_name || "—" },
    ],
    fields: [
      { name: "classroom", label: "Classroom", type: "select", required: true, from: CLASSROOMS },
      { name: "subject", label: "Subject", type: "select", required: true, from: SUBJECTS },
      { name: "title", label: "Title", required: true },
      { name: "description", label: "Instructions", type: "textarea" },
      { name: "assigned_on", label: "Given on", type: "date", required: true, default: today() },
      { name: "due_date", label: "Submit by", type: "date", required: true },
    ],
  },
  {
    key: "leave-requests",
    title: "Leave Requests",
    endpoint: "/leave-requests/",
    writeRoles: ["school_admin", "teacher", "student", "exam_controller"],
    canDelete: true,
    rowEditable: (row, user) => row.applicant === user.id && row.status === "pending",
    filters: [{ param: "status", label: "Status", options: [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }] }],
    columns: [
      { key: "applicant", label: "Applicant", render: (r) => createElement("span", null, createElement("b", { className: "block font-medium" }, r.applicant_name), createElement("span", { className: "block text-xs text-slate-500" }, String(r.applicant_role).replace("_", " ") + (r.student_class ? " · " + r.student_class : ""))) },
      { key: "from_date", label: "From" },
      { key: "to_date", label: "To" },
      { key: "days", label: "Days" },
      { key: "reason", label: "Reason", render: (r) => createElement("span", { className: "block max-w-xs truncate", title: r.reason }, r.reason) },
      { key: "status", label: "Status", render: (r) => statusPill(String(r.status).replace(/^./, (c: string) => c.toUpperCase()), r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "amber") },
      { key: "review_note", label: "Remark", render: (r) => (r.review_note ? r.review_note + (r.reviewed_by_name ? " — " + r.reviewed_by_name : "") : r.reviewed_by_name || "—") },
    ],
    fields: [
      { name: "from_date", label: "From", type: "date", required: true, default: today() },
      { name: "to_date", label: "To", type: "date", required: true, default: today() },
      { name: "reason", label: "Reason", type: "textarea", required: true },
    ],
    actions: [
      {
        label: "Approve",
        roles: ["school_admin", "teacher"],
        show: (r, user) => r.status === "pending" && r.applicant !== user?.id && (user?.role !== "teacher" || r.applicant_role === "student"),
        fields: [{ name: "review_note", label: "Remark (optional)" }],
        run: async (row, values) => { await api("/leave-requests/" + row.id + "/approve/", { method: "POST", body: values }); return "Leave approved."; },
      },
      {
        label: "Reject",
        roles: ["school_admin", "teacher"],
        show: (r, user) => r.status === "pending" && r.applicant !== user?.id && (user?.role !== "teacher" || r.applicant_role === "student"),
        fields: [{ name: "review_note", label: "Reason for rejection" }],
        run: async (row, values) => { await api("/leave-requests/" + row.id + "/reject/", { method: "POST", body: values }); return "Leave rejected."; },
      },
    ],
  },
  {
    key: "fee-structures",
    title: "Fee Structure",
    endpoint: "/fee-structures/",
    search: true,
    writeRoles: ADMIN,
    canDelete: true,
    filters: [{ param: "class_level", label: "Class", options: CLASS_LEVELS }],
    columns: [
      { key: "name", label: "Fee" },
      { key: "class_level", label: "Class", render: (r) => (r.class_level ? "Class " + r.class_level : "All classes") },
      { key: "academic_year", label: "Year", render: (r) => r.academic_year_name || "—" },
      { key: "amount", label: "Amount", render: (r) => rupees(r.amount) },
      { key: "due_date", label: "Due date" },
      { key: "invoice_count", label: "Invoices" },
      { key: "is_active", label: "Status", render: activePill },
    ],
    fields: [
      { name: "name", label: "Fee name (e.g. Tuition fee – April)", required: true },
      { name: "academic_year", label: "Academic year", type: "select", from: YEARS },
      CLASS_OR_ALL("Class (leave empty for all classes)"),
      { name: "amount", label: "Amount (₹)", type: "number", required: true },
      { name: "due_date", label: "Due date", type: "date", required: true },
      { name: "description", label: "Description" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
    actions: [
      {
        label: "Generate invoices",
        roles: ADMIN,
        show: (r) => !!r.is_active,
        confirm: "Create an invoice of this fee for every active student of this class? Students who already have it are skipped.",
        run: async (row) => (await api<{ detail: string }>("/fee-structures/" + row.id + "/generate-invoices/", { method: "POST" })).detail,
      },
    ],
  },
  {
    key: "fee-invoices",
    title: "Fee Invoices",
    endpoint: "/fee-invoices/",
    search: true,
    writeRoles: ADMIN,
    canDelete: true,
    filters: [
      { param: "student__class_level", label: "Class", options: CLASS_LEVELS },
      { param: "status", label: "Status", options: [{ value: "unpaid", label: "Unpaid" }, { value: "partial", label: "Partly paid" }, { value: "overdue", label: "Overdue" }, { value: "paid", label: "Paid" }] },
    ],
    columns: [
      { key: "invoice_no", label: "Invoice" },
      { key: "student", label: "Student", render: (r) => createElement("span", null, createElement("b", { className: "block font-medium" }, r.student_name), createElement("span", { className: "block text-xs text-slate-500" }, r.admission_no + (r.class_level ? " · Class " + r.class_level : ""))) },
      { key: "title", label: "Fee" },
      { key: "total", label: "Total", render: (r) => rupees(r.total) },
      { key: "paid", label: "Paid", render: (r) => rupees(r.paid) },
      { key: "balance", label: "Balance", render: (r) => rupees(r.balance) },
      { key: "due_date", label: "Due" },
      { key: "status", label: "Status", render: (r) => statusPill(...(FEE_STATUS[r.status] ?? [String(r.status), "slate"])) },
    ],
    fields: [
      { name: "student", label: "Student", type: "select", required: true, from: STUDENTS, createOnly: true },
      { name: "title", label: "Fee title", required: true },
      { name: "amount", label: "Amount (₹)", type: "number", required: true },
      { name: "discount", label: "Discount / scholarship (₹)", type: "number", default: "0" },
      { name: "fine", label: "Late fine (₹)", type: "number", default: "0" },
      { name: "due_date", label: "Due date", type: "date", required: true },
      { name: "notes", label: "Notes" },
    ],
    actions: [
      {
        label: "Record payment",
        roles: ADMIN,
        show: (r) => Number(r.balance) > 0,
        fields: [
          { name: "amount", label: "Amount received (₹)", type: "number", required: true },
          { name: "mode", label: "Payment mode", type: "select", required: true, default: "cash", options: [{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }, { value: "bank", label: "Bank transfer" }, { value: "cheque", label: "Cheque" }, { value: "online", label: "Online" }] },
          { name: "paid_on", label: "Payment date", type: "date", required: true, default: today() },
          { name: "reference", label: "Reference / transaction no." },
        ],
        run: async (row, values) => {
          const pay = await api<{ id: string; receipt_no: string }>("/fee-payments/", { method: "POST", body: { ...(values as Record<string, unknown>), invoice: row.id } });
          return "Payment saved. Receipt " + pay.receipt_no + " — open Fee Payments to print it.";
        },
      },
    ],
  },
  {
    key: "fee-payments",
    title: "Fee Payments",
    endpoint: "/fee-payments/",
    search: true,
    writeRoles: ADMIN,
    createRoles: [],
    canDelete: true,
    filters: [{ param: "mode", label: "Mode", options: [{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }, { value: "bank", label: "Bank transfer" }, { value: "cheque", label: "Cheque" }, { value: "online", label: "Online" }] }],
    columns: [
      { key: "receipt_no", label: "Receipt" },
      { key: "paid_on", label: "Date" },
      { key: "student", label: "Student", render: (r) => r.student_name + " (" + r.admission_no + ")" },
      { key: "invoice", label: "Fee", render: (r) => r.invoice_title },
      { key: "amount", label: "Amount", render: (r) => rupees(r.amount) },
      { key: "mode", label: "Mode", render: (r) => String(r.mode).toUpperCase() },
      { key: "reference", label: "Reference", render: (r) => r.reference || "—" },
      { key: "print", label: "Receipt", render: (r) => createElement("a", { href: "/fees/receipt/" + r.id, className: "resource-action-btn resource-action-btn--primary" }, "Print") },
    ],
    fields: [],
  },

  {
    key: "stre-exams",
    title: "STRE Exams & Fees",
    endpoint: "/stre/admin/exams/",
    platform: true,
    writeRoles: ["stre_admin"],
    canDelete: true,
    columns: [
      { key: "title", label: "Exam", render: (r) => createElement("span", null, createElement("b", { className: "block font-medium" }, r.title), createElement("span", { className: "block text-xs text-slate-500" }, r.code)) },
      { key: "exam_date", label: "Exam date" },
      { key: "last_date", label: "Last date to apply" },
      { key: "fee", label: "Fee", render: (r) => (Number(r.fee) > 0 ? rupees(r.fee) : "Free") },
      { key: "registration_count", label: "Registrations" },
      { key: "is_accepting", label: "Registration", render: (r) => (r.is_accepting ? statusPill("Open", "green") : statusPill("Closed", "slate")) },
    ],
    fields: [
      { name: "title", label: "Exam title", required: true, default: "Student Talent Recognition Exam" },
      { name: "code", label: "Exam code (used in registration & roll numbers, e.g. STRE26)", required: true },
      { name: "exam_date", label: "Exam date", type: "date", required: true },
      { name: "exam_time", label: "Exam time (e.g. 10:00 AM – 12:00 PM)" },
      { name: "reporting_time", label: "Reporting time", type: "time" },
      { name: "last_date", label: "Last date to register", type: "date", required: true },
      { name: "fee", label: "Registration fee (₹, 0 = free)", type: "number", required: true, default: "0" },
      { name: "venue", label: "Exam centre / venue", type: "textarea" },
      { name: "instructions", label: "Instructions for admit card (one per line)", type: "textarea" },
      { name: "total_marks", label: "Total marks (for result)", type: "number", default: "100" },
      { name: "merit_count", label: "Top ranks that get a Certificate of Merit", type: "number", default: "10" },
      { name: "registration_open", label: "Registration open", type: "checkbox", default: true },
    ],
  },
  {
    key: "stre-notices",
    title: "STRE Notices",
    endpoint: "/stre/admin/notices/",
    platform: true,
    search: true,
    writeRoles: ["stre_admin"],
    canDelete: true,
    columns: [
      { key: "title", label: "Notice", render: (r) => createElement("span", null, createElement("b", { className: "block font-medium" }, (r.is_pinned ? "📌 " : "") + r.title), r.body ? createElement("span", { className: "block max-w-md truncate text-xs text-slate-500", title: r.body }, r.body) : null) },
      { key: "publish_on", label: "Publish on" },
      { key: "expires_on", label: "Hide after", render: (r) => r.expires_on || "—" },
      { key: "is_active", label: "Shown", render: (r) => (r.is_active ? statusPill("Visible", "green") : statusPill("Hidden", "slate")) },
      { key: "attachment_url", label: "PDF", render: (r) => (r.attachment_url ? createElement("a", { href: r.attachment_url, target: "_blank", rel: "noopener", className: "font-semibold text-indigo-600 hover:underline" }, "View PDF") : "—") },
    ],
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "body", label: "Details (shown on STRE pages)", type: "textarea" },
      { name: "attachment", label: "Attach PDF (optional, max 10 MB) — anyone who sees this notice can open it", type: "pdf" },
      { name: "remove_attachment", label: "Remove the attached PDF", type: "checkbox", editOnly: true },
      { name: "publish_on", label: "Publish on", type: "date", required: true, default: today() },
      { name: "expires_on", label: "Hide after (optional)", type: "date" },
      { name: "is_pinned", label: "Pin to top", type: "checkbox" },
      { name: "is_active", label: "Show to students (STRE pages + homepage ticker)", type: "checkbox", default: true },
    ],
  },
  {
    key: "stre-subjects",
    title: "STRE Subjects",
    endpoint: "/stre/admin/subjects/",
    platform: true,
    search: true,
    writeRoles: ["stre_admin"],
    canDelete: true,
    columns: [
      { key: "name", label: "Subject" },
      { key: "is_active", label: "Shown in form", render: activePill },
    ],
    fields: [
      { name: "name", label: "Subject name", required: true },
      { name: "is_active", label: "Show in registration form", type: "checkbox", default: true },
    ],
  },
  {
    key: "audit-logs",
    title: "Audit Logs",
    endpoint: "/audit-logs/",
    writeRoles: [],
    columns: [
      { key: "created_at", label: "When", render: (r) => new Date(r.created_at).toLocaleString() },
      { key: "user_email", label: "User" },
      { key: "action", label: "Action", render: (r) => ({ create: "Created", update: "Updated", delete: "Deleted", account_updated: "Account updated", account_deleted: "Account deleted", account_blocked: "Login blocked", account_unblocked: "Login unblocked", account_password_reset: "Password reset", account_password_changed: "Password changed", profile_updated: "Profile updated", registration_submitted: "Registration submitted", registration_approved: "Registration approved", registration_rejected: "Registration rejected", generate_admit_cards: "Admit cards generated", publish_results: "Results published", unlock_results: "Results unlocked", revoke_admit_card: "Admit card revoked", create_school_admin: "School admin created", create_exam_controller: "Exam controller created", teacher_profile_created: "Teacher profile created", id_card_reissued: "ID card reissued", id_card_revoked: "ID card revoked", attendance_marked: "Attendance marked", seed_classes: "Class 1–12 created", fee_invoices_generated: "Fee invoices generated", leave_approved: "Leave approved", leave_rejected: "Leave rejected" } as Record<string, string>)[r.action] ?? String(r.action).replaceAll("_", " ") },
      { key: "model", label: "Model" },
      { key: "object_id", label: "Object", render: (r) => String(r.object_id).slice(0, 8) },
      { key: "changes", label: "Details", render: (r) => {
        const changes = r.changes ?? {};
        if (Array.isArray(changes.fields)) return auditFieldNames(changes.fields);
        if (changes.old && changes.new) return auditFieldNames(Object.keys(changes.new));
        const summary = [changes.role, changes.email, changes.created ? `${changes.created} created` : null].filter(Boolean).join(" · ");
        return summary || "—";
      } },
      { key: "ip_address", label: "IP" },
    ],
    fields: [],
  },
];

export const resources: Record<string, Resource> = Object.fromEntries(list.map((r) => [r.key, r]));
