"use client";

import { useId, useState } from "react";

/**
 * Password input with optional reveal toggle for IdP authorize UI.
 */
export function PasswordField({
  name,
  autoComplete,
  required,
  placeholder,
  defaultValue,
  id,
}: {
  name: string;
  autoComplete: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  id?: string;
}) {
  const genId = useId();
  const inputId = id ?? `${genId}-${name}`;
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field-row">
      <input
        id={inputId}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="input password-field-input"
      />
      <button
        type="button"
        className="password-toggle-btn"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={inputId}
        aria-pressed={visible}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
