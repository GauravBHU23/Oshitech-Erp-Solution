"use client";
import { useEffect } from "react";

export type ToastKind = "success" | "error" | "info";
export interface ToastItem { id: number; kind: ToastKind; message: string }

const EVENT = "oshitech:toast";
let counter = 0;

/** Kisi bhi jagah se toast dikhao: toast.success("Saved"), toast.error("Failed"). */
function show(kind: ToastKind, message: string) {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail: { id: ++counter, kind, message } }));
}

export const toast = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
  info: (message: string) => show("info", message),
  EVENT,
};

/** Jab bhi message state badle (khali na ho), toast dikhao. */
export function useToastMessage(message: string | null | undefined, kind: ToastKind = "success") {
  useEffect(() => {
    if (message) show(kind, message);
  }, [message, kind]);
}
