"use client";

import { useState, type InputHTMLAttributes } from "react";
import Icon from "@/components/Icon";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export default function PasswordInput({ className = "input", disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative block">
      <input {...props} disabled={disabled} type={visible ? "text" : "password"} className={`${className} !pr-11`} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-slate-400 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        disabled={disabled}
        onClick={() => setVisible((value) => !value)}
      >
        <Icon name={visible ? "eyeOff" : "eye"} size={17} />
      </button>
    </span>
  );
}
