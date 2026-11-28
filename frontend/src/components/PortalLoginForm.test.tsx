import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PORTALS } from "@/lib/portals";
import PortalLoginForm from "./PortalLoginForm";

const { apiMock, loginMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  loginMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, login: loginMock }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/components/LogoutReasonBanner", () => ({ default: () => null }));
vi.mock("@/components/Icon", () => ({ default: () => null }));
vi.mock("@/components/Spinner", () => ({ default: () => null }));
vi.mock("@/components/PasswordInput", () => ({
  default: (props: ComponentProps<"input">) => <input type="password" {...props} />,
}));
vi.mock("@/components/TurnstileWidget", () => ({
  default: ({ onChange }: { onChange: (token: string) => void }) => (
    <button type="button" onClick={() => onChange("test-token")}>Complete robot check</button>
  ),
}));

describe("PortalLoginForm", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let hydrationContainer: HTMLDivElement | null;
  let hydrationRoot: ReturnType<typeof hydrateRoot> | null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    apiMock.mockReset().mockResolvedValue({ id: "captcha-id", svg: "<svg />" });
    loginMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hydrationContainer = null;
    hydrationRoot = null;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      hydrationRoot?.unmount();
    });
    container.remove();
    hydrationContainer?.remove();
    vi.unstubAllGlobals();
  });

  it("shows the backend's pending-approval message below the sign-in form", async () => {
    const detail = "Your registration is waiting for school admin approval. You can sign in after your school approves it.";
    loginMock.mockRejectedValue(new Error(detail));

    await act(async () => {
      root.render(<PortalLoginForm portal={PORTALS[3]} />);
      await Promise.resolve();
    });

    const setInputValue = (selector: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`Input not found: ${selector}`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      setInputValue('input[type="email"]', "student@example.com");
      setInputValue('input[type="password"]', "test-password");
      setInputValue('input[aria-label="Enter the five character security code"]', "ABCDE");
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Complete robot check"))
        ?.click();
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain(detail);
    expect(container.textContent).not.toContain("Unable to sign in. Check your credentials or contact your administrator.");
  });

  it("does not warn if a browser extension changes email autocomplete before hydration", async () => {
    const target = document.createElement("div");
    hydrationContainer = target;
    document.body.appendChild(target);

    const markup = renderToString(<PortalLoginForm portal={PORTALS[3]} />);
    target.innerHTML = markup;
    const emailInput = target.querySelector<HTMLInputElement>('input[type="email"]');
    if (!emailInput) throw new Error("Email input not found in server-rendered form");
    emailInput.setAttribute("autocomplete", "off");

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => {
        hydrationRoot = hydrateRoot(target, <PortalLoginForm portal={PORTALS[3]} />);
        await Promise.resolve();
      });

      expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydrated|hydration/i);
    } finally {
      consoleError.mockRestore();
    }
  });
});
