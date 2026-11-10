/**
 * REPOSITORIOS DE GITHUB
 * ──────────────────────────────────────────────────────────────────────
 * Elegís un repo tuyo y trabajás con él sin salir de Neo Axis: mirás sus
 * carpetas, abrís un archivo, lo editás, subís archivos del disco y ves el
 * historial. Cada guardado es un commit con tu nombre, en tu cuenta.
 *
 * Nada de esto se guarda acá: el dueño de los archivos es GitHub y se
 * consultan en vivo. Lo único que recordamos es con qué repo venías
 * trabajando.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Textarea, Skeleton, EmptyState, Badge } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, apiUrl, ApiError, type Repo, type RepoEntry } from "../lib/api";

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" }) : "";

/** 1,2 MB -> "1.2 MB". Para que el tamaño diga algo a simple vista. */
function peso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

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
  return (
    <Surface className="post">
      <EmptyState
        icon="repo"
        title={motivo === "sin-conexion" ? "Conectá tu cuenta de GitHub" : "Tu conexión necesita un permiso más"}
        body={
          motivo === "sin-conexion"
            ? "Para ver y escribir en tus repositorios, Neo Axis necesita que autorices tu cuenta."
            : "Conectaste tu cuenta antes de que existiera esta función. Volvé a conectarla para darle acceso a tus repositorios públicos."
        }
        action={
          // Navegación real del navegador: el flujo de OAuth no es un fetch.
          <Button
            variant="accent"
            icon="external"
            onClick={() => {
              window.location.href = apiUrl("/github/connect");
            }}
          >
            {motivo === "sin-conexion" ? "Conectar GitHub" : "Reconectar GitHub"}
          </Button>
        }
      />
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
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const crear = useMutation({
    mutationFn: () => api.createRepo({ name: form.name, description: form.description || undefined }),
    onSuccess: ({ repo }) => {
      qc.invalidateQueries({ queryKey: ["repos"] });
      setCreando(false);
      setForm({ name: "", description: "" });
      onElegir(repo.fullName);
    },
  });

  return (
    <Surface className="post">
      <div className="row spread" style={{ gap: 12, flexWrap: "wrap" }}>
        <Field label="Repositorio">
          <select
            className="input"
            value={actual ?? ""}
            onChange={(e) => e.target.value && onElegir(e.target.value)}
          >
            <option value="" disabled>
              Elegí uno de tus repositorios…
            </option>
            {repos.map((r) => (
              <option key={r.fullName} value={r.fullName}>
                {r.fullName}
                {r.language ? ` · ${r.language}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="ghost" icon="plus" onClick={() => setCreando((v) => !v)}>
          {creando ? "Cancelar" : "Repositorio nuevo"}
        </Button>
      </div>

      {repos.length === 0 && (
        <p className="post__meta">
          No encontramos repositorios públicos tuyos. Creá uno acá abajo para empezar.
        </p>
      )}

      {creando && (
        <form
          className="stack"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Field label="Nombre" hint="Letras, números, punto, guion y guion bajo.">
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="mi-proyecto"
                  required
                />
              </Field>
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <Field label="Descripción (opcional)">
                <Input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Para qué es"
                />
              </Field>
            </div>
          </div>
          <p className="post__meta">
            Se crea <strong>público</strong> y con un README inicial. Lo segundo importa: un
            repositorio sin ningún commit no tiene rama todavía, y entonces no se le puede subir
            nada.
          </p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button variant="accent" type="submit" loading={crear.isPending} disabled={!form.name.trim()}>
              Crear
            </Button>
          </div>
          {crear.isError && <p className="field__error">{(crear.error as Error).message}</p>}
        </form>
      )}
    </Surface>
  );
}

// ── Migas de pan ──────────────────────────────────────────────────────

function Migas({ path, onIr }: { path: string; onIr: (p: string) => void }) {
  const partes = path.split("/").filter(Boolean);
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn btn--ghost" onClick={() => onIr("")}>
        <Icon name="repo" size={15} /> raíz
      </button>
      {partes.map((parte, i) => (
        <span key={i} className="row" style={{ gap: 6, alignItems: "center" }}>
          <span className="post__dot" />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onIr(partes.slice(0, i + 1).join("/"))}
          >
            {parte}
          </button>
        </span>
      ))}
    </div>
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
    <div className="stack" style={{ gap: 10 }}>
      <Field
        label="Subir archivos"
        hint={`Hasta 20 por vez, 5 MB cada uno. Caen en ${directory ? `/${directory}` : "la raíz"}.`}
      >
        <input
          ref={input}
          className="input"
          type="file"
          multiple
          onChange={(e) => setElegidos(Array.from(e.target.files ?? []))}
        />
      </Field>

      {elegidos.length > 0 && (
        <>
          <div className="stack" style={{ gap: 4 }}>
            {elegidos.map((f) => (
              <div key={f.name} className="row spread">
                <span className="mono">{f.name}</span>
                <span className="post__meta" style={{ margin: 0 }}>{peso(f.size)}</span>
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button variant="accent" icon="upload" loading={subir.isPending} onClick={() => subir.mutate()}>
              Subir {elegidos.length} archivo{elegidos.length > 1 ? "s" : ""}
            </Button>
          </div>
        </>
      )}

      {subir.isError && <p className="field__error">{(subir.error as Error).message}</p>}

      {resultado && (
        <div className="stack" style={{ gap: 4 }}>
          {resultado.subidos.map((s) => (
            <p key={s.path} className="post__meta" style={{ margin: 0 }}>
              <Icon name="check" size={14} /> <span className="mono">{s.path}</span> ·{" "}
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
    <div className="stack" style={{ gap: 10 }}>
      <Field label="Ruta del archivo" hint="Las carpetas se crean solas: src/lib/util.ts">
        <Input value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder="src/util.ts" required />
      </Field>
      <Field label="Contenido">
        <Textarea
          className="input input--area mono"
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          style={{ minHeight: 260 }}
          placeholder="Pegá o escribí tu código acá…"
        />
      </Field>
      <Field label="Mensaje del commit (opcional)">
        <Input
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder={sha ? `Actualiza ${ruta}` : `Agrega ${ruta}`}
        />
      </Field>
      <div className="row spread">
        {onCancelar ? (
          <Button variant="ghost" type="button" onClick={onCancelar}>
            Cancelar
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
          Guardar en GitHub
        </Button>
      </div>
      {sinCambios && <p className="post__meta">No hay cambios para guardar.</p>}
      {guardar.isError && <p className="field__error">{(guardar.error as Error).message}</p>}
      {guardar.data && (
        <p className="post__meta">
          <Icon name="check" size={14} /> {guardar.data.creado ? "Creado" : "Actualizado"} en el commit{" "}
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
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["repos", owner, repo, "commits", path ?? ""],
    queryFn: () => api.repoCommits(owner, repo, path),
  });

  if (isLoading) return <Skeleton h={80} r={12} />;
  if (isError) return <p className="field__error">{(error as Error).message}</p>;

  const commits = data?.commits ?? [];
  if (commits.length === 0) return <p className="post__meta">Todavía no hay commits.</p>;

  return (
    <div className="stack" style={{ gap: 8, marginTop: 12 }}>
      {commits.map((c, i) => (
        <div key={c.sha} className="row spread" style={{ gap: 10, flexWrap: "wrap" }}>
          <span className="row" style={{ gap: 8, alignItems: "center" }}>
            <a className="mono" href={c.htmlUrl} target="_blank" rel="noreferrer noopener">
              {c.sha.slice(0, 7)}
            </a>
            {i === 0 && <Badge tone="accent">último</Badge>}
            <span>{c.message.split("\n")[0]}</span>
          </span>
          <span className="post__meta" style={{ margin: 0 }}>
            {c.authorLogin ? `@${c.authorLogin} · ` : c.authorName ? `${c.authorName} · ` : ""}
            {fecha(c.committedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Explorador ────────────────────────────────────────────────────────

function Explorador({ owner, repo }: { owner: string; repo: string }) {
  const qc = useQueryClient();
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
    mutationFn: (entrada: { path: string; sha: string }) =>
      api.deleteRepoFile(owner, repo, entrada),
    onSuccess: () => {
      setPath(path.split("/").slice(0, -1).join("/"));
      refrescar();
    },
  });

  const carpetaActual = data?.kind === "file" ? path.split("/").slice(0, -1).join("/") : path;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Surface className="post">
        <div className="row spread" style={{ gap: 10, flexWrap: "wrap" }}>
          <Migas path={path} onIr={(p) => { setPath(p); setCreando(false); }} />
          <div className="row" style={{ gap: 8 }}>
            <Button variant="ghost" icon="history" onClick={() => setVerHistorial((v) => !v)}>
              {verHistorial ? "Ocultar historial" : "Historial"}
            </Button>
            <Button variant="ghost" icon="plus" onClick={() => setCreando((v) => !v)}>
              {creando ? "Cancelar" : "Archivo nuevo"}
            </Button>
          </div>
        </div>
        {verHistorial && (
          <Historial owner={owner} repo={repo} path={data?.kind === "file" ? path : undefined} />
        )}
      </Surface>

      {creando && (
        <Surface className="post">
          <h3>Archivo nuevo</h3>
          <EditorDeArchivo
            owner={owner}
            repo={repo}
            path={carpetaActual ? `${carpetaActual}/` : ""}
            contenidoInicial=""
            onGuardado={() => { setCreando(false); refrescar(); }}
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
              title="Acá no hay nada"
              body="El repositorio está vacío o la carpeta no existe. Creá un archivo para empezar."
            />
          ) : (
            <p className="field__error">{(error as Error).message}</p>
          )}
        </Surface>
      )}

      {data?.kind === "dir" && (
        <Surface className="post">
          {data.entries.length === 0 ? (
            <EmptyState icon="folder" title="Carpeta vacía" body="No hay archivos en esta ruta." />
          ) : (
            <div className="stack" style={{ gap: 2 }}>
              {data.entries.map((e: RepoEntry) => (
                <button
                  key={e.path}
                  type="button"
                  className="btn btn--ghost btn--block"
                  style={{ justifyContent: "space-between" }}
                  onClick={() => setPath(e.path)}
                  disabled={e.type !== "dir" && e.type !== "file"}
                >
                  <span className="row" style={{ gap: 8, alignItems: "center" }}>
                    <Icon name={e.type === "dir" ? "folder" : "file"} size={15} />
                    <span className={e.type === "dir" ? "" : "mono"}>{e.name}</span>
                  </span>
                  <span className="post__meta" style={{ margin: 0 }}>
                    {e.type === "file" ? peso(e.size) : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Surface>
      )}

      {data?.kind === "file" && (
        <Surface className="post">
          <div className="row spread" style={{ flexWrap: "wrap", gap: 8 }}>
            <h3 className="mono">{data.file.name}</h3>
            <div className="row" style={{ gap: 8 }}>
              <Badge>{peso(data.file.size)}</Badge>
              {data.file.htmlUrl && (
                <a className="btn btn--ghost" href={data.file.htmlUrl} target="_blank" rel="noreferrer noopener">
                  <Icon name="external" size={15} /> Ver en GitHub
                </a>
              )}
              <Button
                variant="ghost"
                icon="trash"
                loading={borrar.isPending}
                onClick={() => {
                  if (confirm(`¿Borrar ${data.file.path}? Queda en el historial de GitHub.`)) {
                    borrar.mutate({ path: data.file.path, sha: data.file.sha });
                  }
                }}
              >
                Borrar
              </Button>
            </div>
          </div>

          {borrar.isError && <p className="field__error">{(borrar.error as Error).message}</p>}

          {data.file.tooLarge ? (
            <EmptyState
              icon="file"
              title="Demasiado grande para mostrarlo"
              body="GitHub no entrega por esta vía los archivos de más de 1 MB."
            />
          ) : data.file.binary ? (
            <EmptyState
              icon="file"
              title="Archivo binario"
              body="No es texto, así que no se puede editar acá. Descargalo desde GitHub."
            />
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

  if (estado.isLoading) {
    return (
      <Shell title="Repositorios">
        <Skeleton h={200} r={14} />
      </Shell>
    );
  }

  if (!estado.data?.enabled) {
    return (
      <Shell title="Repositorios">
        <Surface className="post">
          <EmptyState
            icon="repo"
            title="La integración con GitHub no está configurada"
            body="Este servidor no tiene las credenciales de GitHub cargadas."
          />
        </Surface>
      </Shell>
    );
  }

  if (!estado.data.connection) {
    return (
      <Shell title="Repositorios">
        <PedirConexion motivo="sin-conexion" />
      </Shell>
    );
  }

  // La conexión existe pero es anterior al permiso de repositorios.
  if (lista.isError && (lista.error as ApiError).code === "github_scope_missing") {
    return (
      <Shell title="Repositorios">
        <PedirConexion motivo="sin-permiso" />
      </Shell>
    );
  }

  const elegido = lista.data?.defaultRepo ?? null;
  const partes = elegido?.split("/") ?? [];
  const owner = partes[0];
  const repo = partes[1];

  return (
    <Shell title="Repositorios">
      <div className="stack" style={{ gap: 14 }}>
        {lista.isLoading ? (
          <Skeleton h={90} r={14} />
        ) : lista.isError ? (
          <Surface className="post">
            <p className="field__error">{(lista.error as Error).message}</p>
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
              <EmptyState
                icon="repo"
                title="Elegí un repositorio"
                body="Arriba están los tuyos. También podés crear uno nuevo."
              />
            </Surface>
          )
        )}
      </div>
    </Shell>
  );
}
