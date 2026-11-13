/**
 * COMUNIDAD
 * ──────────────────────────────────────────────────────────────────────
 * Secciones donde se conversa. A la izquierda la lista; en el centro los
 * mensajes de la sección abierta; debajo, el hilo de respuestas del mensaje
 * que elijas.
 *
 * Los mensajes se refrescan solos cada 4 segundos. No es un chat con
 * conexión permanente: se pide lo nuevo cada tanto, que para una comunidad
 * de este tamaño se ve igual y no obliga a montar infraestructura aparte.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import {
  Surface,
  Button,
  Field,
  Input,
  Select,
  Segmented,
  Textarea,
  Skeleton,
  EmptyState,
} from "../components/ui";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import {
  api,
  type Attachment,
  type Channel,
  type ChannelMessage,
  type Comment,
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";

/** Cada cuánto se piden los mensajes nuevos. */
const REFRESCO_MS = 4000;

function iniciales(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

// ── Crear una sección ─────────────────────────────────────────────────

function NuevaSeccion({ onListo }: { onListo: (c: Channel) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({ name: "", topic: "" });

  const crear = useMutation({
    mutationFn: () =>
      api.createChannel({
        name: form.name,
        ...(form.topic ? { topic: form.topic } : {}),
      }),
    onSuccess: ({ channel }) => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      setForm({ name: "", topic: "" });
      setAbierto(false);
      onListo(channel);
    },
  });

  if (!abierto) {
    return (
      <Button variant="soft" icon="plus" block onClick={() => setAbierto(true)}>
        {t("community.newSection")}
      </Button>
    );
  }

  return (
    <Surface
      as="form"
      className="post"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        crear.mutate();
      }}
    >
      <Field label={t("community.sectionName")} hint={t("community.sectionNameHint")}>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          maxLength={120}
          autoFocus
        />
      </Field>
      <Field label={t("community.sectionTopic")} hint={t("community.sectionTopicHint")}>
        <Input
          value={form.topic}
          onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
          maxLength={300}
        />
      </Field>
      {crear.isError && (
        <p className="field__error" role="alert">
          {(crear.error as Error).message}
        </p>
      )}
      <div className="row row--end">
        <Button variant="ghost" type="button" onClick={() => setAbierto(false)}>
          {t("community.cancel")}
        </Button>
        <Button variant="accent" type="submit" loading={crear.isPending}>
          {t("community.create")}
        </Button>
      </div>
    </Surface>
  );
}

// ── Adjuntos ──────────────────────────────────────────────────────────

const ICONO_ADJUNTO: Record<Attachment["attachmentType"], IconName> = {
  book: "book",
  repository: "repo",
  snippet: "snippet",
};

