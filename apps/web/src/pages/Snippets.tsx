import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Textarea, Skeleton, EmptyState, Badge } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, apiUrl, type Snippet } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import type { TranslationKey } from "../i18n";

// ── Conexión con GitHub ───────────────────────────────────────────────

function GithubPanel() {
  const qc = useQueryClient();
  const { t, dateTime } = useI18n();
  const [importando, setImportando] = useState(false);
  const [gist, setGist] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["github", "status"],
    queryFn: () => api.githubStatus(),
  });

  const desconectar = useMutation({
    mutationFn: () => api.githubDisconnect(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["github", "status"] }),
  });

  const importar = useMutation({
    mutationFn: () => api.importGist(gist),
    onSuccess: () => {
      setGist("");
      setImportando(false);
      qc.invalidateQueries({ queryKey: ["snippets"] });
    },
  });

  if (isLoading) return <Skeleton h={72} r={18} />;
  // El servidor no tiene configurada la integración: no prometemos lo que no hay.
  if (!data?.enabled) return null;

  const conexion = data.connection;

  return (
    <Surface className="post">
      <div className="row spread">
        <div className="row row--sm">
          <Icon name="repo" size={20} />
          <div>
            {conexion ? (
              <>
                <strong>{t("github.connected")}</strong>
                <div className="post__meta">
                  <span className="mono">@{conexion.login}</span>
                  <span className="post__seg">
                    <span className="post__dot" aria-hidden />
                    <span>{t("github.since", { date: dateTime(conexion.connectedAt) })}</span>
                  </span>
                </div>
              </>
            ) : (
              <>
                <strong>{t("github.connectTitle")}</strong>
                <div className="post__meta">{t("github.connectBody")}</div>
              </>
            )}
          </div>
        </div>

        <div className="row row--sm">
          <Button variant="ghost" icon="download" onClick={() => setImportando((v) => !v)}>
            {t("github.importGist")}
          </Button>
          {conexion ? (
            <Button variant="ghost" loading={desconectar.isPending} onClick={() => desconectar.mutate()}>
              {t("github.disconnect")}
            </Button>
          ) : (
            // Navegación real del navegador: el flujo de OAuth no es un fetch.
            <Button
              variant="accent"
              icon="external"
              onClick={() => {
                window.location.href = apiUrl("/github/connect");
              }}
            >
              {t("github.connect")}
            </Button>
          )}
        </div>
      </div>

      {importando && (
        <form
          className="row row--end"
          onSubmit={(e) => {
            e.preventDefault();
            importar.mutate();
          }}
        >
          <Field label={t("github.gistUrl")} hint={t("github.gistUrlHint")} className="col col--lg">
            <Input
              type="url"
              value={gist}
              onChange={(e) => setGist(e.target.value)}
              placeholder="https://gist.github.com/…"
              required
            />
          </Field>
          <Button variant="accent" type="submit" loading={importar.isPending} disabled={!gist.trim()}>
            {t("github.import")}
          </Button>
          {importar.isError && (
            <p className="field__error" role="alert">
              {(importar.error as Error).message}
            </p>
          )}
        </form>
      )}
    </Surface>
  );
}

// ── Historial de revisiones de un snippet ─────────────────────────────

function Revisiones({ snippetId }: { snippetId: string }) {
  const { t, dateTime } = useI18n();
  const [sha, setSha] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["snippets", snippetId, "revisions"],
    queryFn: () => api.snippetRevisions(snippetId),
  });

  const detalle = useQuery({
    queryKey: ["snippets", snippetId, "revisions", sha],
    queryFn: () => api.snippetRevision(snippetId, sha as string),
    enabled: sha !== null,
  });

  if (isLoading) return <Skeleton h={80} r={12} />;
  if (isError)
    return (
      <p className="field__error" role="alert">
        {(error as Error).message}
      </p>
    );

  const revisiones = data?.revisions ?? [];
  if (revisiones.length === 0) return <p className="post__meta">{t("snippets.noRevisions")}</p>;

  return (
    <div className="stack stack--sm">
      {revisiones.map((r, i) => (
        <div key={r.sha}>
          <button
            type="button"
            className="btn btn--ghost btn--row"
            aria-expanded={sha === r.sha}
            onClick={() => setSha(sha === r.sha ? null : r.sha)}
          >
            <span className="file-row__name">
              <span className="mono">{r.sha.slice(0, 7)}</span>
              {i === 0 && <Badge tone="accent">{t("snippets.current")}</Badge>}
            </span>
            <span className="file-row__meta">
              {r.authorLogin ? `@${r.authorLogin} · ` : ""}
              {dateTime(r.committedAt)}
              {r.additions !== null && ` · +${r.additions} −${r.deletions ?? 0}`}
            </span>
          </button>

          {sha === r.sha &&
            (detalle.isLoading ? (
              <Skeleton h={120} r={12} />
            ) : detalle.isError ? (
              <p className="field__error" role="alert">
                {(detalle.error as Error).message}
              </p>
            ) : (
              detalle.data?.revision.files.map((f) => (
                <div key={f.filename} className="revision__file">
                  <div className="post__meta">
                    <span className="mono">{f.filename}</span>
                  </div>
                  <pre className="code" tabIndex={0}>
                    <code>{f.truncated && !f.content ? t("snippets.fileTooBig") : f.content}</code>
                  </pre>
                </div>
              ))
            ))}
        </div>
      ))}
    </div>
  );
}

