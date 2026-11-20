"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/auth/actions";

type Field = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
};

export default function AuthForm({
  action,
  fields,
  submit,
  pendingLabel = "Секунду…",
  hidden,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  pendingLabel?: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  if (state?.done) {
    return (
      <div className="notice notice-ok" role="status">
        {state.message}
      </div>
    );
  }

  return (
    <form action={formAction} className="form">
      {hidden &&
        Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => (
        <label key={f.name} className="field">
          <span className="field-label">{f.label}</span>
          <input
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            required={f.required ?? true}
            minLength={f.minLength}
          />
          {f.hint && <span className="field-hint">{f.hint}</span>}
        </label>
      ))}
      {state?.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary btn-wide" disabled={pending}>
        {pending ? pendingLabel : submit}
      </button>
    </form>
  );
}
