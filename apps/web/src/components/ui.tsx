/** Primitivas neumórficas reutilizables. */
import type {
  ButtonHTMLAttributes,
  ElementType,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Icon, type IconName } from "./Icon";
import { useI18n } from "../context/I18nContext";

/** Une clases ignorando las vacías, para no dejar espacios dobles. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Surface({
  children,
  inset = false,
  pad = false,
  className,
  as: As = "div",
  ...rest
}: {
  children: ReactNode;
  inset?: boolean;
  pad?: boolean;
  className?: string;
  as?: ElementType;
} & Record<string, unknown>) {
  return (
    <As className={cx("surface", inset && "surface--inset", pad && "surface--pad", className)} {...rest}>
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
  variant = "soft",
  icon,
  block,
  loading,
  children,
  className,
  disabled,
  type = "button",
  ...rest
}: BtnProps) {
  return (
    <button
      type={type}
      className={cx("btn", `btn--${variant}`, block && "btn--block", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="spinner spinner--sm" aria-hidden />
      ) : icon ? (
        <Icon name={icon} size={18} />
      ) : null}
      {children ? <span className="btn__label">{children}</span> : null}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("field", className)}>
      <span className="field__label">{label}</span>
      {children}
      {error ? (
        <span className="field__error">{error}</span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("input", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("input", "input--area", className)} {...props} />;
}

/**
 * El `<select>` nativo trae una flecha que ni sigue el tema ni respeta el
 * relieve, así que la apagamos y dibujamos la nuestra con el set de íconos.
 */
export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select">
      <select className={cx("input", "input--select", className)} {...props}>
        {children}
      </select>
      <span className="select__chevron" aria-hidden>
        <Icon name="chevron" size={17} />
      </span>
    </span>
  );
}

/**
 * Grupo de opciones excluyentes. Es un radiogroup de verdad: las flechas del
 * teclado lo recorren y el lector de pantalla anuncia cuál está elegida.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("seg", className)} role="radiogroup" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className="seg__opt"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Spinner() {
  const { t } = useI18n();
  return <span className="spinner" role="status" aria-label={t("common.loading")} />;
}

export function Skeleton({ h = 16, w = "100%", r = 10 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={30} />
      </span>
      <h3 className="empty__title">{title}</h3>
      <p className="empty__body">{body}</p>
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}

export function Stars({ value }: { value: number | null }) {
  const { t, locale } = useI18n();
  if (value == null) return <span className="stars stars--empty">{t("common.noReviews")}</span>;
  const shown = value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <span className="stars" title={t("common.ratingTitle", { value: shown })}>
      <Icon name="star" size={15} />
      {shown}
    </span>
  );
}

export function Rule() {
  return <hr className="rule" />;
}

/**
 * Pie de formulario: el aviso a la izquierda y la acción siempre a la
 * derecha, haya aviso o no.
 */
export function FormFoot({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <div className="form-foot">
      {note ? <div className="form-foot__note">{note}</div> : null}
      {children}
    </div>
  );
}
