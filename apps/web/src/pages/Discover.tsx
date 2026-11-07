import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Input, EmptyState, Spinner } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, type RecoHit } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function Discover() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<RecoHit[] | null>(null);

  const search = useMutation({
    mutationFn: () => api.recommend({ q, limit: 10 }),
    onSuccess: (r) => setHits(r.hits),
  });
  const reindex = useMutation({ mutationFn: () => api.reindex() });

  return (
    <Shell
      title="Descubrir"
      subtitle="Buscá por significado, no solo por palabras. La IA encuentra lo más afín."
      actions={user ? <Button variant="soft" icon="spark" loading={reindex.isPending} onClick={() => reindex.mutate()}>
        {reindex.isSuccess ? `Indexados: ${reindex.data?.indexed}` : "Reindexar"}
      </Button> : undefined}
    >
      <Surface className="post" as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (q.trim().length >= 2) search.mutate(); }}>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <div style={{ flex: 1 }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: arquitectura hexagonal y puertos" />
          </div>
          <Button variant="accent" icon="search" type="submit" loading={search.isPending} disabled={q.trim().length < 2}>Buscar</Button>
        </div>
      </Surface>

      <div style={{ marginTop: 22 }}>
        {search.isPending ? (
          <div className="row" style={{ justifyContent: "center", padding: 40 }}><Spinner /></div>
        ) : search.isError ? (
          <Surface><EmptyState icon="spark" title="No se pudo buscar" body="Las recomendaciones necesitan la función de embeddings configurada." /></Surface>
        ) : hits == null ? (
          <Surface><EmptyState icon="search" title="Escribí algo para empezar" body="Probá con un tema, una tecnología o una idea. Encuentra posts, libros y más por similitud semántica." /></Surface>
        ) : hits.length === 0 ? (
          <Surface><EmptyState icon="spark" title="Sin resultados afines" body="No hay nada indexado todavía. Si iniciaste sesión, tocá “Reindexar” para generar los vectores." /></Surface>
        ) : (
          <div className="stack">
            {hits.map((h, i) => (
              <div className="reco" key={h.entityId}>
                <span className="reco__rank">{i + 1}</span>
                <span className="reco__t">{h.title ?? "—"}</span>
                <span className="badge badge--accent"><Icon name="spark" size={13} />{Math.max(0, Math.round((1 - h.distance) * 100))}% afín</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
