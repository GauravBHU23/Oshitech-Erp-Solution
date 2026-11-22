import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";
import { api } from "./api";
import type { User } from "./types";

vi.mock("./api", () => ({ api: vi.fn() }));

const apiMock = vi.mocked(api);
const signedInUser = { email: "student@example.com", role: "student" } as User;

function AuthStatus() {
  const { user, loading, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{loading ? "checking" : user?.email ?? "signed out"}</span>
      <button onClick={() => void logout()}>Logout</button>
    </div>
  );
}

function LoginProbe() {
  const { login } = useAuth();
  const [message, setMessage] = useState("");
  return (
    <div>
      <button onClick={async () => {
        try {
          await login("user@example.com", "password", ["teacher"]);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Sign-in failed.");
        }
      }}>Sign in</button>
      <span>{message}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    apiMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("rechecks the session and hides protected content when restored from browser cache", async () => {
    let rejectSession: ((reason: Error) => void) | undefined;
    let meRequests = 0;
    apiMock.mockImplementation(async <T,>(path: string): Promise<T> => {
      if (path === "/auth/me/" && meRequests++ === 0) return signedInUser as T;
      if (path === "/auth/me/") {
        return new Promise<T>((_resolve, reject) => {
          rejectSession = reject;
        });
      }
      return undefined as T;
    });

    await act(async () => {
      root.render(<AuthProvider><AuthStatus /></AuthProvider>);
      await Promise.resolve();
    });
    expect(container.textContent).toContain(signedInUser.email);

    const pageShow = new Event("pageshow");
    Object.defineProperty(pageShow, "persisted", { value: true });
    await act(async () => {
      window.dispatchEvent(pageShow);
      await Promise.resolve();
    });
    expect(container.textContent).toContain("checking");
    expect(container.textContent).not.toContain(signedInUser.email);

    await act(async () => {
      rejectSession?.(new Error("session ended"));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("signed out");
  });

  it("clears local auth state and requests server logout", async () => {
    apiMock.mockImplementation(async <T,>(path: string): Promise<T> => {
      return (path === "/auth/me/" ? signedInUser : undefined) as T;
    });

    await act(async () => {
      root.render(<AuthProvider><AuthStatus /></AuthProvider>);
      await Promise.resolve();
    });
    expect(container.textContent).toContain(signedInUser.email);

    await act(async () => {
      container.querySelector("button")?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("signed out");
    expect(apiMock).toHaveBeenCalledWith("/auth/logout/", { method: "POST" });
  });

  it("uses a generic message when credentials belong to another portal", async () => {
    apiMock.mockImplementation(async <T,>(path: string): Promise<T> => {
      if (path === "/auth/me/") throw new Error("No active session");
      if (path === "/auth/login/") return { user: signedInUser } as T;
      return undefined as T;
    });

    await act(async () => {
      root.render(<AuthProvider><LoginProbe /></AuthProvider>);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector("button")?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Unable to sign in. Check your credentials or contact your administrator.");
    expect(container.textContent).not.toContain("student");
    expect(apiMock).toHaveBeenCalledWith("/auth/logout/", { method: "POST" });
  });
});