// ── Acciones de GitHub sobre un snippet propio ────────────────────────

function AccionesGithub({ snippet }: { snippet: Snippet }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["snippets"] });
    qc.invalidateQueries({ queryKey: ["snippets", snippet.id, "revisions"] });
  };

  const publicar = useMutation({
    mutationFn: () => api.publishSnippetAsGist(snippet.id, true),
    onSuccess: refrescar,
  });
  const sincronizar = useMutation({
    mutationFn: () => api.syncSnippet(snippet.id),
    onSuccess: refrescar,
  });

  const error = (publicar.error ?? sincronizar.error) as Error | null;

  return (
    <div className="stack stack--sm gh-actions">
      {/* El botón solo dice a dónde va; la línea de abajo dice qué consigue.
          Sin ella, "Publicar" y "Traer" se leían como lo mismo al revés. */}
      {snippet.gistId ? (
        <>
          <Button variant="ghost" icon="sync" loading={sincronizar.isPending} onClick={() => sincronizar.mutate()}>
            {t("github.pull")}
          </Button>
          <span className="action-hint">{t("github.pullHint")}</span>
        </>
      ) : (
        <>
          <Button variant="ghost" icon="external" loading={publicar.isPending} onClick={() => publicar.mutate()}>
            {t("github.publish")}
          </Button>
          <span className="action-hint">{t("github.publishHint")}</span>
        </>
      )}
      {error && (
        <p className="field__error" role="alert">
          {error.message}
        </p>
      )}
    </div>
  );
}

// ── Formulario de alta ────────────────────────────────────────────────

function ShareForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [form, setForm] = useState({ title: "", language: "", filename: "", sourceCode: "" });
  const mut = useMutation({
    mutationFn: () => api.createSnippet(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snippets"] });
      onClose();
    },
  });
  const upd =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Surface
      className="post"
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      {/* Alineadas por arriba: los campos tienen etiquetas de una línea, pero
          uno con error crece y no debe arrastrar a los otros dos. */}
      <div className="row row--top">
        <Field label={t("snippets.formTitle")} hint={t("snippets.formTitleHint")} className="col col--lg">
          <Input
            value={form.title}
            onChange={upd("title")}
            placeholder={t("snippets.formTitlePlaceholder")}
            required
          />
        </Field>
        <Field label={t("snippets.language")} hint={t("snippets.languageHint")} className="col col--sm">
          <Input
            value={form.language}
            onChange={upd("language")}
            placeholder={t("snippets.languagePlaceholder")}
            required
          />
        </Field>
        <Field label={t("snippets.filename")} hint={t("snippets.filenameHint")} className="col col--sm">
          <Input
            value={form.filename}
            onChange={upd("filename")}
            placeholder={t("snippets.filenamePlaceholder")}
          />
        </Field>
      </div>

      <Field label={t("snippets.code")}>
        <Textarea
          className="mono input--area-md"
          value={form.sourceCode}
          onChange={upd("sourceCode")}
          placeholder={t("snippets.codePlaceholder")}
          required
        />
      </Field>

      <div className="row spread">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="accent"
          type="submit"
          loading={mut.isPending}
          disabled={!form.title || !form.language || !form.sourceCode}
        >
          {t("snippets.submit")}
        </Button>
      </div>

      {mut.isError && (
        <p className="field__error" role="alert">
          {t("snippets.shareFailed")}
        </p>
      )}
    </Surface>
  );
}

// ── Página ────────────────────────────────────────────────────────────

