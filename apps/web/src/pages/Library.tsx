import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Skeleton, EmptyState, Stars } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, type Book } from "../lib/api";
import { useI18n } from "../context/I18nContext";

function Cover({ book }: { book: Book }) {
  const { t } = useI18n();
  if (book.coverUrl) {
    return (
      <div className="book__cover">
        <img
          src={book.coverUrl}
          alt={t("library.coverAlt", { title: book.title })}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }
  return (
    <div className="book__cover book__cover--ph" aria-hidden>
      <Icon name="book" size={34} />
    </div>
  );
}

export function Library() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useQuery({ queryKey: ["books"], queryFn: () => api.books() });

  return (
    <Shell title={t("library.title")} subtitle={t("library.subtitle")}>
      {isLoading ? (
        <div className="grid grid--books">
          {Array.from({ length: 10 }).map((_, i) => (
            <div className="book" key={i}>
              <Skeleton h={220} r={14} />
              <Skeleton h={14} w="80%" />
              <Skeleton h={12} w="50%" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <Surface>
          <EmptyState icon="library" title={t("library.errorTitle")} body={t("common.checkApi")} />
        </Surface>
      ) : !data || data.items.length === 0 ? (
        <Surface>
          <EmptyState icon="library" title={t("library.emptyTitle")} body={t("library.emptyBody")} />
        </Surface>
      ) : (
        <div className="grid grid--books">
          {data.items.map((b: Book) => (
            <Link to={`/biblioteca/${b.id}`} key={b.id} className="book">
              <Cover book={b} />
              <div>
                <div className="book__title">{b.title}</div>
                <div className="book__author">
                  {b.authors.length ? b.authors.join(", ") : t("common.unknownAuthor")}
                </div>
              </div>
              <Stars value={b.ratingAvg} />
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
