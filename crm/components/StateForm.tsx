"use client";
import { useActionState } from "react";

type State = { error?: string; ok?: string } | undefined;

/** Форма с выводом результата (для действий, которые возвращают { error } или { ok }). */
export default function StateForm({
  action,
  children,
  className,
}: {
  action: (prev: State, f: FormData) => Promise<State>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {state?.error && <div className="alert error">{state.error}</div>}
      {state?.ok && <div className="alert ok">{state.ok}</div>}
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0 }}>
        {children}
      </fieldset>
    </form>
  );
}
