import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Skeleton, EmptyState, Stars, Badge, Segmented } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import type { TranslationKey } from "../i18n";

const SHELF: { key: string; label: TranslationKey }[] = [
  { key: "want", label: "book.shelfWant" },
  { key: "reading", label: "book.shelfReading" },
  { key: "read", label: "book.shelfRead" },
];

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
              {book.files && book.files.length > 0 ? (
                <div className="row row--sm">
                  {book.files.map((f) => (
                    <Button key={f.id} variant="soft" icon="download" onClick={() => download(f.id)}>
                      {f.format.toUpperCase()}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="book__author">{t("book.noFiles")}</p>
              )}
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
