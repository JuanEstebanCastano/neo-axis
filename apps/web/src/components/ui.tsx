/** Primitivas neumórficas reutilizables. */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

export function Surface({
  children, inset = false, className = "", as: As = "div", ...rest
}: { children: ReactNode; inset?: boolean; className?: string; as?: any } & Record<string, unknown>) {
  return (
    <As className={`surface ${inset ? "surface--inset" : ""} ${className}`} {...rest}>
      {children}
    </As>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "accent" | "soft" | "ghost";
  icon?: IconName;
  block?: boolean;
  loading?: boolean;
};

export function Button({
  variant = "soft", icon, block, loading, children, className = "", disabled, ...rest
}: BtnProps) {
  return (
    <button
      className={`btn btn--${variant} ${block ? "btn--block" : ""} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner spinner--sm" aria-hidden /> : icon ? <Icon name={icon} size={18} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function Field({
  label, hint, error, children,
}: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input input--area" {...props} />;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Cargando" />;
}

export function Skeleton({ h = 16, w = "100%", r = 10 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

export function EmptyState({
  icon, title, body, action,
}: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={30} /></span>
      <h3 className="empty__title">{title}</h3>
      <p className="empty__body">{body}</p>
      {action}
    </div>
  );
}

export function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="stars stars--empty">Sin reseñas</span>;
  return (
    <span className="stars" title={`${value} de 5`}>
      <Icon name="star" size={15} />
      {value.toFixed(1)}
    </span>
  );
}