/** Lo que cuelga de un mensaje, con su botón para llevárselo. */
function Adjuntos({
  mensaje,
  puedeQuitar,
  onCambio,
}: {
  mensaje: ChannelMessage;
  puedeQuitar: boolean;
  onCambio: () => void;
}) {
  const { t } = useI18n();

  const quitar = useMutation({
    mutationFn: (id: string) => api.removeAttachment(id),
    onSuccess: onCambio,
  });

  if (mensaje.attachments.length === 0) return null;

  return (
    <ul className="adj__lista">
      {mensaje.attachments.map((a) => (
        <li key={a.id} className="adj">
          <Icon name={ICONO_ADJUNTO[a.attachmentType]} size={16} />
          <div className="adj__texto">
            <span className="adj__titulo">{a.title}</span>
            {a.note && <span className="adj__nota">{a.note}</span>}
          </div>
          <div className="adj__acciones">
            {a.attachmentType === "snippet" && (
              // Navegación real del navegador: la descarga no es un fetch.
              <a className="adj__accion" href={api.snippetRawUrl(a.targetId)}>
                <Icon name="download" size={14} />
                {t("attach.download")}
              </a>
            )}
            {a.attachmentType === "book" && (a.downloadUrl || a.readUrl) && (
              <a
                className="adj__accion"
                href={(a.downloadUrl ?? a.readUrl) as string}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Icon name={a.downloadUrl ? "download" : "external"} size={14} />
                {a.downloadUrl ? t("attach.download") : t("attach.read")}
              </a>
            )}
            {a.attachmentType === "repository" && a.canonicalUrl && (
              <a
                className="adj__accion"
                href={a.canonicalUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Icon name="external" size={14} />
                {t("attach.open")}
              </a>
            )}
            {puedeQuitar && (
              <button
                type="button"
                className="adj__accion adj__accion--riesgo"
                onClick={() => quitar.mutate(a.id)}
                disabled={quitar.isPending}
              >
                {t("attach.remove")}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

type TipoAdjunto = "book" | "snippet" | "repository";

/**
 * Elegir qué colgar del mensaje.
 *
 * Calcado del AddItem de CollectionDetail: un Segmented para el tipo y una
 * consulta por tipo, con `enabled` para no pedir lo que no se está mirando.
 *
 * El libro por enlace no está acá a propósito: darlo de alta pide título y
 * nota de derechos, y ese formulario ya existe en Biblioteca. Así el libro
 * entra al catálogo y queda disponible para todos, en vez de ser una URL
 * suelta dentro de un mensaje.
 */
function AdjuntarItem({ mensaje, onListo }: { mensaje: ChannelMessage; onListo: () => void }) {
  const { t } = useI18n();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoAdjunto>("book");
  const [itemId, setItemId] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [note, setNote] = useState("");

  const libros = useQuery({
    queryKey: ["books"],
    queryFn: () => api.books(),
    enabled: abierto && tipo === "book",
  });
  const fragmentos = useQuery({
    queryKey: ["snippets"],
    queryFn: () => api.snippets(),
    enabled: abierto && tipo === "snippet",
  });

  const adjuntar = useMutation({
    mutationFn: () =>
      tipo === "repository"
        ? api.attachToMessage(mensaje.id, {
            attachmentType: "repository",
            repoUrl,
            ...(note ? { note } : {}),
          })
        : api.attachToMessage(mensaje.id, {
            attachmentType: tipo,
            targetId: itemId,
            ...(note ? { note } : {}),
          }),
    onSuccess: () => {
      setItemId("");
      setRepoUrl("");
      setNote("");
      setAbierto(false);
      onListo();
    },
  });

  if (!abierto) {
    return (
      <button type="button" className="msg__accion" onClick={() => setAbierto(true)}>
        <Icon name="plus" size={14} />
        {t("attach.add")}
      </button>
    );
  }

  const opciones =
    tipo === "book"
      ? (libros.data?.items ?? []).map((b) => ({ id: b.id, label: b.title }))
      : (fragmentos.data?.items ?? []).map((s) => ({ id: s.id, label: `${s.title} · ${s.language}` }));

  const vacio = tipo !== "repository" && !opciones.length &&
    !(tipo === "book" ? libros.isLoading : fragmentos.isLoading);

  return (
    <Surface
      as="form"
      className="adj__form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        adjuntar.mutate();
      }}
    >
      <Segmented
        label={t("attach.what")}
        value={tipo}
        options={[
          { value: "book", label: t("attach.book") },
          { value: "snippet", label: t("attach.snippet") },
          { value: "repository", label: t("attach.repo") },
        ]}
        onChange={(next) => {
          setTipo(next as TipoAdjunto);
          // El id elegido pertenecía a la lista anterior.
          setItemId("");
        }}
      />

      {tipo === "repository" ? (
        <Field label={t("attach.repoUrl")} hint={t("attach.repoUrlHint")}>
          <Input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="usuario/repositorio"
            required
          />
        </Field>
      ) : vacio ? (
        <p className="hilo__vacio">
          {tipo === "book" ? t("attach.noBooks") : t("attach.noSnippets")}
          {tipo === "book" && (
            <>
              {" "}
              <Link to="/biblioteca">{t("attach.goToLibrary")}</Link>
            </>
          )}
        </p>
      ) : (
        <Field label={tipo === "book" ? t("attach.book") : t("attach.snippet")}>
          <Select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
            <option value="">{t("attach.choose")}</option>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label={t("attach.note")} hint={t("attach.noteHint")}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>

      {adjuntar.isError && (
        <p className="field__error" role="alert">
          {(adjuntar.error as Error).message}
        </p>
      )}

      <div className="row row--end">
        <Button variant="ghost" type="button" onClick={() => setAbierto(false)}>
          {t("attach.cancel")}
        </Button>
        <Button
          variant="accent"
          type="submit"
          loading={adjuntar.isPending}
          disabled={tipo === "repository" ? !repoUrl.trim() : !itemId}
        >
          {t("attach.save")}
        </Button>
      </div>
    </Surface>
  );
}

// ── El hilo de respuestas de un mensaje ───────────────────────────────

function Respuesta({
  comentario,
  onResponder,
  nivel = 0,
}: {
  comentario: Comment;
  onResponder: (c: Comment) => void;
  nivel?: number;
}) {
  const { t, timeAgo } = useI18n();
  return (
    <li className="hilo__item" style={{ marginInlineStart: nivel * 16 }}>
      <div className="hilo__cab">
        <span className="hilo__autor">{comentario.authorDisplayName}</span>
        <span className="hilo__tiempo">{timeAgo(comentario.createdAt)}</span>
      </div>
      <p className="hilo__cuerpo">{comentario.bodyMarkdown}</p>
      <button type="button" className="hilo__accion" onClick={() => onResponder(comentario)}>
        {t("community.reply")}
      </button>
      {comentario.replies.length > 0 && (
        <ul className="hilo__lista">
          {comentario.replies.map((r) => (
            <Respuesta key={r.id} comentario={r} onResponder={onResponder} nivel={nivel + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Hilo({ mensaje, onCerrar }: { mensaje: ChannelMessage; onCerrar: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [respondiendoA, setRespondiendoA] = useState<Comment | null>(null);

  const hilo = useQuery({
    queryKey: ["comments", mensaje.id],
    queryFn: () => api.comments(mensaje.id),
  });

  const comentar = useMutation({
    mutationFn: () =>
      api.createComment(mensaje.id, {
        bodyMarkdown: texto,
        ...(respondiendoA ? { parentCommentId: respondiendoA.id } : {}),
      }),
    onSuccess: () => {
      setTexto("");
      setRespondiendoA(null);
      qc.invalidateQueries({ queryKey: ["comments", mensaje.id] });
      // El contador de respuestas vive en el listado de mensajes.
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });

  return (
    <Surface className="hilo">
      <div className="row spread">
        <strong>{t("community.thread")}</strong>
        <Button variant="ghost" type="button" onClick={onCerrar}>
          {t("community.closeThread")}
        </Button>
      </div>

      <p className="hilo__origen">{mensaje.bodyMarkdown}</p>

      {hilo.isLoading ? (
        <Skeleton h={80} r={12} />
      ) : hilo.data && hilo.data.items.length > 0 ? (
        <ul className="hilo__lista">
          {hilo.data.items.map((c) => (
            <Respuesta key={c.id} comentario={c} onResponder={setRespondiendoA} />
          ))}
        </ul>
      ) : (
        <p className="hilo__vacio">{t("community.threadEmpty")}</p>
      )}

      {user ? (
        <form
          className="hilo__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim()) comentar.mutate();
          }}
        >
          {respondiendoA && (
            <p className="hilo__respondiendo">
              {t("community.replyTo", { user: respondiendoA.authorUsername })}
              <button type="button" className="hilo__accion" onClick={() => setRespondiendoA(null)}>
                {t("community.cancel")}
              </button>
            </p>
          )}
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t("community.replyPlaceholder")}
            rows={3}
            maxLength={10000}
          />
          {comentar.isError && (
            <p className="field__error" role="alert">
              {(comentar.error as Error).message}
            </p>
          )}
          <div className="row row--end">
            <Button variant="accent" type="submit" loading={comentar.isPending}>
              {t("community.reply")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="hilo__vacio">{t("community.signInToWrite")}</p>
      )}
    </Surface>
  );
}

// ── Los mensajes de una sección ───────────────────────────────────────

function Mensajes({ canal }: { canal: Channel }) {
  const { t, tn, timeAgo } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState<ChannelMessage | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  const mensajes = useQuery({
    queryKey: ["messages", canal.id],
    queryFn: () => api.channelMessages(canal.id, { limit: 50 }),
    // Esto es lo que hace que los mensajes "aparezcan solos".
    refetchInterval: REFRESCO_MS,
  });

  const enviar = useMutation({
    mutationFn: () => api.sendMessage(canal.id, { bodyMarkdown: texto }),
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["messages", canal.id] });
    },
  });

  const items = mensajes.data?.items ?? [];
  const ultimoId = items.length ? items[items.length - 1]!.id : undefined;

  // Bajar del todo cuando entra un mensaje nuevo, como cualquier conversación.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [ultimoId]);

  function enviarSiHayTexto() {
    if (texto.trim() && !enviar.isPending) enviar.mutate();
  }

  return (
    <div className="comunidad__centro">
      <Surface className="comunidad__cab">
        <div className="row row--sm">
          <Icon name="hash" size={18} />
          <div>
            <strong>{canal.name}</strong>
            {canal.topic && <div className="post__meta">{canal.topic}</div>}
          </div>
        </div>
      </Surface>

      <div className="comunidad__mensajes">
        {mensajes.isLoading ? (
          <Skeleton h={120} r={12} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="chat"
            title={t("community.emptyTitle")}
            body={t("community.emptyBody")}
          />
        ) : (
          <ul className="msg__lista">
            {items.map((m) => (
              <li key={m.id} className="msg">
                <div className="msg__avatar" aria-hidden>
                  {iniciales(m.authorDisplayName)}
                </div>
                <div className="msg__cuerpo">
                  <div className="msg__cab">
                    <span className="msg__autor">{m.authorDisplayName}</span>
                    <span className="msg__tiempo">{timeAgo(m.createdAt)}</span>
                  </div>
                  <p className="msg__texto">{m.bodyMarkdown}</p>

                  <Adjuntos
                    mensaje={m}
                    puedeQuitar={m.authorId === user?.id}
                    onCambio={() => qc.invalidateQueries({ queryKey: ["messages", canal.id] })}
                  />

                  <div className="msg__pie">
                    <button type="button" className="msg__accion" onClick={() => setAbierto(m)}>
                      <Icon name="chat" size={14} />
                      {m.commentCount > 0
                        ? tn(m.commentCount, "community.repliesOne", "community.repliesMany")
                        : t("community.noReplies")}
                    </button>
                    {/* Sólo el autor le cuelga cosas a su propio mensaje. */}
                    {m.authorId === user?.id && (
                      <AdjuntarItem
                        mensaje={m}
                        onListo={() => qc.invalidateQueries({ queryKey: ["messages", canal.id] })}
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div ref={finRef} />
      </div>

      {canal.archivedAt ? (
        <Surface className="comunidad__aviso">{t("community.archived")}</Surface>
      ) : user ? (
        <Surface
          as="form"
          className="comunidad__compositor"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            enviarSiHayTexto();
          }}
        >
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t("community.messagePlaceholder")}
            rows={2}
            maxLength={10000}
            onKeyDown={(e) => {
              // Enter envía; Mayúsculas+Enter hace salto de línea, como en
              // cualquier chat.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviarSiHayTexto();
              }
            }}
          />
          {enviar.isError && (
            <p className="field__error" role="alert">
              {(enviar.error as Error).message}
            </p>
          )}
          <div className="row row--end">
            <Button variant="accent" type="submit" icon="arrow" loading={enviar.isPending}>
              {t("community.send")}
            </Button>
          </div>
        </Surface>
      ) : (
        <Surface className="comunidad__aviso">{t("community.signInToWrite")}</Surface>
      )}

      {abierto && <Hilo mensaje={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────

export function Comunidad() {
  const { t } = useI18n();
  const { can } = useAuth();
  const navigate = useNavigate();
  const { slug } = useParams();

  const canales = useQuery({ queryKey: ["channels"], queryFn: () => api.channels() });
  const lista = canales.data?.items ?? [];
  const activo = slug ? lista.find((c) => c.slug === slug) : undefined;

  return (
    <Shell title={t("community.title")} subtitle={t("community.subtitle")}>
      <div className="comunidad">
        <aside className="comunidad__secciones">
          <h2 className="comunidad__titulo">{t("community.sections")}</h2>

          {canales.isLoading ? (
            <Skeleton h={120} r={12} />
          ) : lista.length === 0 ? (
            <p className="hilo__vacio">{t("community.noSectionsBody")}</p>
          ) : (
            <ul className="comunidad__lista">
              {lista.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`comunidad__item${c.slug === slug ? " is-active" : ""}`}
                    onClick={() => navigate(`/comunidad/${c.slug}`)}
                  >
                    <Icon name="hash" size={15} />
                    <span>{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {can("channels.create") && (
            <NuevaSeccion onListo={(c) => navigate(`/comunidad/${c.slug}`)} />
          )}
        </aside>

        {activo ? (
          <Mensajes key={activo.id} canal={activo} />
        ) : (
          <Surface className="post">
            <EmptyState
              icon="hash"
              title={lista.length ? t("community.pickTitle") : t("community.noSectionsTitle")}
              body={lista.length ? t("community.pickBody") : t("community.noSectionsBody")}
            />
          </Surface>
        )}
      </div>
    </Shell>
  );
}
