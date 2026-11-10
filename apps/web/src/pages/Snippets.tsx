import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Textarea, Skeleton, EmptyState, Badge } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, apiUrl, type Snippet } from "../lib/api";
import { useAuth } from "../context/AuthContext";

/** Fecha corta y legible: "10 nov 2026, 14:32". */
const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });

// ── Conexión con GitHub ───────────────────────────────────────────────

function GithubPanel({ onImported }: { onImported: () => void }) {
  const qc = useQueryClient();
  const [importando, setImportando] = useState(false);
  const [gist, setGist] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["github", "status"], queryFn: () => api.githubStatus() });

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
      onImported();
    },
  });

  if (isLoading) return <Skeleton h={72} r={18} />;
  // El servidor no tiene configurada la integración: no prometemos lo que no hay.
  if (!data?.enabled) return null;

  const conexion = data.connection;

  return (
    <Surface className="post">
      <div className="row spread" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <Icon name="repo" size={20} />
          <div>
            {conexion ? (
              <>
                <strong>GitHub conectado</strong>
                <div className="post__meta">
                  <span className="mono">@{conexion.login}</span>
                  <span className="post__dot" />
                  <span>desde {fecha(conexion.connectedAt)}</span>
                </div>
              </>
            ) : (
              <>
                <strong>Conectá tu cuenta de GitHub</strong>
                <div className="post__meta">
                  Publicá tus snippets como gists y tené historial de versiones real.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <Button variant="ghost" icon="download" onClick={() => setImportando((v) => !v)}>
            Importar gist
          </Button>
          {conexion ? (
            <Button variant="ghost" loading={desconectar.isPending} onClick={() => desconectar.mutate()}>
              Desconectar
            </Button>
          ) : (
            // Navegación real del navegador: el flujo de OAuth no es un fetch.
            <Button variant="accent" icon="external" onClick={() => { window.location.href = apiUrl("/github/connect"); }}>
              Conectar GitHub
            </Button>
          )}
        </div>
      </div>

      {importando && (
        <form
          className="row"
          style={{ gap: 10, marginTop: 14, alignItems: "flex-end", flexWrap: "wrap" }}
          onSubmit={(e) => { e.preventDefault(); importar.mutate(); }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <Field label="URL del gist" hint="Pegá gist.github.com/usuario/id — o sólo el id.">
              <Input value={gist} onChange={(e) => setGist(e.target.value)} placeholder="https://gist.github.com/…" required />
            </Field>
          </div>
          <Button variant="accent" type="submit" loading={importar.isPending} disabled={!gist.trim()}>
            Importar
          </Button>
          {importar.isError && <p className="field__error">{(importar.error as Error).message}</p>}
        </form>
      )}
    </Surface>
  );
}

// ── Historial de revisiones de un snippet ─────────────────────────────

function Revisiones({ snippetId }: { snippetId: string }) {
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
  if (isError) return <p className="field__error">{(error as Error).message}</p>;

  const revisiones = data?.revisions ?? [];
  if (revisiones.length === 0) return <p className="post__meta">Todavía no hay revisiones.</p>;

  return (
    <div className="stack" style={{ marginTop: 12, gap: 8 }}>
      {revisiones.map((r, i) => (
        <div key={r.sha}>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            style={{ justifyContent: "space-between" }}
            onClick={() => setSha(sha === r.sha ? null : r.sha)}
          >
            <span className="row" style={{ gap: 8 }}>
              <span className="mono">{r.sha.slice(0, 7)}</span>
              {i === 0 && <Badge tone="accent">actual</Badge>}
            </span>
            <span className="post__meta" style={{ margin: 0 }}>
              {r.authorLogin ? `@${r.authorLogin} · ` : ""}{fecha(r.committedAt)}
              {r.additions !== null && ` · +${r.additions} −${r.deletions ?? 0}`}
            </span>
          </button>

          {sha === r.sha && (
            detalle.isLoading ? (
              <Skeleton h={120} r={12} />
            ) : detalle.isError ? (
              <p className="field__error">{(detalle.error as Error).message}</p>
            ) : (
              detalle.data?.revision.files.map((f) => (
                <div key={f.filename} style={{ marginTop: 8 }}>
                  <div className="post__meta"><span className="mono">{f.filename}</span></div>
                  <pre className="code"><code>{f.truncated && !f.content ? "(archivo demasiado grande para mostrarlo)" : f.content}</code></pre>
                </div>
              ))
            )
          )}
        </div>
      ))}
    </div>
  );
}

// ── Acciones de GitHub sobre un snippet propio ────────────────────────

function AccionesGithub({ snippet }: { snippet: Snippet }) {
  const qc = useQueryClient();
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
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {snippet.gistId ? (
          <Button variant="ghost" icon="sync" loading={sincronizar.isPending} onClick={() => sincronizar.mutate()}>
            Traer de GitHub
          </Button>
        ) : (
          <Button variant="ghost" icon="external" loading={publicar.isPending} onClick={() => publicar.mutate()}>
            Publicar en GitHub
          </Button>
        )}
      </div>
      {error && <p className="field__error">{error.message}</p>}
    </div>
  );
}

// ── Formulario de alta ────────────────────────────────────────────────

function ShareForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", language: "", filename: "", sourceCode: "" });
  const mut = useMutation({
    mutationFn: () => api.createSnippet(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["snippets"] }); onClose(); },
  });
  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Surface className="post" as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); mut.mutate(); }}>
      <div className="row" style={{ gap: 14 }}>
        <div style={{ flex: 2, minWidth: 180 }}><Field label="Título"><Input value={form.title} onChange={upd("title")} placeholder="Debounce en TypeScript" required /></Field></div>
        <div style={{ flex: 1, minWidth: 120 }}><Field label="Lenguaje"><Input value={form.language} onChange={upd("language")} placeholder="typescript" required /></Field></div>
        <div style={{ flex: 1, minWidth: 120 }}><Field label="Archivo (opcional)"><Input value={form.filename} onChange={upd("filename")} placeholder="debounce.ts" /></Field></div>
      </div>
      <Field label="Código">
        <Textarea className="input input--area mono" value={form.sourceCode} onChange={upd("sourceCode")} placeholder="export function debounce(...) { … }" style={{ minHeight: 160 }} required />
      </Field>
      <div className="row spread">
        <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
        <Button variant="accent" type="submit" loading={mut.isPending} disabled={!form.title || !form.language || !form.sourceCode}>Compartir</Button>
      </div>
      {mut.isError && <p className="field__error">No se pudo compartir. ¿Iniciaste sesión?</p>}
    </Surface>
  );
}

