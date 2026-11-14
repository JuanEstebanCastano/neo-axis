/**
 * REPOSITORIOS DE GITHUB
 * ──────────────────────────────────────────────────────────────────────
 * Eliges un repo tuyo y trabajas con él sin salir de Neo Axis: miras sus
 * carpetas, abres un archivo, lo editas, subes archivos del disco y ves el
 * historial. Cada guardado es un commit con tu nombre, en tu cuenta.
 *
 * Nada de esto se guarda acá: el dueño de los archivos es GitHub y se
 * consultan en vivo. Lo único que recordamos es con qué repo venías
 * trabajando.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import {
  Surface,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Skeleton,
  EmptyState,
  Badge,
} from "../components/ui";
import { Icon } from "../components/Icon";
import {
  api,
  apiUrl,
  ApiError,
  type GithubConnection,
  type Repo,
  type RepoEntry,
} from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { peso } from "../lib/formato";

/**
 * Lee un archivo del disco como base64.
 * Pasa por base64 y no por texto porque es el único modo que soporta
 * binarios: una imagen leída como texto llega corrupta a GitHub.
 */
function leerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      const url = String(lector.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    lector.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
    lector.readAsDataURL(file);
  });
}

// ── Conectar la cuenta ────────────────────────────────────────────────

function PedirConexion({ motivo }: { motivo: "sin-conexion" | "sin-permiso" }) {
  const { t } = useI18n();
  const sinConexion = motivo === "sin-conexion";
  return (
    <Surface className="post">
      <EmptyState
        icon="repo"
        title={t(sinConexion ? "repos.connectTitle" : "repos.scopeTitle")}
        body={t(sinConexion ? "repos.connectBody" : "repos.scopeBody")}
        action={
          // Navegación real del navegador: el flujo de OAuth no es un fetch.
          <Button
            variant="accent"
            icon="external"
            onClick={() => {
              // ?desde: el callback devuelve acá y no a /snippets.
              window.location.href = apiUrl("/github/connect?desde=/repositorios");
            }}
          >
            {t(sinConexion ? "repos.connect" : "repos.reconnect")}
          </Button>
        }
      />
    </Surface>
  );
}

// ── Cuenta conectada ──────────────────────────────────────────

/**
 * Desde acá se suelta la cuenta. Antes esta página solo sabía conectar: una vez
 * conectado no quedaba forma de salir ni de cambiar de cuenta sin irse a la
 * página de snippets, que era la única que mostraba el botón.
 */
function PanelConexion({ conexion }: { conexion: GithubConnection }) {
  const qc = useQueryClient();
  const { t, dateTime } = useI18n();

  const desconectar = useMutation({
    mutationFn: () => api.githubDisconnect(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["github", "status"] });
      // Los repos en caché son de la cuenta que acaba de salir: si se quedan,
      // la siguiente cuenta ve por un instante los del anterior.
      qc.removeQueries({ queryKey: ["repos"] });
    },
  });

  return (
    <Surface className="post">
      <div className="row spread">
        <div className="row row--sm">
          <Icon name="repo" size={20} />
          <div>
            <strong>{t("github.connected")}</strong>
            <div className="post__meta">
              <span className="mono">@{conexion.login}</span>
              <span className="post__seg">
                <span className="post__dot" aria-hidden />
                <span>{t("github.since", { date: dateTime(conexion.connectedAt) })}</span>
              </span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          loading={desconectar.isPending}
          onClick={() => desconectar.mutate()}
        >
          {t("github.disconnect")}
        </Button>
      </div>
    </Surface>
  );
}

// ── Elegir repositorio ────────────────────────────────────────────────

