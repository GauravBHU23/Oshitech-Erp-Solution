"use client";
import { useEffect, useState } from "react";
import { dmyToIso, isoToDmy, maskDmy } from "@/lib/validation";

/**
 * DD/MM/YYYY text input (mobile par number keypad). Bahar ISO (YYYY-MM-DD) value deta hai.
 * Native date picker har phone par alag format dikhata hai; isse user ko format saaf dikhta hai.
 */
export default function DateInput({
  value,
  onChange,
  required,
  id,
  className = "input mt-1.5",
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (iso: string, typed: string) => void;
  required?: boolean;
  id?: string;
  className?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [text, setText] = useState(isoToDmy(value));
  useEffect(() => {
    if (value && value !== dmyToIso(text)) setText(isoToDmy(value));
    if (!value && dmyToIso(text)) setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      id={id}
      className={className}
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      placeholder="DD/MM/YYYY"
      maxLength={10}
      pattern="\d{2}/\d{2}/\d{4}"
      title="Use DD/MM/YYYY, e.g. 15/08/2012"
      required={required}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      value={text}
      onChange={(event) => {
        const next = maskDmy(event.target.value);
        setText(next);
        onChange(dmyToIso(next), next);
      }}
    />
  );
}