// ── Página ────────────────────────────────────────────────────────────

/** Mensajes con los que vuelve el usuario del flujo de OAuth. */
const AVISOS: Record<string, string> = {
  conectado: "Listo: tu cuenta de GitHub quedó conectada.",
  cancelado: "Cancelaste la conexión con GitHub.",
  error: "No pudimos conectar con GitHub. Probá de nuevo.",
};

export function Snippets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sharing, setSharing] = useState(false);
  const [historial, setHistorial] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({ queryKey: ["snippets"], queryFn: () => api.snippets() });

  const aviso = params.get("github");
  const cerrarAviso = () => {
    params.delete("github");
    params.delete("motivo");
    setParams(params, { replace: true });
  };

  return (
    <Shell
      title="Snippets"
      subtitle="Fragmentos de código que la comunidad comparte, versionados en GitHub."
      actions={user
        ? <Button variant="accent" icon="plus" onClick={() => setSharing((v) => !v)}>Compartir snippet</Button>
        : <Button variant="accent" onClick={() => navigate("/auth")}>Ingresar para compartir</Button>}
    >
      {aviso && AVISOS[aviso] && (
        <Surface style={{ marginBottom: 16 }}>
          <div className="row spread">
            <span>{AVISOS[aviso]}</span>
            <Button variant="ghost" onClick={cerrarAviso}>Cerrar</Button>
          </div>
        </Surface>
      )}

      {user && (
        <div style={{ marginBottom: 20 }}>
          <GithubPanel onImported={() => undefined} />
        </div>
      )}

      {sharing && <div style={{ marginBottom: 20 }}><ShareForm onClose={() => setSharing(false)} /></div>}

      {isLoading ? (
        <div className="stack">{[0, 1].map((i) => <Skeleton key={i} h={160} r={18} />)}</div>
      ) : isError ? (
        <Surface><EmptyState icon="snippet" title="No pudimos cargar los snippets" body="Revisá la conexión con la API." /></Surface>
      ) : !data || data.items.length === 0 ? (
        <Surface><EmptyState icon="snippet" title="Todavía no hay snippets" body="Compartí el primer fragmento de código útil." action={user ? <Button variant="accent" icon="plus" onClick={() => setSharing(true)}>Compartir snippet</Button> : undefined} /></Surface>
      ) : (
        <div className="stack">
          {data.items.map((s: Snippet) => {
            const esMio = user?.username === s.authorUsername;
            return (
              <Surface key={s.id} className="post">
                <div className="row spread">
                  <div>
                    <h3>{s.title}</h3>
                    <div className="post__meta">
                      <span>@{s.authorUsername}</span>
                      {s.filename && <><span className="post__dot" /><span className="mono">{s.filename}</span></>}
                      {s.gistHtmlUrl && (
                        <>
                          <span className="post__dot" />
                          <a href={s.gistHtmlUrl} target="_blank" rel="noreferrer noopener">
                            gist de @{s.gistOwnerLogin ?? "github"}
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge tone="accent">{s.language}</Badge>
                </div>

                <pre className="code"><code>{s.sourceCode}</code></pre>

                <div className="row spread" style={{ gap: 10, flexWrap: "wrap" }}>
                  <div className="row" style={{ gap: 8 }}>
                    {s.gistId && (
                      <Button
                        variant="ghost"
                        icon="history"
                        onClick={() => setHistorial(historial === s.id ? null : s.id)}
                      >
                        {historial === s.id ? "Ocultar historial" : "Historial"}
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
    </Shell>
  );
}