function SelectorDeRepo({
  repos,
  actual,
  onElegir,
}: {
  repos: Repo[];
  actual: string | null;
  onElegir: (fullName: string) => void;
}) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const crear = useMutation({
    mutationFn: () =>
      api.createRepo({ name: form.name, description: form.description || undefined }),
    onSuccess: ({ repo }) => {
      qc.invalidateQueries({ queryKey: ["repos"] });
      setCreando(false);
      setForm({ name: "", description: "" });
      onElegir(repo.fullName);
    },
  });

  return (
    <Surface className="post">
      {/* Alineado abajo: el botón se apoya en la base del campo, no en su
          centro, que es donde quedaba flotando a media altura. */}
      <div className="row row--end">
        <Field label={t("repos.repo")} className="col col--lg">
          <Select value={actual ?? ""} onChange={(e) => e.target.value && onElegir(e.target.value)}>
            <option value="" disabled>
              {t("repos.choose")}
            </option>
            {repos.map((r) => (
              <option key={r.fullName} value={r.fullName}>
                {r.fullName}
                {r.language ? ` · ${r.language}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="ghost" icon="plus" onClick={() => setCreando((v) => !v)}>
          {t(creando ? "common.cancel" : "repos.newRepo")}
        </Button>
      </div>

      {repos.length === 0 && <p className="post__meta">{t("repos.noRepos")}</p>}

      {creando && (
        <form
          className="stack stack--md"
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <div className="row row--top">
            <Field label={t("repos.name")} hint={t("repos.nameHint")} className="col">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("repos.namePlaceholder")}
                required
              />
            </Field>
            <Field label={t("repos.desc")} className="col col--lg">
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("repos.descPlaceholder")}
              />
            </Field>
          </div>

          <p className="post__meta measure">{t("repos.createNote")}</p>

          <div className="row row--right">
            <Button variant="accent" type="submit" loading={crear.isPending} disabled={!form.name.trim()}>
              {t("common.create")}
            </Button>
          </div>

          {crear.isError && (
            <p className="field__error" role="alert">
              {(crear.error as Error).message}
            </p>
          )}
        </form>
      )}
    </Surface>
  );
}

// ── Migas de pan ──────────────────────────────────────────────────────

function Migas({ path, onIr }: { path: string; onIr: (p: string) => void }) {
  const { t } = useI18n();
  const partes = path.split("/").filter(Boolean);
  const enRaiz = partes.length === 0;
  return (
    <nav className="crumbs" aria-label={t("repos.breadcrumb")}>
      {/* La última miga es dónde estás parado, no un sitio al que ir: va como
          texto con aria-current, no como botón que navega hacia sí mismo.
          Deshabilitarlo en vez de eso lo habría dejado gris, que se lee como
          "no disponible" y no como "estás acá". */}
      {enRaiz ? (
        <span className="crumbs__here" aria-current="location">
          <Icon name="repo" size={15} />
          {t("repos.root")}
        </span>
      ) : (
        <button type="button" className="btn btn--ghost" onClick={() => onIr("")}>
          <Icon name="repo" size={15} />
          {t("repos.root")}
        </button>
      )}
      {partes.map((parte, i) => (
        <span key={i} className="crumbs__step">
          <span className="crumbs__sep" aria-hidden>
            /
          </span>
          {i === partes.length - 1 ? (
            <span className="crumbs__here" aria-current="location">
              {parte}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onIr(partes.slice(0, i + 1).join("/"))}
            >
              {parte}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}

// ── Subir archivos del disco ──────────────────────────────────────────

function SubirArchivos({
  owner,
  repo,
  directory,
  onListo,
}: {
  owner: string;
  repo: string;
  directory: string;
  onListo: () => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [elegidos, setElegidos] = useState<File[]>([]);

  const subir = useMutation({
    mutationFn: async () => {
      const files = await Promise.all(
        elegidos.map(async (f) => ({
          path: f.name,
          content: await leerBase64(f),
          encoding: "base64" as const,
        })),
      );
      return api.uploadRepoFiles(owner, repo, { files, directory });
    },
    onSuccess: () => {
      setElegidos([]);
      if (input.current) input.current.value = "";
      onListo();
    },
  });

  const resultado = subir.data;

  return (
    <div className="stack stack--md">
      <Field
        label={t("repos.upload")}
        hint={t("repos.uploadHint", { dir: directory ? `/${directory}` : t("repos.rootDir") })}
      >
        <input
          ref={input}
          className="input input--file"
          type="file"
          multiple
          onChange={(e) => setElegidos(Array.from(e.target.files ?? []))}
        />
      </Field>

      {elegidos.length > 0 && (
        <>
          <div className="stack stack--xs">
            {elegidos.map((f) => (
              <div key={f.name} className="row row--sm spread">
                <span className="mono">{f.name}</span>
                <span className="file-row__meta">{peso(f.size)}</span>
              </div>
            ))}
          </div>
          <div className="row row--right">
            <Button variant="accent" icon="upload" loading={subir.isPending} onClick={() => subir.mutate()}>
              {elegidos.length === 1
                ? t("repos.uploadOne")
                : t("repos.uploadMany", { n: elegidos.length })}
            </Button>
          </div>
        </>
      )}

      {subir.isError && (
        <p className="field__error" role="alert">
          {(subir.error as Error).message}
        </p>
      )}

      {resultado && (
        <div className="stack stack--xs" role="status">
          {resultado.subidos.map((s) => (
            <p key={s.path} className="result-line result-line--ok">
              <Icon name="check" size={14} />
              <span className="mono">{s.path}</span>
              <span aria-hidden>·</span>
              <a href={s.commitUrl} target="_blank" rel="noreferrer noopener">
                {s.commitSha.slice(0, 7)}
              </a>
            </p>
          ))}
          {resultado.fallos.map((f) => (
            <p key={f.path} className="field__error">
              <span className="mono">{f.path}</span>: {f.error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cuadro de código: crear o editar un archivo ───────────────────────

function EditorDeArchivo({
  owner,
  repo,
  path,
  contenidoInicial,
  sha,
  onGuardado,
  onCancelar,
}: {
  owner: string;
  repo: string;
  path: string;
  contenidoInicial: string;
  sha?: string | undefined;
  onGuardado: () => void;
  onCancelar?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const [ruta, setRuta] = useState(path);
  const [contenido, setContenido] = useState(contenidoInicial);
  const [mensaje, setMensaje] = useState("");

  // Si cambia el archivo abierto, el cuadro tiene que seguirlo.
  useEffect(() => {
    setRuta(path);
    setContenido(contenidoInicial);
    setMensaje("");
  }, [path, contenidoInicial]);

  const guardar = useMutation({
    mutationFn: () =>
      api.writeRepoFile(owner, repo, {
        path: ruta,
        content: contenido,
        encoding: "utf8",
        ...(mensaje.trim() ? { message: mensaje.trim() } : {}),
        // El sha sólo vale si seguimos editando el mismo archivo: si el
        // usuario cambió la ruta, está creando uno nuevo.
        ...(sha && ruta === path ? { sha } : {}),
      }),
    onSuccess: onGuardado,
  });

  const sinCambios = contenido === contenidoInicial && ruta === path;

  return (
    <div className="stack stack--md">
      <Field label={t("repos.filePath")} hint={t("repos.filePathHint")}>
        <Input
          className="mono"
          value={ruta}
          onChange={(e) => setRuta(e.target.value)}
          placeholder={t("repos.filePathPlaceholder")}
          required
        />
      </Field>

      <Field label={t("repos.content")}>
        <Textarea
          className="mono input--area-lg"
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder={t("repos.contentPlaceholder")}
        />
      </Field>

      <Field label={t("repos.commitMessage")}>
        <Input
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder={t(sha ? "repos.commitUpdate" : "repos.commitAdd", { path: ruta })}
        />
      </Field>

      <div className="row spread">
        {onCancelar ? (
          <Button variant="ghost" onClick={onCancelar}>
            {t("common.cancel")}
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant="accent"
          icon="upload"
          loading={guardar.isPending}
          disabled={!ruta.trim() || sinCambios}
          onClick={() => guardar.mutate()}
        >
          {t("repos.save")}
        </Button>
      </div>

      {sinCambios && <p className="post__meta">{t("repos.noChanges")}</p>}

      {guardar.isError && (
        <p className="field__error" role="alert">
          {(guardar.error as Error).message}
        </p>
      )}

      {guardar.data && (
        <p className="result-line result-line--ok" role="status">
          <Icon name="check" size={14} />
          {t(guardar.data.creado ? "repos.savedCreated" : "repos.savedUpdated")}
          <a href={guardar.data.commitUrl} target="_blank" rel="noreferrer noopener">
            {guardar.data.commitSha.slice(0, 7)}
          </a>
        </p>
      )}
    </div>
  );
}

// ── Historial ─────────────────────────────────────────────────────────

function Historial({ owner, repo, path }: { owner: string; repo: string; path?: string | undefined }) {
  const { t, dateTime } = useI18n();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["repos", owner, repo, "commits", path ?? ""],
    queryFn: () => api.repoCommits(owner, repo, path),
  });

  if (isLoading) return <Skeleton h={80} r={12} />;
  if (isError)
    return (
      <p className="field__error" role="alert">
        {(error as Error).message}
      </p>
    );

  const commits = data?.commits ?? [];
  if (commits.length === 0) return <p className="post__meta">{t("repos.noCommits")}</p>;

  return (
    <div className="stack stack--sm">
      {commits.map((c, i) => (
        <div key={c.sha} className="row row--sm spread">
          <span className="row row--sm">
            <a className="mono" href={c.htmlUrl} target="_blank" rel="noreferrer noopener">
              {c.sha.slice(0, 7)}
            </a>
            {i === 0 && <Badge tone="accent">{t("repos.latest")}</Badge>}
            <span>{c.message.split("\n")[0]}</span>
          </span>
          <span className="file-row__meta">
            {c.authorLogin ? `@${c.authorLogin} · ` : c.authorName ? `${c.authorName} · ` : ""}
            {c.committedAt ? dateTime(c.committedAt) : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Explorador ────────────────────────────────────────────────────────

function Explorador({ owner, repo }: { owner: string; repo: string }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [path, setPath] = useState("");
  const [creando, setCreando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  // Al cambiar de repo volvemos a la raíz: la ruta anterior no existe acá.
  useEffect(() => {
    setPath("");
    setCreando(false);
  }, [owner, repo]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["repos", owner, repo, "contents", path],
    queryFn: () => api.repoContents(owner, repo, path),
    retry: false,
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["repos", owner, repo] });
  };

  const borrar = useMutation({
    mutationFn: (entrada: { path: string; sha: string }) => api.deleteRepoFile(owner, repo, entrada),
    onSuccess: () => {
      setPath(path.split("/").slice(0, -1).join("/"));
      refrescar();
    },
  });

  const carpetaActual = data?.kind === "file" ? path.split("/").slice(0, -1).join("/") : path;

  return (
    <div className="stack stack--md">
      <Surface className="post">
        <div className="row spread">
          <Migas
            path={path}
            onIr={(p) => {
              setPath(p);
              setCreando(false);
            }}
          />
          <div className="row row--sm">
            <Button
              variant="ghost"
              icon="history"
              aria-expanded={verHistorial}
              onClick={() => setVerHistorial((v) => !v)}
            >
              {t(verHistorial ? "repos.hideHistory" : "repos.history")}
            </Button>
            <Button variant="ghost" icon="plus" onClick={() => setCreando((v) => !v)}>
              {t(creando ? "common.cancel" : "repos.newFile")}
            </Button>
          </div>
        </div>
        {verHistorial && (
          <Historial owner={owner} repo={repo} path={data?.kind === "file" ? path : undefined} />
        )}
      </Surface>

      {creando && (
        <Surface className="post">
          <h3>{t("repos.newFile")}</h3>
          <EditorDeArchivo
            owner={owner}
            repo={repo}
            path={carpetaActual ? `${carpetaActual}/` : ""}
            contenidoInicial=""
            onGuardado={() => {
              setCreando(false);
              refrescar();
            }}
            onCancelar={() => setCreando(false)}
          />
        </Surface>
      )}

      {isLoading && <Skeleton h={200} r={14} />}

      {isError && (
        <Surface className="post">
          {(error as ApiError).status === 404 ? (
            <EmptyState
              icon="folder"
              title={t("repos.emptyHereTitle")}
              body={t("repos.emptyHereBody")}
            />
          ) : (
            <p className="field__error" role="alert">
              {(error as Error).message}
            </p>
          )}
        </Surface>
      )}

      {data?.kind === "dir" && (
        <Surface className="post">
          {data.entries.length === 0 ? (
            <EmptyState
              icon="folder"
              title={t("repos.emptyFolderTitle")}
              body={t("repos.emptyFolderBody")}
            />
          ) : (
            <div className="stack stack--xs">
              {data.entries.map((e: RepoEntry) => (
                <button
                  key={e.path}
                  type="button"
                  className="btn btn--ghost btn--row"
                  onClick={() => setPath(e.path)}
                  disabled={e.type !== "dir" && e.type !== "file"}
                >
                  <span className="file-row__name">
                    <Icon name={e.type === "dir" ? "folder" : "file"} size={15} />
                    <span className={e.type === "dir" ? "" : "mono"}>{e.name}</span>
                  </span>
                  <span className="file-row__meta">{e.type === "file" ? peso(e.size) : ""}</span>
                </button>
              ))}
            </div>
          )}
        </Surface>
      )}

      {data?.kind === "file" && (
        <Surface className="post">
          <div className="row row--top spread">
            <h3 className="mono">{data.file.name}</h3>
            <div className="row row--sm">
              <Badge>{peso(data.file.size)}</Badge>
              {data.file.htmlUrl && (
                <a
                  className="btn btn--ghost"
                  href={data.file.htmlUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Icon name="external" size={15} />
                  <span className="btn__label">{t("repos.viewOnGithub")}</span>
                </a>
              )}
              <Button
                variant="ghost"
                icon="trash"
                loading={borrar.isPending}
                onClick={() => {
                  if (confirm(t("repos.confirmDelete", { path: data.file.path }))) {
                    borrar.mutate({ path: data.file.path, sha: data.file.sha });
                  }
                }}
              >
                {t("repos.delete")}
              </Button>
            </div>
          </div>

          {borrar.isError && (
            <p className="field__error" role="alert">
              {(borrar.error as Error).message}
            </p>
          )}

          {data.file.tooLarge ? (
            <EmptyState icon="file" title={t("repos.tooLargeTitle")} body={t("repos.tooLargeBody")} />
          ) : data.file.binary ? (
            <EmptyState icon="file" title={t("repos.binaryTitle")} body={t("repos.binaryBody")} />
          ) : (
            <EditorDeArchivo
              owner={owner}
              repo={repo}
              path={data.file.path}
              contenidoInicial={data.file.text ?? ""}
              sha={data.file.sha}
              onGuardado={refrescar}
            />
          )}
        </Surface>
      )}

      <Surface className="post">
        <SubirArchivos owner={owner} repo={repo} directory={carpetaActual} onListo={refrescar} />
      </Surface>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────

export function Repos() {
  const qc = useQueryClient();
  const { t } = useI18n();

  const estado = useQuery({ queryKey: ["github", "status"], queryFn: () => api.githubStatus() });

  const lista = useQuery({
    queryKey: ["repos"],
    queryFn: () => api.repos(),
    enabled: Boolean(estado.data?.connection),
    retry: false,
  });

  const elegir = useMutation({
    mutationFn: (fullName: string) => api.setDefaultRepo(fullName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }),
  });

  const title = t("repos.title");
  const subtitle = t("repos.subtitle");

  if (estado.isLoading) {
    return (
      <Shell title={title} subtitle={subtitle}>
        <Skeleton h={200} r={14} />
      </Shell>
    );
  }

  if (!estado.data?.enabled) {
    return (
      <Shell title={title} subtitle={subtitle}>
        <Surface className="post">
          <EmptyState
            icon="repo"
            title={t("repos.notConfiguredTitle")}
            body={t("repos.notConfiguredBody")}
          />
        </Surface>
      </Shell>
    );
  }

  if (!estado.data.connection) {
    return (
      <Shell title={title} subtitle={subtitle}>
        <PedirConexion motivo="sin-conexion" />
      </Shell>
    );
  }

  // La conexión existe pero es anterior al permiso de repositorios.
  if (lista.isError && (lista.error as ApiError).code === "github_scope_missing") {
    return (
      <Shell title={title} subtitle={subtitle}>
        <PedirConexion motivo="sin-permiso" />
      </Shell>
    );
  }

  const elegido = lista.data?.defaultRepo ?? null;
  const partes = elegido?.split("/") ?? [];
  const owner = partes[0];
  const repo = partes[1];

  return (
    <Shell title={title} subtitle={subtitle}>
      <div className="stack stack--md">
        <PanelConexion conexion={estado.data.connection} />

        {lista.isLoading ? (
          <Skeleton h={90} r={14} />
        ) : lista.isError ? (
          <Surface className="post">
            <p className="field__error" role="alert">
              {(lista.error as Error).message}
            </p>
          </Surface>
        ) : (
          <SelectorDeRepo
            repos={lista.data?.repos ?? []}
            actual={elegido}
            onElegir={(fullName) => elegir.mutate(fullName)}
          />
        )}

        {owner && repo ? (
          <Explorador owner={owner} repo={repo} />
        ) : (
          !lista.isLoading && (
            <Surface className="post">
              <EmptyState icon="repo" title={t("repos.pickTitle")} body={t("repos.pickBody")} />
            </Surface>
          )
        )}
      </div>
    </Shell>
  );
}
