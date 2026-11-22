import { describe, expect, it } from "vitest";
import { canAccessPath, navFor, navGroupsFor } from "./nav";
import type { Role } from "./types";

describe("password reset navigation", () => {
  const roles: Role[] = ["super_admin", "school_admin", "teacher", "student", "exam_controller"];

  it.each(roles)("shows password reset for %s", (role) => {
    expect(navFor(role)).toContainEqual({ href: "/password-reset", label: "Password Reset" });
    expect(navGroupsFor(role).groups.flatMap((group) => group.items)).toContainEqual({
      href: "/password-reset",
      label: "Password Reset",
    });
  });
});

describe("role-based route access", () => {
  it.each([
    ["super_admin", "/manage/schools", true, true],
    ["school_admin", "/manage/schools", true, true],
    ["teacher", "/manage/exams", true, true],
    ["teacher", "/manage/users", false, true],
    ["exam_controller", "/manage/exam-controllers", false, true],
    ["student", "/manage/teacher-feedback", true, true],
    ["teacher", "/manage/exams/123", true, true],
    ["teacher", "/manage/exams-extra", false, true],
    ["school_admin", "/manage/schools", true, false],
    ["school_admin", "/manage/schools/123", false, false],
    ["school_admin", "/manage/courses", false, false],
    ["teacher", "/manage/students", false, false],
    ["exam_controller", "/manage/exams", false, false],
    ["teacher", "/profile", true, false],
    ["school_admin", "/password-reset", true, false],
  ] as const)("checks %s access to %s", (role, pathname, expected, hasSchool) => {
    expect(canAccessPath(role, pathname, hasSchool)).toBe(expected);
  });
});

describe("every menu item is reachable from the sidebar", () => {
  const roles: Role[] = ["super_admin", "school_admin", "teacher", "student", "exam_controller"];
  it.each(roles)("groups every nav item for %s", (role) => {
    const grouped = navGroupsFor(role).groups.flatMap((group) => group.items.map((item) => item.href));
    const missing = navFor(role).filter((item) => item.href !== "/dashboard" && !grouped.includes(item.href));
    expect(missing).toEqual([]);
  });
});

describe("new modules are role based", () => {
  it.each([
    ["school_admin", "/id-cards", true],
    ["school_admin", "/promotion", true],
    ["teacher", "/promotion", false],
    ["school_admin", "/students-import", true],
    ["teacher", "/students-import", false],
    ["stre_admin", "/stre-admin/results", true],
    ["school_admin", "/stre-admin/results", false],
    ["student", "/promotion", false],
    ["student", "/id-cards", true],
    ["teacher", "/attendance", true],
    ["student", "/attendance", true],
    ["exam_controller", "/attendance", false],
    ["teacher", "/marks-entry", true],
    ["student", "/marks-entry", false],
    ["exam_controller", "/report-cards", true],
    ["student", "/report-cards", true],
    ["teacher", "/manage/accounts", false],
    ["student", "/manage/audit-logs", false],
  ] as const)("checks %s access to %s", (role, pathname, expected) => {
    expect(canAccessPath(role, pathname, true)).toBe(expected);
  });
});

describe("campus and fees modules are role based", () => {
  it.each([
    ["student", "/fees", true],
    ["student", "/fees/receipt/abc", true],
    ["student", "/manage/fee-invoices", false],
    ["teacher", "/fees", false],
    ["exam_controller", "/manage/fee-payments", false],
    ["school_admin", "/manage/fee-structures", true],
    ["teacher", "/manage/homework", true],
    ["exam_controller", "/manage/homework", false],
    ["student", "/manage/homework", true],
    ["student", "/timetable", true],
    ["student", "/manage/timetable", false],
    ["teacher", "/manage/leave-requests", true],
    ["exam_controller", "/manage/notices", true],
  ] as const)("checks %s access to %s", (role, pathname, expected) => {
    expect(canAccessPath(role, pathname, true)).toBe(expected);
  });
});

describe("STRE exam portal admin is separate from school modules", () => {
  it("groups every STRE admin menu item", () => {
    const grouped = navGroupsFor("stre_admin").groups.flatMap((g) => g.items.map((i) => i.href));
    expect(navFor("stre_admin").filter((i) => i.href !== "/dashboard" && !grouped.includes(i.href))).toEqual([]);
  });
  it.each([
    ["stre_admin", "/stre-admin/registrations", true],
    ["stre_admin", "/manage/stre-exams", true],
    ["stre_admin", "/manage/students", false],
    ["stre_admin", "/manage/fee-invoices", false],
    ["stre_admin", "/attendance", false],
    ["school_admin", "/stre-admin/registrations", false],
    ["super_admin", "/manage/stre-exams", false],
    ["teacher", "/manage/stre-subjects", false],
  ] as const)("checks %s access to %s", (role, pathname, expected) => {
    expect(canAccessPath(role, pathname, true)).toBe(expected);
  });
});

describe("STRE support and notices pages", () => {
  it.each([
    ["stre_admin", "/stre-admin/support", true],
    ["stre_admin", "/manage/stre-notices", true],
    ["school_admin", "/stre-admin/support", false],
    ["school_admin", "/manage/stre-notices", false],
    ["student", "/stre-admin/support", false],
  ] as const)("checks %s access to %s", (role, pathname, expected) => {
    expect(canAccessPath(role, pathname, true)).toBe(expected);
  });
});
