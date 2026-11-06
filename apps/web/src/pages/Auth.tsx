import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Surface, Button, Field, Input } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";

export function Auth() {
  const { user, ready, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ username: "", displayName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to="/" replace />;

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
            <h1>{mode === "login" ? "Hola de nuevo" : "Unite a Neo Axis"}</h1>
            <p>Libros y código, en un mismo lugar.</p>
          </div>
        </div>

        <div className="seg" role="tablist">
          <button className={`seg__opt ${mode === "login" ? "is-active" : ""}`} onClick={() => setMode("login")} role="tab" aria-selected={mode === "login"}>
            Ingresar
          </button>
          <button className={`seg__opt ${mode === "register" ? "is-active" : ""}`} onClick={() => setMode("register")} role="tab" aria-selected={mode === "register"}>
            Crear cuenta
          </button>
        </div>

        <form className="auth__form" onSubmit={submit}>
          {mode === "register" && (
            <>
              <Field label="Usuario">
                <Input value={form.username} onChange={set("username")} placeholder="ada_lovelace" autoComplete="username" required />
              </Field>
              <Field label="Nombre para mostrar">
                <Input value={form.displayName} onChange={set("displayName")} placeholder="Ada Lovelace" required />
              </Field>
            </>
          )}
          <Field label="Correo">
            <Input type="email" value={form.email} onChange={set("email")} placeholder="vos@ejemplo.com" autoComplete="email" required />
          </Field>
          <Field label="Contraseña" hint={mode === "register" ? "Mínimo 12 caracteres." : undefined}>
            <Input type="password" value={form.password} onChange={set("password")} placeholder="••••••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
          </Field>

          {error && <p className="auth__err">{error}</p>}

          <Button type="submit" variant="accent" block loading={busy}>
            {mode === "login" ? "Ingresar" : "Crear cuenta"}
          </Button>
        </form>

        <p className="auth__alt">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>Explorar sin cuenta →</a>
        </p>
      </Surface>
    </div>
  );
}
