import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Select, Skeleton, EmptyState, Badge } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { api, type CollectionItem } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import type { TranslationKey } from "../i18n";

const ICON: Record<string, IconName> = {
  book: "book",
  repository: "repo",
  snippet: "snippet",
  post: "feed",
};

const LABEL: Record<string, TranslationKey> = {
  book: "itemType.book",
  repository: "itemType.repository",
  snippet: "itemType.snippet",
  post: "itemType.post",
};

function AddBook({ collectionId }: { collectionId: string }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ["books"], queryFn: () => api.books() });
  const [bookId, setBookId] = useState("");
  const [note, setNote] = useState("");
  const mut = useMutation({
    mutationFn: () => api.addItem(collectionId, { itemType: "book", bookId, note }),
    onSuccess: () => {
      setBookId("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["collection", collectionId] });
    },
  });

  return (
    <Surface
      className="coll"
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        if (bookId) mut.mutate();
      }}
    >
      <Field label={t("collections.addBook")}>
        <Select value={bookId} onChange={(e) => setBookId(e.target.value)} required>
          <option value="">{t("collections.chooseBook")}</option>
          {data?.items.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("collections.note")}>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("collections.notePlaceholder")}
        />
      </Field>
      <Button variant="accent" type="submit" loading={mut.isPending} disabled={!bookId}>
        {t("collections.addToCollection")}
      </Button>
      {mut.isError && (
        <p className="field__error" role="alert">
          {t("collections.addFailed")}
        </p>
      )}
    </Surface>
  );
}

export function CollectionDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { t, tn } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => api.collection(id),
  });
  const col = data?.collection;
  const isOwner = Boolean(user && col && user.id === col.ownerId);

  return (
    <Shell
      title={col?.title ?? t("collections.fallbackTitle")}
      subtitle={col?.description ?? undefined}
      actions={
        <Link to="/colecciones">
          <Button variant="ghost" icon="back">
            {t("common.back")}
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={66} r={14} />
          ))}
        </div>
      ) : isError || !col ? (
        <Surface>
          <EmptyState
            icon="collections"
            title={t("collections.notFoundTitle")}
            body={t("collections.notFoundBody")}
            action={
              <Link to="/colecciones">
                <Button variant="accent">{t("collections.viewAll")}</Button>
              </Link>
            }
          />
        </Surface>
      ) : (
        <div className={`coll-detail ${isOwner ? "coll-detail--owner" : ""}`}>
          <div className="stack">
            <div className="row row--sm">
              <Badge tone="accent">
                {tn(col.items.length, "collections.itemCountOne", "collections.itemCountMany")}
              </Badge>
              <Badge>
                {t(col.visibility === "community" ? "collections.public" : "collections.restricted")}
              </Badge>
            </div>

            {col.items.length === 0 ? (
              <Surface>
                <EmptyState
                  icon="collections"
                  title={t("collections.emptyColTitle")}
                  body={t("collections.emptyColBody")}
                />
              </Surface>
            ) : (
              col.items.map((it: CollectionItem) => (
                <div className="item-row" key={it.id}>
                  <span className="item-row__ico" aria-hidden>
                    <Icon name={ICON[it.itemType] ?? "feed"} size={19} />
                  </span>
                  <div className="grow">
                    <div className="item-row__t">{it.title ?? t("common.empty")}</div>
                    {it.note && <div className="item-row__note">{it.note}</div>}
                  </div>
                  <span className="item-row__ty">{t(LABEL[it.itemType] ?? "itemType.post")}</span>
                </div>
              ))
            )}
          </div>

          {isOwner && <AddBook collectionId={id} />}
        </div>
      )}
    </Shell>
  );
}
