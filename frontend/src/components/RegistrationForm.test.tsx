import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import RegistrationForm from "./RegistrationForm";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const apiMock = vi.mocked(api);

describe("RegistrationForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    apiMock.mockReset();
    apiMock.mockImplementation(async <T,>(): Promise<T> => ({
      school: { name: "Example School", code: "EXAMPLE" },
      courses: [],
      academic_years: [],
    } as T));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("explains that teacher registration needs an active course", async () => {
    await act(async () => root.render(<RegistrationForm portal="teacher" />));

    const schoolCodeInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="Ask your school office"]'
    );
    expect(schoolCodeInput).not.toBeNull();
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setInputValue?.call(schoolCodeInput, "EXAMPLE");
      schoolCodeInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const findSchoolButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Find school")
    );
    expect(findSchoolButton).toBeDefined();
    await act(async () => {
      findSchoolButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("no active courses");
    const submitButton = container.querySelector<HTMLButtonElement>("form button.btn-primary");
    expect(submitButton?.disabled).toBe(true);
    expect(submitButton?.textContent).toContain("No active courses available");
  });

  it("shows a printable teacher approval slip after registration succeeds", async () => {
    apiMock.mockImplementation(async <T,>(path: string): Promise<T> => {
      if (path.startsWith("/auth/registration-options/")) {
        return {
          school: { name: "Example School", code: "EXAMPLE" },
          courses: [{ id: "course-1", name: "Mathematics", code: "MATH" }],
          academic_years: [],
        } as T;
      }
      return {
        id: "01234567-89ab-cdef-0123-456789abcdef",
        detail: "Registration submitted.",
      } as T;
    });
    vi.stubGlobal("print", vi.fn());
    await act(async () => root.render(<RegistrationForm portal="teacher" />));

    const setInput = (labelPrefix: string, value: string) => {
      const label = Array.from(container.querySelectorAll("form label")).find((item) =>
        item.textContent?.trim().startsWith(labelPrefix)
      );
      const input = label?.querySelector("input");
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(input, value);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    };

    await act(async () => {
      setInput("School registration code", "EXAMPLE");
    });
    const findSchoolButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Find school")
    );
    await act(async () => {
      findSchoolButton?.click();
      await Promise.resolve();
    });

    await act(async () => {
      setInput("First name", "Asha");
      setInput("Last name", "Sharma");
      setInput("Email address", "asha@example.com");
      setInput("Create password", "SecurePass!234");
      setInput("Phone number", "9876543210");
      setInput("Highest qualification", "M.Ed");
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Teacher Registration & Approval Slip");
    expect(container.textContent).toContain("01234567");
    expect(container.textContent).toContain("Asha Sharma");
    expect(container.textContent).toContain("asha@example.com");
    expect(container.textContent).toContain("Mathematics");
    expect(container.textContent).not.toContain("SecurePass!234");

    const printButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Download / Print A4 PDF")
    );
    await act(async () => printButton?.click());
    expect(window.print).toHaveBeenCalledOnce();
  });

  it("shows a student approval slip with father, mother and admission details", async () => {
    apiMock.mockImplementation(async <T,>(path: string): Promise<T> => {
      if (path.startsWith("/auth/registration-options/")) {
        return {
          school: { name: "Example School", code: "EXAMPLE" },
          courses: [{ id: "course-1", name: "Science", code: "SCI" }],
          academic_years: [{ id: "year-1", name: "2026-27" }],
        } as T;
      }
      return {
        id: "89abcdef-0123-4567-89ab-cdef01234567",
        detail: "Registration submitted.",
      } as T;
    });
    vi.stubGlobal("print", vi.fn());
    await act(async () => root.render(<RegistrationForm portal="student" />));

    const setControl = (labelPrefix: string, value: string) => {
      const label = Array.from(container.querySelectorAll("form label")).find((item) =>
        item.textContent?.trim().startsWith(labelPrefix)
      );
      const control = label?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input, select, textarea"
      );
      const prototype = control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : control instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
      control?.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    };

    await act(async () => setControl("School registration code", "EXAMPLE"));
    const findSchoolButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Find school")
    );
    await act(async () => {
      findSchoolButton?.click();
      await Promise.resolve();
    });

    await act(async () => {
      setControl("First name", "Riya");
      setControl("Last name", "Verma");
      setControl("Email address", "riya@example.com");
      setControl("Create password", "SecurePass!234");
      setControl("Class", "8");
      setControl("Date of birth", "15/04/2012");
      setControl("Gender", "F");
      setControl("Father's name", "Rakesh Verma");
      setControl("Mother's name", "Anita Verma");
      setControl("Parent phone", "9876543210");
      setControl("Student phone", "9876501234");
      setControl("Aadhaar number", "123456789012");
      setControl("Full address", "12 Main Road, Jaipur");
      setControl("Applying for course", "course-1");
      setControl("Academic year", "year-1");
    });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Student Registration & Approval Slip");
    expect(container.textContent).toContain("Class 8");
    expect(container.textContent).toContain("Rakesh Verma");
    expect(container.textContent).toContain("Anita Verma");
    expect(container.textContent).toContain("9876543210");
    expect(container.textContent).toContain("Science");
    expect(container.textContent).toContain("2026-27");
    expect(container.textContent).toContain("12 Main Road, Jaipur");
    expect(container.textContent).toContain("XXXX XXXX 9012");
    expect(container.textContent).not.toContain("123456789012");
    expect(container.textContent).not.toContain("SecurePass!234");

    const printButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Download / Print A4 PDF")
    );
    await act(async () => printButton?.click());
    expect(window.print).toHaveBeenCalledOnce();
  });
});
