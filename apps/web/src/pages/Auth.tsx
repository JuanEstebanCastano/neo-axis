import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button, Field, Input, Segmented, Spinner } from "../components/ui";
import { Icon } from "../components/Icon";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { ApiError } from "../lib/api";

type Mode = "login" | "register";

export function Auth() {
  const { user, ready, login, register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ username: "", displayName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mientras no se sepa si ya hay sesión, no se pinta el formulario: quien
  // entra con sesión viva veía el "Ingresar" completo durante un instante y
  // después la página saltaba sola. Primero se espera, después se decide.
  if (!ready)
    return (
      <AuthLayout title={t("auth.welcomeBack")} subtitle={t("auth.tagline")}>
        <div className="wait wait--tall">
          <Spinner />
        </div>
      </AuthLayout>
    );

  if (user) return <Navigate to="/" replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login({ email: form.email, password: form.password });
      else await register(form);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.somethingWrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t(mode === "login" ? "auth.welcomeBack" : "auth.join")}
      subtitle={t("auth.tagline")}
      foot={
        <>
          {mode === "login" && (
            <Link to="/recuperar" className="auth__alt">
              {t("auth.forgot")}
            </Link>
          )}
          <Link to="/" className="auth__alt auth__alt--accent">
            {t("auth.explore")}
            <Icon name="arrow" size={15} />
          </Link>
        </>
      }
    >
      <Segmented
        className="auth__seg"
        label={t("auth.mode")}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setError(null);
        }}
        options={[
          { value: "login", label: t("common.signIn") },
          { value: "register", label: t("common.createAccount") },
        ]}
      />

      <form className="auth__form" onSubmit={submit}>
        {mode === "register" && (
          <>
            <Field label={t("auth.username")}>
              <Input
                value={form.username}
                onChange={set("username")}
                placeholder={t("auth.usernamePlaceholder")}
                autoComplete="username"
                required
              />
            </Field>
            <Field label={t("auth.displayName")}>
              <Input
                value={form.displayName}
                onChange={set("displayName")}
                placeholder={t("auth.displayNamePlaceholder")}
                autoComplete="name"
                required
              />
            </Field>
          </>
        )}

        <Field label={t("auth.email")}>
          <Input
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder={t("auth.emailPlaceholder")}
            autoComplete="email"
            required
          />
        </Field>

        <Field label={t("auth.password")} hint={mode === "register" ? t("auth.passwordHint") : undefined}>
          <Input
            type="password"
            value={form.password}
            onChange={set("password")}
            placeholder="••••••••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </Field>

        {error && (
          <p className="auth__err" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" variant="accent" block loading={busy}>
          {t(mode === "login" ? "common.signIn" : "common.createAccount")}
        </Button>
      </form>
    </AuthLayout>
  );
}
