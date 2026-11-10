import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Segmented, Select, Skeleton, EmptyState, Badge } from "../components/ui";
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

/**
 * Agregar un ítem a la colección.
 *
 * Antes esto era AddBook y tenía `itemType: "book"` escrito a mano, aunque la
 * API acepta cuatro tipos desde el primer día. Esa era la razón de que una
 * "ruta que une los libros que lees con el código que practicas" sólo
 * admitiera libros.
 *
 * Quedan fuera los repositorios: `collection_items.repository_id` apunta a
 * `app.github_repositories`, una tabla que hoy nadie llena. Ofrecerlos daría
 * siempre "El repositorio no existe".
 */
type Tipo = "book" | "snippet" | "post";

function AddItem({ collectionId }: { collectionId: string }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [tipo, setTipo] = useState<Tipo>("book");
  const [itemId, setItemId] = useState("");
  const [note, setNote] = useState("");

  // Las tres fuentes se piden sólo cuando su pestaña está elegida.
  const libros = useQuery({ queryKey: ["books"], queryFn: () => api.books(), enabled: tipo === "book" });
  const snippets = useQuery({ queryKey: ["snippets"], queryFn: () => api.snippets(), enabled: tipo === "snippet" });
  const posts = useQuery({ queryKey: ["feed"], queryFn: () => api.feed(50), enabled: tipo === "post" });

  const opciones: { id: string; label: string }[] =
    tipo === "book"
      ? (libros.data?.items ?? []).map((b) => ({ id: b.id, label: b.title }))
      : tipo === "snippet"
        ? (snippets.data?.items ?? []).map((sn) => ({
            id: sn.id,
            label: `${sn.title} · ${sn.language}`,
          }))
        : (posts.data?.items ?? []).map((po) => ({
            id: po.id,
            label: po.title || t("collections.untitledPost"),
          }));

  const cargando = libros.isLoading || snippets.isLoading || posts.isLoading;

  const mut = useMutation({
    mutationFn: () =>
      api.addItem(collectionId, {
        itemType: tipo,
        ...(tipo === "book" ? { bookId: itemId } : tipo === "snippet" ? { snippetId: itemId } : { postId: itemId }),
        note,
      }),
    onSuccess: () => {
      setItemId("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["collection", collectionId] });
    },
  });

  const placeholder =
    tipo === "book" ? "collections.chooseBook" : tipo === "snippet" ? "collections.chooseSnippet" : "collections.choosePost";
  const vacio =
    tipo === "book" ? "collections.noBooks" : tipo === "snippet" ? "collections.noSnippets" : "collections.noPosts";

  return (
    <Surface
      className="coll"
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        if (itemId) mut.mutate();
      }}
    >
      <Field label={t("collections.whatKind")}>
        <Segmented
          label={t("collections.whatKind")}
          value={tipo}
          onChange={(v) => {
            setTipo(v);
            // El id elegido pertenece a la lista anterior: no sirve acá.
            setItemId("");
          }}
          options={[
            { value: "book", label: t("itemType.book") },
            { value: "snippet", label: t("itemType.snippet") },
            { value: "post", label: t("itemType.post") },
          ]}
        />
      </Field>

      <Field label={t("collections.addItem")}>
        <Select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          disabled={cargando || opciones.length === 0}
          required
        >
          <option value="">{t(placeholder)}</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      {!cargando && opciones.length === 0 && <p className="post__meta">{t(vacio)}</p>}

      <Field label={t("collections.note")}>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("collections.notePlaceholder")}
        />
      </Field>

      <Button variant="accent" type="submit" loading={mut.isPending} disabled={!itemId}>
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

          {isOwner && <AddItem collectionId={id} />}
        </div>
      )}
    </Shell>
  );
}
