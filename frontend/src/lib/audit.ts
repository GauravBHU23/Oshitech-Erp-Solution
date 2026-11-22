// Audit log ke liye readable labels — audit page aur notification bell dono yahi use karte hain.

export const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  profile_updated: "Profile updated",
  account_updated: "Account updated",
  account_deleted: "Account deleted",
  account_blocked: "Login blocked",
  account_unblocked: "Login unblocked",
  account_password_reset: "Password reset",
  account_password_changed: "Password changed",
  account_password_reset_self: "Password reset (forgot password)",
  registration_submitted: "Registration submitted",
  registration_approved: "Registration approved",
  registration_rejected: "Registration rejected",
  create_school_admin: "School admin created",
  create_exam_controller: "Exam controller created",
  teacher_profile_created: "Teacher profile created",
  generate_admit_cards: "Admit cards generated",
  revoke_admit_card: "Admit card revoked",
  publish_results: "Results published",
  unlock_results: "Results unlocked",
  id_card_reissued: "ID card reissued",
  id_card_revoked: "ID card revoked",
  attendance_marked: "Attendance marked",
  seed_classes: "Class 1–12 created",
  fee_invoices_generated: "Fee invoices generated",
  leave_approved: "Leave approved",
  leave_rejected: "Leave rejected",
  stre_registration_edited: "STRE registration edited",
  stre_payment_verified: "STRE payment verified",
  stre_admit_card_issued: "STRE admit card issued",
  stre_admit_cards_generated: "STRE admit cards generated",
  stre_registration_cancelled: "STRE registration cancelled",
  stre_bulk_email: "STRE bulk email sent",
  stre_registration_deleted: "STRE registration deleted",
  stre_support_updated: "STRE support request updated",
};

export const MODEL_LABELS: Record<string, string> = {
  User: "Account",
  School: "School",
  AcademicYear: "Academic year",
  Course: "Class / course",
  Subject: "Subject",
  ClassRoom: "Classroom",
  TeachingAssignment: "Teacher assignment",
  Teacher: "Teacher",
  Student: "Student",
  IDCard: "ID card",
  Exam: "Exam",
  ExamSchedule: "Exam schedule",
  AdmitCard: "Admit card",
  Result: "Result / marks",
  Attendance: "Attendance",
  RegistrationRequest: "Registration",
  Notice: "Notice",
  TimetableEntry: "Timetable",
  Homework: "Homework",
  LeaveRequest: "Leave request",
  FeeStructure: "Fee structure",
  FeeInvoice: "Fee invoice",
  FeePayment: "Fee payment",
  SupportRequest: "Support request",
  TeacherRating: "Teacher rating",
  StreRegistration: "STRE registration",
  StreExam: "STRE exam",
  StreSupportTicket: "STRE support request",
};

const FIELD_LABELS: Record<string, string> = {
  first_name: "First name", last_name: "Last name", phone: "Phone", email: "Email", qualification: "Qualification",
  is_public: "Public profile", is_active: "Status", role: "Role", name: "Name", status: "Status", course: "Course",
  subject: "Subject", academic_year: "Academic year", classroom: "Classroom", date: "Date", start_date: "Start date",
  end_date: "End date", marks_obtained: "Marks", is_absent: "Absent", remarks: "Remarks", father_name: "Father's name",
  mother_name: "Mother's name", guardian_phone: "Parent phone", class_level: "Class", roll_no: "Roll no.",
  admission_no: "Admission no.", address: "Address", amount: "Amount", due_date: "Due date", title: "Title",
  blood_group: "Blood group", date_of_birth: "Date of birth", gender: "Gender", section: "Section", capacity: "Capacity",
  class_teacher: "Class teacher", is_current: "Current year", max_marks: "Max marks", pass_marks: "Pass marks",
};

export type AuditTone = "green" | "red" | "amber" | "indigo" | "slate";

export function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

export function modelLabel(model: string) {
  return MODEL_LABELS[model] ?? model.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function actionTone(action: string): AuditTone {
  if (action === "account_unblocked") return "green";
  if (/delete|revoke|reject|blocked|unlock/.test(action)) return "red";
  if (/create|approve|generate|publish|seed|submitted|marked/.test(action)) return "green";
  if (/password|reissue/.test(action)) return "amber";
  if (/update/.test(action)) return "indigo";
  return "slate";
}

const fieldLabel = (key: string) => FIELD_LABELS[key] ?? key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function show(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "None") return "—";
  const text = String(value);
  if (text === "True") return "Yes";
  if (text === "False") return "No";
  if (UUID.test(text)) return "(changed)";
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/** Badlav ki readable lines, e.g. ["Phone: 98… → 97…", "Status: Yes → No"]. */
export function changeLines(changes: unknown): string[] {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  const c = changes as Record<string, unknown>;
  if (c.old && c.new && typeof c.old === "object" && typeof c.new === "object") {
    const oldV = c.old as Record<string, unknown>;
    const newV = c.new as Record<string, unknown>;
    return Object.keys(newV)
      .filter((key) => String(oldV[key]) !== String(newV[key]))
      .map((key) => `${fieldLabel(key)}: ${show(oldV[key])} → ${show(newV[key])}`);
  }
  if (Array.isArray(c.fields)) return [`Changed: ${(c.fields as unknown[]).map((f) => fieldLabel(String(f))).join(", ")}`];
  return Object.entries(c)
    .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
    .map(([key, v]) => `${key === "created" ? "Created" : key === "count" ? "Count" : fieldLabel(key)}: ${show(v)}`);
}
