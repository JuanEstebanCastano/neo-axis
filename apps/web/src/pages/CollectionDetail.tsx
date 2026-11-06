import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Skeleton, EmptyState, Badge } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { api, type CollectionItem } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const ICON: Record<string, IconName> = { book: "book", repository: "repo", snippet: "snippet", post: "feed" };
const LABEL: Record<string, string> = { book: "Libro", repository: "Repositorio", snippet: "Snippet", post: "Publicación" };

function AddBook({ collectionId }: { collectionId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["books"], queryFn: () => api.books() });
  const [bookId, setBookId] = useState("");
  const [note, setNote] = useState("");
  const mut = useMutation({
    mutationFn: () => api.addItem(collectionId, { itemType: "book", bookId, note }),
    onSuccess: () => { setBookId(""); setNote(""); qc.invalidateQueries({ queryKey: ["collection", collectionId] }); },
  });

  return (
    <Surface className="coll" as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (bookId) mut.mutate(); }}>
      <Field label="Agregar un libro">
        <select className="input" value={bookId} onChange={(e) => setBookId(e.target.value)} required>
          <option value="">Elegí un libro…</option>
          {data?.items.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
      </Field>
      <Field label="Nota (opcional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por qué va en esta colección" />
      </Field>
      <Button variant="accent" type="submit" loading={mut.isPending} disabled={!bookId}>Agregar a la colección</Button>
      {mut.isError && <p className="field__error">No se pudo agregar (¿sos el dueño?).</p>}
    </Surface>
  );
}

export function CollectionDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({ queryKey: ["collection", id], queryFn: () => api.collection(id) });
  const col = data?.collection;
  const isOwner = user && col && user.id === col.ownerId;

  return (
    <Shell
      title={col?.title ?? "Colección"}
      subtitle={col?.description ?? undefined}
      actions={<Link to="/colecciones"><Button variant="ghost" icon="back">Volver</Button></Link>}
    >
      {isLoading ? (
        <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={66} r={14} />)}</div>
      ) : isError || !col ? (
        <Surface><EmptyState icon="collections" title="Colección no encontrada" body="Puede ser privada o haber sido borrada." action={<Link to="/colecciones"><Button variant="accent">Ver todas</Button></Link>} /></Surface>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: isOwner ? "1fr 340px" : "1fr", alignItems: "start", gap: 28 }}>
          <div className="stack">
            <div className="row"><Badge tone="accent">{col.items.length} ítems</Badge><Badge>{col.visibility === "community" ? "Pública" : "Restringida"}</Badge></div>
            {col.items.length === 0 ? (
              <Surface><EmptyState icon="collections" title="Colección vacía" body="Agregá libros, repos o snippets para armar la ruta." /></Surface>
            ) : (
              col.items.map((it: CollectionItem) => (
                <div className="item-row" key={it.id}>
                  <span className="item-row__ico"><Icon name={ICON[it.itemType] ?? "feed"} size={19} /></span>
                  <div style={{ flex: 1 }}>
                    <div className="item-row__t">{it.title ?? "—"}</div>
                    {it.note && <div className="book__author">{it.note}</div>}
                  </div>
                  <span className="item-row__ty">{LABEL[it.itemType]}</span>
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
