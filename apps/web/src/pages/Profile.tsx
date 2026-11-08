import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Textarea, Skeleton, EmptyState, Badge } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, ApiError, type MeFull, type NotificationPrefs } from "../lib/api";
import { useAuth } from "../context/AuthContext";

function since(iso: string) {
  return new Date(iso).toLocaleDateString("es", { year: "numeric", month: "long" });
}

/** Mensaje de resultado debajo de cada formulario. */
function Note({ ok, err }: { ok?: boolean; err?: string | null }) {
  if (err) return <p className="field__error">{err}</p>;
  if (ok) return <p className="field__ok">Cambios guardados.</p>;
  return null;
}

function errMsg(e: unknown, fallback = "No se pudo guardar. Probá de nuevo.") {
  return e instanceof ApiError ? e.message : fallback;
}

/** Interruptor accesible para preferencias booleanas. */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="switch-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? "is-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  );
}

function ProfileForm({ data }: { data: MeFull }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    displayName: data.user.displayName,
    bio: data.user.bio ?? "",
    websiteUrl: data.user.websiteUrl ?? "",
    avatarUrl: data.user.avatarUrl ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.updateProfile(form),
    onSuccess: () => { setErr(null); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e) => setErr(errMsg(e)),
  });

  return (
    <Surface className="coll" as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); mut.mutate(); }}>
      <h3>Datos del perfil</h3>
      <Field label="Nombre para mostrar">
        <Input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} maxLength={120} required />
      </Field>
      <Field label="Biografía" hint="Contá en qué andás. Máximo 2000 caracteres.">
        <Textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} maxLength={2000} placeholder="Desarrollador, lector, entusiasta de…" />
      </Field>
      <Field label="Sitio web">
        <Input value={form.websiteUrl} onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))} placeholder="https://tu-sitio.com" inputMode="url" />
      </Field>
      <Field label="Avatar (URL de imagen)" hint="Pegá el enlace a una imagen pública.">
        <Input value={form.avatarUrl} onChange={(e) => setForm((f) => ({ ...f, avatarUrl: e.target.value }))} placeholder="https://…/foto.jpg" inputMode="url" />
      </Field>
      <div className="row spread">
        <Note ok={mut.isSuccess} err={err} />
        <Button variant="accent" type="submit" loading={mut.isPending}>Guardar perfil</Button>
      </div>
    </Surface>
  );
}

function EmailForm({ current }: { current: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState(current);
  const [currentPassword, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.changeEmail({ email, currentPassword }),
    onSuccess: () => { setErr(null); setPw(""); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e) => setErr(errMsg(e)),
  });

  return (
    <Surface className="coll" as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); mut.mutate(); }}>
      <h3>Correo electrónico</h3>
      <Field label="Nuevo correo">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </Field>
      <Field label="Contraseña actual" hint="Por seguridad, confirmá tu contraseña para cambiar el correo.">
        <Input type="password" value={currentPassword} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
      </Field>
      <div className="row spread">
        <Note ok={mut.isSuccess} err={err} />
        <Button variant="soft" type="submit" loading={mut.isPending} disabled={!email || !currentPassword || email === current}>Cambiar correo</Button>
      </div>
    </Surface>
  );
}

function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => { setErr(null); setForm({ currentPassword: "", newPassword: "", confirm: "" }); },
    onError: (e) => setErr(errMsg(e)),
  });
  const mismatch = form.confirm.length > 0 && form.newPassword !== form.confirm;
  const tooShort = form.newPassword.length > 0 && form.newPassword.length < 12;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch || tooShort) { setErr(mismatch ? "Las contraseñas no coinciden." : "La nueva contraseña debe tener al menos 12 caracteres."); return; }
    mut.mutate();
  }

  return (
    <Surface className="coll" as="form" onSubmit={submit}>
      <h3>Contraseña</h3>
      <Field label="Contraseña actual">
        <Input type="password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} autoComplete="current-password" required />
      </Field>
      <Field label="Nueva contraseña" hint="Mínimo 12 caracteres." error={tooShort ? "Mínimo 12 caracteres." : undefined}>
        <Input type="password" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} autoComplete="new-password" required />
      </Field>
      <Field label="Repetir nueva contraseña" error={mismatch ? "No coincide." : undefined}>
        <Input type="password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} autoComplete="new-password" required />
      </Field>
      <div className="row spread">
        <Note ok={mut.isSuccess} err={err} />
        <Button variant="soft" type="submit" loading={mut.isPending} disabled={!form.currentPassword || !form.newPassword || !form.confirm}>Cambiar contraseña</Button>
      </div>
      {mut.isSuccess && <p className="field__hint">Se cerraron tus otras sesiones por seguridad.</p>}
    </Surface>
  );
}

