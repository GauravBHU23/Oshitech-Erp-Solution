"use client";

import { useEffect } from "react";
import { toast } from "@/lib/toast";

/**
 * Pehle yeh submit button ko chupchap disable kar deta tha, jisse user ko pata nahi chalta tha
 * ki kya galat hai. Ab button enabled rehta hai; submit par browser jo field invalid paata hai
 * use laal highlight karte hain, us field par focus jata hai aur ek toast saaf batata hai.
 */
export default function FormValidationGuard() {
  useEffect(() => {
    const lastToast = new WeakMap<HTMLFormElement, number>();

    const describe = (field: HTMLInputElement) => {
      const label = field.closest("label")?.firstChild?.textContent?.replace("*", "").trim() || field.name || "This field";
      if (field.validity.valueMissing) return `${label} is required.`;
      if (field.validity.typeMismatch && field.type === "email") return `${label}: enter a valid email address.`;
      if (field.validity.patternMismatch) return `${label}: ${field.title || "check the format."}`;
      if (field.validity.tooShort) return `${label}: at least ${field.minLength} characters.`;
      return `${label}: ${field.validationMessage}`;
    };

    const onInvalid = (event: Event) => {
      const field = event.target as HTMLInputElement;
      const form = field.form;
      if (!form) return;
      form.classList.add("was-validated");
      const now = Date.now();
      if ((lastToast.get(form) ?? 0) > now - 800) return; // ek submit par sirf pehle field ka toast
      lastToast.set(form, now);
      toast.error(describe(field));
    };

    const onInput = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
        const form = target.form;
        if (form?.classList.contains("was-validated") && form.checkValidity()) form.classList.remove("was-validated");
      }
    };

    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
    };
  }, []);

  return null;
}
