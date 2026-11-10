/**
 * Tarjeta centrada de las tres pantallas de cuenta (ingresar, pedir enlace,
 * restablecer). Las tres compartían el mismo encabezado copiado tres veces;
 * acá vive una sola vez.
 */
import type { ReactNode } from "react";
import { Surface } from "./ui";
import { LanguageSwitch, ThemeSwitch } from "./Prefs";

export function AuthLayout({
  title,
  subtitle,
  children,
  foot,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="auth">
      <Surface className="auth__card page">
        <div className="auth__top">
          <span className="brand__mark" aria-hidden>
            N
          </span>
          <div className="auth__prefs">
            <LanguageSwitch />
            <ThemeSwitch />
          </div>
        </div>

        <div className="auth__head">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        {children}

        {foot ? <div className="auth__foot">{foot}</div> : null}
      </Surface>
    </div>
  );
}
