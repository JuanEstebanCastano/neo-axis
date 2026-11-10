import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import {
  Surface,
  Button,
  Field,
  Input,
  Textarea,
  Skeleton,
  EmptyState,
  Badge,
  FormFoot,
} from "../components/ui";
import { Icon } from "../components/Icon";
import { api, ApiError, type MeFull, type NotificationPrefs } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import type { TranslationKey } from "../i18n";

/** Mensaje de resultado al pie de cada formulario. */
function Note({ ok, err }: { ok?: boolean; err?: string | null }) {
  const { t } = useI18n();
  if (err)
    return (
      <p className="field__error" role="alert">
        {err}
      </p>
    );
  if (ok) return <p className="field__ok">{t("profile.saved")}</p>;
  return null;
}

/** Interruptor accesible para preferencias booleanas. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
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
  const { t } = useI18n();
  const [form, setForm] = useState({
    displayName: data.user.displayName,
    bio: data.user.bio ?? "",
    websiteUrl: data.user.websiteUrl ?? "",
    avatarUrl: data.user.avatarUrl ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.updateProfile(form),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.saveFailed")),
  });

  return (
    <Surface
      className="coll"
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <h3>{t("profile.dataTitle")}</h3>
      <Field label={t("profile.displayName")}>
        <Input
          value={form.displayName}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          maxLength={120}
          autoComplete="name"
          required
        />
      </Field>
      <Field label={t("profile.bio")} hint={t("profile.bioHint")}>
        <Textarea
          value={form.bio}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          maxLength={2000}
          placeholder={t("profile.bioPlaceholder")}
        />
      </Field>
      <Field label={t("profile.website")}>
        <Input
          type="url"
          value={form.websiteUrl}
          onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
          placeholder={t("profile.websitePlaceholder")}
          inputMode="url"
        />
      </Field>
      <Field label={t("profile.avatar")} hint={t("profile.avatarHint")}>
        <Input
          type="url"
          value={form.avatarUrl}
          onChange={(e) => setForm((f) => ({ ...f, avatarUrl: e.target.value }))}
          placeholder={t("profile.avatarPlaceholder")}
          inputMode="url"
        />
      </Field>
      <FormFoot note={<Note ok={mut.isSuccess} err={err} />}>
        <Button variant="accent" type="submit" loading={mut.isPending}>
          {t("profile.saveProfile")}
        </Button>
      </FormFoot>
    </Surface>
  );
}

function EmailForm({ current }: { current: string }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [email, setEmail] = useState(current);
  const [currentPassword, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.changeEmail({ email, currentPassword }),
    onSuccess: () => {
      setErr(null);
      setPw("");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.saveFailed")),
  });

  return (
    <Surface
      className="coll"
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <h3>{t("profile.emailTitle")}</h3>
      <Field label={t("profile.newEmail")}>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>
      <Field label={t("profile.currentPassword")} hint={t("profile.currentPasswordHint")}>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>
      <FormFoot note={<Note ok={mut.isSuccess} err={err} />}>
        <Button
          variant="soft"
          type="submit"
          loading={mut.isPending}
          disabled={!email || !currentPassword || email === current}
        >
          {t("profile.changeEmail")}
        </Button>
      </FormFoot>
    </Surface>
  );
}

function PasswordForm() {
  const { t } = useI18n();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () =>
      api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      setErr(null);
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.saveFailed")),
  });

  const mismatch = form.confirm.length > 0 && form.newPassword !== form.confirm;
  const tooShort = form.newPassword.length > 0 && form.newPassword.length < 12;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch || tooShort) {
      setErr(t(mismatch ? "reset.mismatchLong" : "reset.tooShortLong"));
      return;
    }
    mut.mutate();
  }

  return (
    <Surface className="coll" as="form" onSubmit={submit}>
      <h3>{t("profile.passwordTitle")}</h3>
      <Field label={t("profile.currentPassword")}>
        <Input
          type="password"
          value={form.currentPassword}
          onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
          autoComplete="current-password"
          required
        />
      </Field>
      <Field
        label={t("profile.newPassword")}
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
      <Field label={t("profile.repeatNewPassword")} error={mismatch ? t("reset.mismatch") : undefined}>
        <Input
          type="password"
          value={form.confirm}
          onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          autoComplete="new-password"
          required
        />
      </Field>
      <FormFoot note={<Note ok={mut.isSuccess} err={err} />}>
        <Button
          variant="soft"
          type="submit"
          loading={mut.isPending}
          disabled={!form.currentPassword || !form.newPassword || !form.confirm}
        >
          {t("profile.changePassword")}
        </Button>
      </FormFoot>
      {mut.isSuccess && <p className="field__hint">{t("profile.sessionsClosed")}</p>}
    </Surface>
  );
}

const PREF_FIELDS: {
  key: keyof Omit<NotificationPrefs, "userId" | "updatedAt">;
  label: TranslationKey;
}[] = [
  { key: "inAppEnabled", label: "prefs.inAppEnabled" },
  { key: "emailEnabled", label: "prefs.emailEnabled" },
  { key: "emailMentions", label: "prefs.emailMentions" },
  { key: "emailComments", label: "prefs.emailComments" },
  { key: "emailReactions", label: "prefs.emailReactions" },
  { key: "emailFollows", label: "prefs.emailFollows" },
  { key: "emailEvents", label: "prefs.emailEvents" },
  { key: "emailModeration", label: "prefs.emailModeration" },
];

function readPrefs(prefs: NotificationPrefs | null): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const { key } of PREF_FIELDS) next[key] = prefs ? Boolean(prefs[key]) : true;
  return next;
}

function NotificationsForm({ prefs }: { prefs: NotificationPrefs | null }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [state, setState] = useState(() => readPrefs(prefs));

  // Si llega una versión nueva desde el servidor, sincronizamos.
  useEffect(() => setState(readPrefs(prefs)), [prefs]);

  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.updateNotifications(state),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.saveFailed")),
  });

  return (
    <Surface
      className="coll"
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <h3>{t("profile.notificationsTitle")}</h3>
      <div className="stack stack--xs">
        {PREF_FIELDS.map(({ key, label }) => (
          <Switch
            key={key}
            label={t(label)}
            checked={state[key] ?? false}
            onChange={(v) => setState((s) => ({ ...s, [key]: v }))}
          />
        ))}
      </div>
      <FormFoot note={<Note ok={mut.isSuccess} err={err} />}>
        <Button variant="accent" type="submit" loading={mut.isPending}>
          {t("profile.savePrefs")}
        </Button>
      </FormFoot>
    </Surface>
  );
}

export function Profile() {
  const { user, ready } = useAuth();
  const { t, monthYear } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.profile(),
    enabled: Boolean(user),
  });

  // Cerrar sesión se hace desde el pie de la barra lateral (o desde la fila
  // de utilidades en el teléfono); al quedarse sin usuario, esta vista se
  // va sola a la pantalla de ingreso.
  if (ready && !user) return <Navigate to="/auth" replace />;

  return (
    <Shell
      title={t("profile.title")}
      subtitle={t("profile.subtitle")}
    >
      {isLoading || !ready ? (
        <div className="stack">
          <Skeleton h={120} r={18} />
          <Skeleton h={220} r={18} />
          <Skeleton h={180} r={18} />
        </div>
      ) : isError || !data ? (
        <Surface>
          <EmptyState icon="user" title={t("profile.errorTitle")} body={t("profile.errorBody")} />
        </Surface>
      ) : (
        <div className="stack stack--lg">
          <Surface className="profile-head">
            <span className="profile-head__av">
              {data.user.avatarUrl ? (
                <img
                  src={data.user.avatarUrl}
                  alt={t("profile.avatarAlt", { name: data.user.displayName })}
                  width={76}
                  height={76}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="profile-head__ini" aria-hidden>
                  {data.user.displayName.trim().slice(0, 1).toUpperCase() || "·"}
                </span>
              )}
            </span>

            <div className="profile-head__info">
              <h2>{data.user.displayName}</h2>
              <p className="post__meta">
                <span>@{data.user.username}</span>
                <span className="post__seg">
                  <span className="post__dot" aria-hidden />
                  <span>{data.user.email}</span>
                </span>
              </p>
              {data.user.bio && <p className="profile-head__bio">{data.user.bio}</p>}
              {data.user.websiteUrl && (
                <a
                  className="profile-head__web"
                  href={data.user.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="external" size={14} />
                  {data.user.websiteUrl}
                </a>
              )}
              <div className="row row--sm profile-head__stats">
                <Badge tone="accent">{t("profile.statPosts", { n: data.stats.posts })}</Badge>
                <Badge tone="accent">{t("profile.statSnippets", { n: data.stats.snippets })}</Badge>
                <Badge tone="accent">{t("profile.statCollections", { n: data.stats.collections })}</Badge>
                <Badge>{t("profile.memberSince", { date: monthYear(data.user.createdAt) })}</Badge>
              </div>
            </div>
          </Surface>

          <div className="profile-grid">
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
