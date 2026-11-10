import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button, Field, Input } from "../components/ui";
import { useI18n } from "../context/I18nContext";
import { api, ApiError } from "../lib/api";

export function ResetPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [form, setForm] = useState({ newPassword: "", confirm: "" });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = form.newPassword.length > 0 && form.newPassword.length < 12;
  const mismatch = form.confirm.length > 0 && form.newPassword !== form.confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort || mismatch) {
      setError(t(tooShort ? "reset.tooShortLong" : "reset.mismatchLong"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword({ token, newPassword: form.newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("reset.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t("reset.title")}
      subtitle={t("reset.subtitle")}
      foot={
        <Link to="/auth" className="auth__alt">
          ← {t("forgot.backToSignIn")}
        </Link>
      }
    >
      {!token ? (
        <>
          <p className="auth__err" role="alert">
            {t("reset.invalidLink")}
          </p>
          <Link to="/recuperar">
            <Button variant="accent" block>
              {t("reset.requestNew")}
            </Button>
          </Link>
        </>
      ) : done ? (
        <>
          <p className="auth__note">{t("reset.done")}</p>
          <Link to="/auth">
            <Button variant="accent" block>
              {t("common.signIn")}
            </Button>
          </Link>
        </>
      ) : (
        <form className="auth__form" onSubmit={submit}>
          <Field
            label={t("reset.newPassword")}
            hint={t("reset.tooShort")}
            error={tooShort ? t("reset.tooShort") : undefined}
          >
            <Input
              type="password"
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
              autoComplete="new-password"
              required
            />
          </Field>

          <Field label={t("reset.repeat")} error={mismatch ? t("reset.mismatch") : undefined}>
            <Input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              autoComplete="new-password"
              required
            />
          </Field>

          {error && (
            <p className="auth__err" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="accent"
            block
            loading={busy}
            disabled={!form.newPassword || !form.confirm}
          >
            {t("reset.submit")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