const PREF_FIELDS: { key: keyof Omit<NotificationPrefs, "userId" | "updatedAt">; label: string }[] = [
  { key: "inAppEnabled", label: "Notificaciones dentro de la app" },
  { key: "emailEnabled", label: "Correos (interruptor principal)" },
  { key: "emailMentions", label: "Cuando me mencionan" },
  { key: "emailComments", label: "Comentarios en mi contenido" },
  { key: "emailReactions", label: "Reacciones a mi contenido" },
  { key: "emailFollows", label: "Nuevos seguidores" },
  { key: "emailEvents", label: "Eventos" },
  { key: "emailModeration", label: "Avisos de moderación" },
];

function NotificationsForm({ prefs }: { prefs: NotificationPrefs | null }) {
  const qc = useQueryClient();
  const base: Record<string, boolean> = {};
  for (const { key } of PREF_FIELDS) base[key] = prefs ? Boolean(prefs[key]) : true;
  const [state, setState] = useState(base);
  // Si llega una versión nueva desde el servidor, sincronizamos.
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const { key } of PREF_FIELDS) next[key] = prefs ? Boolean(prefs[key]) : true;
    setState(next);
  }, [prefs]);

  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.updateNotifications(state),
    onSuccess: () => { setErr(null); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e) => setErr(errMsg(e)),
  });

  return (
    <Surface className="coll" as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); mut.mutate(); }}>
      <h3>Notificaciones</h3>
      <div className="stack" style={{ gap: 2 }}>
        {PREF_FIELDS.map(({ key, label }) => (
          <Switch key={key} label={label} checked={state[key]} onChange={(v) => setState((s) => ({ ...s, [key]: v }))} />
        ))}
      </div>
      <div className="row spread">
        <Note ok={mut.isSuccess} err={err} />
        <Button variant="accent" type="submit" loading={mut.isPending}>Guardar preferencias</Button>
      </div>
    </Surface>
  );
}

export function Profile() {
  const { user, ready } = useAuth();
  const { data, isLoading, isError } = useQuery({ queryKey: ["profile"], queryFn: () => api.profile(), enabled: Boolean(user) });

  if (ready && !user) return <Navigate to="/auth" replace />;

  return (
    <Shell title="Mi perfil" subtitle="Tu información y preferencias de la cuenta.">
      {isLoading || !ready ? (
        <div className="stack"><Skeleton h={120} r={18} /><Skeleton h={220} r={18} /><Skeleton h={180} r={18} /></div>
      ) : isError || !data ? (
        <Surface><EmptyState icon="user" title="No pudimos cargar tu perfil" body="Revisá la conexión con la API e intentá de nuevo." /></Surface>
      ) : (
        <div className="stack" style={{ gap: 22 }}>
          <Surface className="profile-head">
            <span className="profile-head__av">
              {data.user.avatarUrl
                ? <img src={data.user.avatarUrl} alt={`Avatar de ${data.user.displayName}`} referrerPolicy="no-referrer" />
                : <span className="profile-head__ini">{data.user.displayName.trim().slice(0, 1).toUpperCase() || "·"}</span>}
            </span>
            <div className="profile-head__info">
              <h2>{data.user.displayName}</h2>
              <p className="post__meta"><span>@{data.user.username}</span><span className="post__dot" /><span>{data.user.email}</span></p>
              {data.user.bio && <p className="profile-head__bio">{data.user.bio}</p>}
              {data.user.websiteUrl && (
                <a className="profile-head__web" href={data.user.websiteUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="arrow" size={14} />{data.user.websiteUrl}
                </a>
              )}
              <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                <Badge tone="accent">{data.stats.posts} publicaciones</Badge>
                <Badge tone="accent">{data.stats.snippets} snippets</Badge>
                <Badge tone="accent">{data.stats.collections} colecciones</Badge>
                <Badge>Miembro desde {since(data.user.createdAt)}</Badge>
              </div>
            </div>
          </Surface>

          <div className="grid profile-grid">
            <ProfileForm data={data} />
            <NotificationsForm prefs={data.notifications} />
            <EmailForm current={data.user.email} />
            <PasswordForm />
          </div>
        </div>
      )}
    </Shell>
  );
}
