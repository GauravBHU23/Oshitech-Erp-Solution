"use client";
import { useEffect, useState } from "react";
import { toast, type ToastItem } from "@/lib/toast";
import Icon from "@/components/Icon";

const ICON: Record<ToastItem["kind"], string> = { success: "check", error: "close", info: "bell" };

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const item = (event as CustomEvent<ToastItem>).detail;
      setItems((current) => [...current.filter((t) => t.message !== item.message), item].slice(-4));
      window.setTimeout(() => setItems((current) => current.filter((t) => t.id !== item.id)), item.kind === "error" ? 6000 : 4000);
    };
    window.addEventListener(toast.EVENT, onToast);
    return () => window.removeEventListener(toast.EVENT, onToast);
  }, []);

  return (
    <div className="toaster no-print" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div key={item.id} role={item.kind === "error" ? "alert" : "status"} className={`toast toast--${item.kind}`}>
          <span className="toast__icon"><Icon name={ICON[item.kind]} size={15} strokeWidth={2.4} /></span>
          <p className="toast__text">{item.message}</p>
          <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => setItems((current) => current.filter((t) => t.id !== item.id))}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
