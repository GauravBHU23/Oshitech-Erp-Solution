import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

const m = (key: string, label: string): NavItem => ({ href: `/manage/${key}`, label });
const dash: NavItem = { href: "/dashboard", label: "Dashboard" };
const cards: NavItem = { href: "/admit-cards", label: "Admit Cards" };
const profile: NavItem = { href: "/profile", label: "My Profile" };
const studentsImport: NavItem = { href: "/students-import", label: "Import Students" };
const promotion: NavItem = { href: "/promotion", label: "Promote Students" };
const passwordReset: NavItem = { href: "/password-reset", label: "Password Reset" };
const idCards: NavItem = { href: "/id-cards", label: "ID Cards" };
const myIdCard: NavItem = { href: "/id-cards", label: "My ID Card" };
const attendance: NavItem = { href: "/attendance", label: "Attendance" };
const myAttendance: NavItem = { href: "/attendance", label: "My Attendance" };
const marksEntry: NavItem = { href: "/marks-entry", label: "Bulk Marks Entry" };
const reportCards: NavItem = { href: "/report-cards", label: "Report Cards" };
const myReportCard: NavItem = { href: "/report-cards", label: "My Report Card" };
const notices = m("notices", "Notice Board");
const weekly: NavItem = { href: "/timetable", label: "Weekly Timetable" };
const myTimetable: NavItem = { href: "/timetable", label: "My Timetable" };
const homework = m("homework", "Homework");
const leaves = m("leave-requests", "Leave Requests");
const feesOverview: NavItem = { href: "/fees", label: "Fees Overview" };
const myFees: NavItem = { href: "/fees", label: "My Fees" };
const adminCampus = [notices, weekly, m("timetable", "Timetable Setup"), homework, leaves, feesOverview, m("fee-structures", "Fee Structure"), m("fee-invoices", "Fee Invoices"), m("fee-payments", "Fee Payments")];

export function navFor(role: Role): NavItem[] {
  switch (role) {
    case "super_admin":
      return [
        dash,
        m("schools", "Schools"),
        m("users", "People & Accounts"),
        m("accounts", "Accounts & Access"),
        m("academic-years", "Academic Years"),
        m("courses", "Courses"),
        m("subjects", "Subjects"),
        m("classrooms", "Classrooms"),
        m("teaching-assignments", "Teacher Assignments"),
        promotion,
        m("teachers", "Teachers"),
        m("students", "Students"),
        studentsImport,
        idCards,
        attendance,
        m("exam-controllers", "Exam Controllers"),
        m("teacher-feedback", "Teacher Feedback"),
        m("support", "Support Inbox"),
        m("emails", "Send Email"),
        m("exams", "Exams"),
        m("schedules", "Exam Schedule"),
        cards,
        m("results", "Results"),
        marksEntry,
        reportCards,
        m("audit-logs", "Audit Logs"),
        ...adminCampus,
        profile,
        passwordReset,
      ];
    case "school_admin":
      return [
        dash,
        m("schools", "School Profile"),
        m("accounts", "Accounts & Access"),
        m("users", "People & Accounts"),
        m("academic-years", "Academic Years"),
        m("courses", "Courses"),
        m("subjects", "Subjects"),
        m("classrooms", "Classrooms"),
        m("teaching-assignments", "Teacher Assignments"),
        promotion,
        m("teachers", "Teachers"),
        m("students", "Students"),
        studentsImport,
        idCards,
        attendance,
        m("exam-controllers", "Exam Controllers"),
        m("teacher-feedback", "Teacher Feedback"),
        m("support", "Support Inbox"),
        m("emails", "Send Email"),
        m("exams", "Exams"),
        m("schedules", "Exam Schedule"),
        cards,
        m("results", "Results"),
        marksEntry,
        reportCards,
        m("audit-logs", "Audit Logs"),
        ...adminCampus,
        profile,
        passwordReset,
      ];
    case "teacher":
      return [dash, m("teaching-assignments", "My Classes & Subjects"), m("classrooms", "My Classrooms"), m("students", "My Students"), attendance, idCards, weekly, homework, notices, leaves, m("exams", "My Exams"), m("schedules", "Exam Schedule"), marksEntry, m("results", "Marks Entry"), reportCards, profile, passwordReset];
    case "exam_controller":
      return [dash, m("exams", "Exams"), m("schedules", "Exam Schedule"), cards, m("results", "Results"), marksEntry, reportCards, m("students", "Students"), idCards, notices, weekly, leaves, profile, passwordReset];
    case "stre_admin":
      return [dash, { href: "/stre-admin/registrations", label: "STRE Registrations" }, { href: "/stre-admin/results", label: "Results & Merit" }, { href: "/stre-admin/support", label: "STRE Support" }, m("stre-notices", "STRE Notices"), m("stre-exams", "Exams & Fees"), m("stre-subjects", "STRE Subjects"), profile, passwordReset];
    case "student":
      return [dash, m("students", "Student record"), myIdCard, myAttendance, myTimetable, homework, notices, myFees, { href: "/manage/leave-requests", label: "Leave Applications" }, m("teacher-feedback", "Rate Teachers"), m("exams", "Exams"), m("schedules", "Exam Schedule"), cards, m("results", "My Results"), myReportCard, profile, passwordReset];
  }
}