/** Mensajes con los que vuelve el usuario del flujo de OAuth. */
const AVISOS: Record<string, TranslationKey> = {
  conectado: "github.noticeConnected",
  cancelado: "github.noticeCancelled",
  error: "github.noticeError",
};

export function Snippets() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sharing, setSharing] = useState(false);
  const [historial, setHistorial] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({ queryKey: ["snippets"], queryFn: () => api.snippets() });

  const aviso = params.get("github");
  const avisoKey = aviso ? AVISOS[aviso] : undefined;
  const cerrarAviso = () => {
    params.delete("github");
    params.delete("motivo");
    setParams(params, { replace: true });
  };

  return (
    <Shell
      title={t("snippets.title")}
      subtitle={t("snippets.subtitle")}
      actions={
        user ? (
          <Button variant="accent" icon="plus" onClick={() => setSharing((v) => !v)}>
            {t("snippets.share")}
          </Button>
        ) : (
          <Button variant="accent" onClick={() => navigate("/auth")}>
            {t("snippets.signInToShare")}
          </Button>
        )
      }
    >
      {avisoKey && (
        <Surface className={`notice block-gap ${aviso === "error" ? "notice--alert" : ""}`} role="status">
          <span className="notice__text">
            <Icon name={aviso === "conectado" ? "check" : "alert"} size={17} />
            {t(avisoKey)}
          </span>
          <Button variant="ghost" onClick={cerrarAviso}>
            {t("common.close")}
          </Button>
        </Surface>
      )}

      {sharing && (
        <div className="block-gap">
          <ShareForm onClose={() => setSharing(false)} />
        </div>
      )}

      {isLoading ? (
        <div className="stack">
          {[0, 1].map((i) => (
            <Skeleton key={i} h={160} r={18} />
          ))}
        </div>
      ) : isError ? (
        <Surface>
          <EmptyState icon="snippet" title={t("snippets.errorTitle")} body={t("common.checkApi")} />
        </Surface>
      ) : !data || data.items.length === 0 ? (
        <Surface>
          <EmptyState
            icon="snippet"
            title={t("snippets.emptyTitle")}
            body={t("snippets.emptyBody")}
            action={
              user ? (
                <Button variant="accent" icon="plus" onClick={() => setSharing(true)}>
                  {t("snippets.share")}
                </Button>
              ) : undefined
            }
          />
        </Surface>
      ) : (
        <div className="stack">
          {data.items.map((s: Snippet) => {
            const esMio = user?.username === s.authorUsername;
            return (
              <Surface key={s.id} className="post">
                <div className="row row--top spread">
                  <div className="grow">
                    <h3>{s.title}</h3>
                    <div className="post__meta">
                      <span>@{s.authorUsername}</span>
                      {s.filename && (
                        <span className="post__seg">
                          <span className="post__dot" aria-hidden />
                          <span className="mono">{s.filename}</span>
                        </span>
                      )}
                      {s.gistHtmlUrl && (
                        <span className="post__seg">
                          <span className="post__dot" aria-hidden />
                          <a href={s.gistHtmlUrl} target="_blank" rel="noreferrer noopener">
                            {t("github.gistBy", { login: s.gistOwnerLogin ?? "github" })}
                          </a>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="row row--sm">
                    {s.gistId && <Badge>{t("snippets.versioned")}</Badge>}
                    <Badge tone="accent">{s.language}</Badge>
                  </div>
                </div>

                <pre className="code" tabIndex={0}>
                  <code>{s.sourceCode}</code>
                </pre>

                <div className="row spread">
                  <div className="row row--sm">
                    {s.gistId && (
                      <Button
                        variant="ghost"
                        icon="history"
                        aria-expanded={historial === s.id}
                        onClick={() => setHistorial(historial === s.id ? null : s.id)}
                      >
                        {t(historial === s.id ? "snippets.hideHistory" : "snippets.history")}
                      </Button>
                    )}
                  </div>
                  {esMio && <AccionesGithub snippet={s} />}
                </div>

                {historial === s.id && <Revisiones snippetId={s.id} />}
              </Surface>
            );
          })}
        </div>
      )}

      {/* La conexión con GitHub va DESPUÉS del contenido: es configuración
          opcional, y arriba era lo primero que veía alguien que entraba a
          mirar código, antes de ver una sola línea. */}
      {user && (
        <div className="gh-panel">
          <GithubPanel />
        </div>
      )}
    </Shell>
  );
}
