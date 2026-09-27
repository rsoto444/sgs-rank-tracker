"use client";
import { useTransition } from "react";

/** A button that runs a server action and shows it's busy. */
export default function ActionButton({
  action,
  children,
  pendingText,
  className = "btn-ghost",
  confirm,
}: {
  action: () => Promise<unknown>;
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          await action();
        });
      }}
    >
      {pending ? pendingText ?? "Working..." : children}
    </button>
  );
}
