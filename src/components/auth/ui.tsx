import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Primitivas do tema CLARO das telas de autenticacao.
 *
 * Existem separadas de components/ui/* porque aquelas sao do dashboard, que
 * roda no tema escuro herdado — mudar as globais quebraria ~1.3k classes.
 */

export function AuthLabel({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500",
        className,
      )}
      {...props}
    />
  );
}

export const AuthInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-ink transition placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
AuthInput.displayName = "AuthInput";

export function AuthField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <AuthLabel htmlFor={htmlFor}>{label}</AuthLabel>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function AuthButton({
  className,
  loading,
  children,
  disabled,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "outline";
}) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary"
          ? "bg-ink text-white hover:bg-ink/90"
          : "border border-slate-200 bg-white text-ink hover:border-slate-300 hover:bg-slate-50",
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}

export function AuthErrorBox({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </div>
  );
}

export function AuthHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-balance text-[1.75rem] font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2.5 text-[15px] leading-relaxed text-slate-500">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function AuthCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-slate-200/90 bg-white p-6 shadow-[0_24px_60px_-34px_rgba(7,26,51,0.28)] sm:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AuthDivider({ label = "ou" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-xs text-slate-400">{label}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
