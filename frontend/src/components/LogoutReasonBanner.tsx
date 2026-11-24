"use client";
import { useEffect, useState } from "react";
import { takeLogoutReason } from "@/components/SessionGuard";
import Icon from "@/components/Icon";

const MESSAGES: Record<string, string> = {
  idle: "You were signed out because you were inactive for a while. Please sign in again.",
  expired: "Your session has ended for security. Please sign in again.",
};

/** Login page par batao ki logout kyun hua (inactivity / session khatam). */
export default function LogoutReasonBanner() {
  const [reason, setReason] = useState("");
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("reason") || "";
    setReason(takeLogoutReason() || fromUrl);
  }, []);
  if (!MESSAGES[reason]) return null;
  return (
    <div role="status" className="logout-reason mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
      <Icon name="clock" size={15} className="mt-0.5 shrink-0" />
      <span>{MESSAGES[reason]}</span>
    </div>
  );
}
