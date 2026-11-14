import { useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Skeleton, EmptyState, Stars, Badge, Segmented, Field } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, ApiError, type BookFile } from "../lib/api";
import { peso } from "../lib/formato";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import type { TranslationKey } from "../i18n";

const SHELF: { key: string; label: TranslationKey }[] = [
  { key: "want", label: "book.shelfWant" },
  { key: "reading", label: "book.shelfReading" },
  { key: "read", label: "book.shelfRead" },
];

/**
 * El mismo tope que BOOK_FILE_MAX_MB en el API. Acá sólo sirve para avisar
 * antes de empezar a subir; quien decide sigue siendo el servidor.
 */
const MAX_MB = 25;

/**
 * Los archivos que alojamos nosotros: listarlos, subir uno, borrar el propio.
 *
 * Va aparte de los enlaces externos y no en su lugar: un libro de Gutenberg
 * tiene enlace a la fuente Y puede tener un EPUB nuestro. Antes esto era un
 * if/else y el archivo subido quedaba invisible en todo libro importado.
 */
function ArchivosDelLibro({
  bookId,
  files,
  onDownload,
}: {
  bookId: string;
  files: BookFile[];
  onDownload: (fileId: string) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [acceso, setAcceso] = useState<"public" | "community">("community");
  const [error, setError] = useState<string | null>(null);

  const subir = useMutation({
    mutationFn: (file: File) => api.uploadBookFile(bookId, file, acceso),
    onSuccess: () => {
      setError(null);
      if (input.current) input.current.value = "";
      qc.invalidateQueries({ queryKey: ["book", bookId] });
    },
    onError: (e) => {
      // 413 lo corta Fastify antes de llegar a nuestro código, y su mensaje
      // es una constante interna en inglés. El resto de los errores de esta
      // ruta ya vienen explicados desde el servidor.
      if (e instanceof ApiError && e.status === 413) {
        setError(t("book.uploadTooBig", { size: "", mb: MAX_MB }));
      } else if (e instanceof ApiError && e.status === 401) {
        navigate("/auth");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
  });

  const borrar = useMutation({
    mutationFn: (fileId: string) => api.deleteBookFile(fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["book", bookId] }),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  function elegir(file: File | undefined) {
    if (!file) return;
    // El tamaño se mira acá para no gastar la subida entera en algo que el
    // servidor va a rechazar igual. El límite de verdad sigue siendo el suyo.
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(t("book.uploadTooBig", { size: peso(file.size), mb: MAX_MB }));
      if (input.current) input.current.value = "";
      return;
    }
    setError(null);
    subir.mutate(file);
  }

  return (
    <div className="stack stack--sm">
      {files.length > 0 ? (
        <div className="stack stack--xs">
          {files.map((f) => (
            <div className="row row--sm spread" key={f.id}>
              <Button variant="soft" icon="download" onClick={() => onDownload(f.id)}>
                {f.format.toUpperCase()}
              </Button>
              <span className="file-row__meta">{peso(f.byteSize)}</span>
              {f.accessLevel === "public" && <Badge>{t("book.accessPublic")}</Badge>}
              {user?.id === f.ownerId && (
                <Button
                  variant="ghost"
                  icon="trash"
                  loading={borrar.isPending}
                  onClick={() => {
                    if (confirm(t("book.deleteFileConfirm", { format: f.format.toUpperCase() })))
                      borrar.mutate(f.id);
                  }}
                >
                  {t("book.deleteFile")}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="book__author">{t("book.noFiles")}</p>
      )}

      {user ? (
        <>
          <Field label={t("book.upload")} hint={t("book.uploadHint", { mb: MAX_MB })} error={error ?? undefined}>
            <input
              ref={input}
              className="input input--file"
              type="file"
              accept=".epub,.pdf,.mobi,application/epub+zip,application/pdf"
              disabled={subir.isPending}
              onChange={(e) => elegir(e.target.files?.[0])}
            />
          </Field>
          <div className="row row--sm">
            <Segmented
              label={t("book.access")}
              value={acceso}
              disabled={subir.isPending}
              onChange={(v) => setAcceso(v)}
              options={[
                { value: "community", label: t("book.accessCommunity") },
                { value: "public", label: t("book.accessPublic") },
              ]}
            />
            {subir.isPending && <span className="file-row__meta">{t("book.uploading")}</span>}
          </div>
        </>
      ) : (
        <Button variant="soft" onClick={() => navigate("/auth")}>
          {t("book.signInToUpload")}
        </Button>
      )}
    </div>
  );
}

function Recommendations({ query }: { query: string }) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["reco", query],
    queryFn: () => api.recommend({ q: query, limit: 5 }),
  });

  if (isLoading) return <Skeleton h={54} r={14} />;
  if (!data || data.hits.length === 0) {
    return <p className="book__author">{t("book.noSuggestions")}</p>;
  }

  return (
    <div className="stack stack--sm">
      {data.hits.map((h, i) => (
        <div className="reco" key={h.entityId}>
          <span className="reco__rank" aria-hidden>
            {i + 1}
          </span>
          <span className="reco__t">{h.title ?? t("common.empty")}</span>
          <span className="reco__d">
            {t("discover.affinity", { n: Math.max(0, Math.round((1 - h.distance) * 100)) })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BookDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [shelf, setShelf] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({ queryKey: ["book", id], queryFn: () => api.book(id) });
  const book = data?.book;

  const shelfMut = useMutation({
    mutationFn: (status: string) => api.setShelf(id, { status }),
    onSuccess: (_r, status) => setShelf(status),
  });

  async function download(fileId: string) {
    try {
      const r = await api.bookFileDownload(fileId);
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) navigate("/auth");
    }
  }

  return (
    <Shell
      title={book?.title ?? t("library.title")}
      subtitle={
        book ? (book.authors.length ? book.authors.join(", ") : t("common.unknownAuthor")) : undefined
      }
      actions={
        <Link to="/biblioteca">
          <Button variant="ghost" icon="back">
            {t("common.back")}
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <div className="detail">
          <Skeleton h={320} r={20} />
          <div className="stack">
            <Skeleton h={30} w="60%" />
            <Skeleton h={16} w="40%" />
            <Skeleton h={80} />
          </div>
        </div>
      ) : isError || !book ? (
        <Surface>
          <EmptyState
            icon="library"
            title={t("book.notFoundTitle")}
            body={t("book.notFoundBody")}
            action={
              <Link to="/biblioteca">
                <Button variant="accent">{t("book.viewLibrary")}</Button>
              </Link>
            }
          />
        </Surface>
      ) : (
        <div className="detail">
          <div className={`detail__cover ${book.coverUrl ? "" : "detail__cover--ph"}`}>
            {book.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={t("library.coverAlt", { title: book.title })}
                referrerPolicy="no-referrer"
              />
            ) : (
              <Icon name="book" size={48} />
            )}
          </div>

          {/* El título y la autoría ya los lleva el encabezado de la página:
              repetirlos acá era decir dos veces lo mismo a dos tamaños. */}
          <div>
            <div className="row row--sm">
              <Stars value={book.ratingAvg} />
              {book.publicationYear && <Badge>{book.publicationYear}</Badge>}
              {book.languageCode && <Badge>{book.languageCode.toUpperCase()}</Badge>}
            </div>

            <section className="detail__block">
              <h3>{t("book.shelf")}</h3>
              {user ? (
                <Segmented
                  label={t("book.shelf")}
                  value={shelf}
                  disabled={shelfMut.isPending}
                  onChange={(key) => shelfMut.mutate(key)}
                  options={SHELF.map((s) => ({ value: s.key, label: t(s.label) }))}
                />
              ) : (
                <Button variant="soft" onClick={() => navigate("/auth")}>
                  {t("book.signInToSave")}
                </Button>
              )}
            </section>

            <section className="detail__block">
              <h3>{t("book.formats")}</h3>

              {/* Dos orígenes distintos, y conviene que se note cuál es cuál.
                  `files` son archivos nuestros, que se bajan con una URL
                  firmada. `readUrl`/`downloadUrl` viven en la fuente externa:
                  guardamos el enlace, no el archivo. */}
              {(book.readUrl || book.downloadUrl) && (
                <div className="stack stack--sm">
                  <div className="ext-actions">
                    {book.readUrl && (
                      <a
                        className="btn btn--accent"
                        href={book.readUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Icon name="book" size={18} />
                        <span className="btn__label">{t("book.read")}</span>
                      </a>
                    )}
                    {book.downloadUrl && (
                      <a
                        className="btn btn--soft"
                        href={book.downloadUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Icon name="download" size={18} />
                        <span className="btn__label">{t("book.download")}</span>
                      </a>
                    )}
                    {book.sourceUrl && (
                      <a
                        className="btn btn--ghost"
                        href={book.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Icon name="external" size={18} />
                        <span className="btn__label">{t("book.source")}</span>
                      </a>
                    )}
                  </div>

                  {book.rightsNote && (
                    <p className="book__author measure">{t("book.rights", { note: book.rightsNote })}</p>
                  )}
                </div>
              )}

              {/* Lo nuestro va SIEMPRE, aunque el libro tenga enlaces afuera:
                  un libro importado de Gutenberg puede tener además un EPUB
                  subido acá, y antes ese archivo quedaba invisible. */}
              {(book.readUrl || book.downloadUrl) && <h4 className="detail__sub">{t("book.ourFiles")}</h4>}
              <ArchivosDelLibro
                bookId={book.id}
                files={book.files ?? []}
                onDownload={download}
              />
            </section>

            <section className="detail__block">
              <h3>{t("book.similar")}</h3>
              <Recommendations query={`${book.title} ${book.authors.join(" ")}`} />
            </section>
          </div>
        </div>
      )}
    </Shell>
  );
}
