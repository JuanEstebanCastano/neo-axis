import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Surface, Button, Field, Input } from "../components/ui";
import { api, ApiError } from "../lib/api";

export function ResetPassword() {
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
      setError(tooShort ? "La contraseña debe tener al menos 12 caracteres." : "Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword({ token, newPassword: form.newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo restablecer. El enlace pudo expirar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <Surface className="auth__card page">
        <div className="auth__brand">
          <span className="brand__mark">N</span>
          <div className="auth__head">
            <h1>Nueva contraseña</h1>
            <p>Elegí una contraseña nueva para tu cuenta.</p>
          </div>
        </div>

        {!token ? (
          <>
            <p className="auth__err">El enlace es inválido o está incompleto.</p>
            <Link to="/recuperar"><Button variant="accent" block>Pedir un enlace nuevo</Button></Link>
          </>
        ) : done ? (
          <>
            <p style={{ color: "var(--text-2)", fontSize: 14.5, lineHeight: 1.6 }}>
              ¡Listo! Tu contraseña se actualizó y se cerraron las sesiones anteriores.
              Ya podés iniciar sesión con la nueva contraseña.
            </p>
            <Link to="/auth"><Button variant="accent" block>Iniciar sesión</Button></Link>
          </>
        ) : (
          <form className="auth__form" onSubmit={submit}>
            <Field label="Nueva contraseña" hint="Mínimo 12 caracteres." error={tooShort ? "Mínimo 12 caracteres." : undefined}>
              <Input type="password" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} autoComplete="new-password" required />
            </Field>
            <Field label="Repetir contraseña" error={mismatch ? "No coincide." : undefined}>
              <Input type="password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} autoComplete="new-password" required />
            </Field>
            {error && <p className="auth__err">{error}</p>}
            <Button type="submit" variant="accent" block loading={busy} disabled={!form.newPassword || !form.confirm}>
              Guardar contraseña
            </Button>
          </form>
        )}

        <p className="auth__alt">
          <Link to="/auth">← Volver a iniciar sesión</Link>
        </p>
      </Surface>
    </div>
  );
}