export function canAccessPath(role: Role, pathname: string, hasSchool = true): boolean {
  if (!hasSchool) {
    return pathname === "/dashboard" ||
      pathname === "/profile" ||
      pathname === "/password-reset" ||
    (role === "school_admin" && pathname === "/manage/schools");
  }
  return navFor(role).some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
}

export function navGroupsFor(role: Role): { dashboard: NavItem; groups: NavGroup[] } {
  const items = navFor(role);
  const dashboard = items.find((item) => item.href === "/dashboard") ?? dash;
  const group = (label: string, icon: string, labels: string[]): NavGroup => ({
    label,
    icon,
    items: items.filter((item) => labels.includes(item.label)),
  });

  if (role === "super_admin" || role === "school_admin") {
    return {
      dashboard,
      groups: [
        group("School & People", "users", ["Schools", "School Profile", "Accounts & Access", "People & Accounts", "Teachers", "Students", "Import Students", "ID Cards", "Attendance", "Exam Controllers"]),
        group("Academics", "book", ["Academic Years", "Courses", "Subjects", "Classrooms", "Teacher Assignments", "Promote Students"]),
        group("Examinations", "exam", ["Exams", "Exam Schedule", "Admit Cards", "Results", "Bulk Marks Entry", "Report Cards"]),
        group("Campus", "calendar", ["Notice Board", "Weekly Timetable", "Timetable Setup", "Homework", "Leave Requests"]),
        group("Fees", "wallet", ["Fees Overview", "Fee Structure", "Fee Invoices", "Fee Payments"]),
        group("Administration", "settings", ["Teacher Feedback", "Support Inbox", "Send Email", "Audit Logs", "My Profile", "Password Reset"]),
      ],
    };
  }

  if (role === "teacher") {
    return { dashboard, groups: [
      group("Teaching", "teacher", ["My Classes & Subjects", "My Classrooms", "My Students", "Attendance", "ID Cards"]),
      group("Campus", "calendar", ["Weekly Timetable", "Homework", "Notice Board", "Leave Requests"]),
      group("Examinations", "exam", ["My Exams", "Exam Schedule", "Bulk Marks Entry", "Marks Entry", "Report Cards"]),
      group("My Account", "settings", ["My Profile", "Password Reset"]),
    ] };
  }
  if (role === "stre_admin") {
    return { dashboard, groups: [
      group("Talent Exam (STRE)", "award", ["STRE Registrations", "Results & Merit", "STRE Support", "STRE Notices", "Exams & Fees", "STRE Subjects"]),
      group("My Account", "settings", ["My Profile", "Password Reset"]),
    ] };
  }
  if (role === "exam_controller") {
    return { dashboard, groups: [
      group("Examination Desk", "exam", ["Exams", "Exam Schedule", "Admit Cards", "Results", "Bulk Marks Entry", "Report Cards"]),
      group("Students", "student", ["Students", "ID Cards"]),
      group("Campus", "calendar", ["Notice Board", "Weekly Timetable", "Leave Requests"]),
      group("My Account", "settings", ["My Profile", "Password Reset"]),
    ] };
  }
  return { dashboard, groups: [
    group("My Learning", "book", ["Student record", "My ID Card", "My Attendance", "My Timetable", "Homework", "Notice Board", "Leave Applications", "Rate Teachers"]),
    group("Fees", "wallet", ["My Fees"]),
    group("Examinations", "exam", ["Exams", "Exam Schedule", "Admit Cards", "My Results", "My Report Card"]),
    group("My Account", "settings", ["My Profile", "Password Reset"]),
  ] };
}

export interface DashCard {
  label: string;
  endpoint: string;
  href: string;
}

export function dashCardsFor(role: Role): DashCard[] {
  const c = (label: string, endpoint: string, href: string) => ({ label, endpoint, href });
  switch (role) {
    case "super_admin":
      return [c("Schools", "/schools/", "/manage/schools"), c("People & Accounts", "/auth/users/", "/manage/users")];
    case "school_admin":
      return [
        c("Teachers", "/teachers/", "/manage/teachers"),
        c("Students", "/students/", "/manage/students"),
        c("People & Accounts", "/auth/users/", "/manage/users"),
        c("Classes", "/academics/courses/", "/manage/courses"),
        c("Exams", "/exams/exams/", "/manage/exams"),
        c("ID Cards issued", "/id-cards/", "/id-cards"),
      ];
    case "teacher":
      return [
        c("My Classes", "/academics/teaching-assignments/", "/manage/teaching-assignments"),
        c("Students", "/students/", "/manage/students"),
        c("Classrooms", "/academics/classrooms/", "/manage/classrooms"),
        c("Exams", "/exams/exams/", "/manage/exams"),
        c("ID Cards", "/id-cards/", "/id-cards"),
      ];
    case "exam_controller":
      return [
        c("Exams", "/exams/exams/", "/manage/exams"),
        c("Admit Cards", "/exams/admit-cards/", "/admit-cards"),
        c("Results entered", "/exams/results/", "/manage/results"),
      ];
    case "stre_admin":
      return [];
    case "student":
      return [
        c("My ID Card", "/id-cards/", "/id-cards"),
        c("Homework", "/homework/", "/manage/homework"),
        c("Upcoming Exams", "/exams/exams/", "/manage/exams"),
        c("My Admit Cards", "/exams/admit-cards/", "/admit-cards"),
        c("My Results", "/exams/results/", "/manage/results"),
      ];
  }
}
