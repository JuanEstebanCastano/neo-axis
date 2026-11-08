import { useState } from "react";
import { Link } from "react-router-dom";
import { Surface, Button, Field, Input } from "../components/ui";
import { api, ApiError } from "../lib/api";

export function ForgotPassword() {
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
      setError(err instanceof ApiError ? err.message : "Algo salió mal. Probá de nuevo.");
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
            <h1>Restablecer contraseña</h1>
            <p>Te enviamos un enlace a tu correo.</p>
          </div>
        </div>

        {done ? (
          <>
            <p style={{ color: "var(--text-2)", fontSize: 14.5, lineHeight: 1.6 }}>
              Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu
              contraseña. Revisá tu bandeja de entrada (y la carpeta de spam). El enlace vence
              en 1 hora.
            </p>
            <Link to="/auth"><Button variant="accent" block>Volver a ingresar</Button></Link>
          </>
        ) : (
          <form className="auth__form" onSubmit={submit}>
            <Field label="Correo">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@ejemplo.com" autoComplete="email" required />
            </Field>
            {error && <p className="auth__err">{error}</p>}
            <Button type="submit" variant="accent" block loading={busy} disabled={!email}>
              Enviar enlace
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
