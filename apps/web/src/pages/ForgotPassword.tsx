import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button, Field, Input } from "../components/ui";
import { useI18n } from "../context/I18nContext";
import { api, ApiError } from "../lib/api";

export function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword({ email });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.somethingWrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t("forgot.title")}
      subtitle={t("forgot.subtitle")}
      foot={
        <Link to="/auth" className="auth__alt">
          ← {t("forgot.backToSignIn")}
        </Link>
      }
    >
      {done ? (
        <>
          <p className="auth__note">{t("forgot.sent")}</p>
          <Link to="/auth">
            <Button variant="accent" block>
              {t("forgot.backToSignIn")}
            </Button>
          </Link>
        </>
      ) : (
        <form className="auth__form" onSubmit={submit}>
          <Field label={t("auth.email")}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              autoComplete="email"
              required
            />
          </Field>

          {error && (
            <p className="auth__err" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" variant="accent" block loading={busy} disabled={!email}>
            {t("forgot.send")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
