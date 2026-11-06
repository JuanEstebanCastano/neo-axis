import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Skeleton, EmptyState, Stars, Badge } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const SHELF = [
  { key: "want", label: "Quiero leer" },
  { key: "reading", label: "Leyendo" },
  { key: "read", label: "Leído" },
] as const;

function Recommendations({ query }: { query: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["reco", query],
    queryFn: () => api.recommend({ q: query, limit: 5 }),
  });
  if (isLoading) return <Skeleton h={54} r={14} />;
  if (!data || data.hits.length === 0) {
    return <p className="book__author">Sin sugerencias por ahora. Reindexá embeddings en “Descubrir”.</p>;
  }
  return (
    <div className="stack">
      {data.hits.map((h, i) => (
        <div className="reco" key={h.entityId}>
          <span className="reco__rank">{i + 1}</span>
          <span className="reco__t">{h.title ?? "—"}</span>
          <span className="reco__d">{Math.max(0, Math.round((1 - h.distance) * 100))}% afín</span>
        </div>
      ))}
    </div>
  );
}

export function BookDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
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
    <Shell title="Biblioteca" actions={<Link to="/biblioteca"><Button variant="ghost" icon="back">Volver</Button></Link>}>
      {isLoading ? (
        <div className="detail"><Skeleton h={320} r={20} /><div className="stack"><Skeleton h={30} w="60%" /><Skeleton h={16} w="40%" /><Skeleton h={80} /></div></div>
      ) : isError || !book ? (
        <Surface><EmptyState icon="library" title="Libro no encontrado" body="Puede haber sido removido del catálogo." action={<Link to="/biblioteca"><Button variant="accent">Ver biblioteca</Button></Link>} /></Surface>
      ) : (
        <div className="detail">
          <div className="detail__cover">
            {book.coverUrl ? <img src={book.coverUrl} alt={`Portada de ${book.title}`} referrerPolicy="no-referrer" /> : <Icon name="book" size={48} />}
          </div>

          <div>
            <h1>{book.title}</h1>
            <p className="detail__by">{book.authors.length ? book.authors.join(", ") : "Autor desconocido"}</p>
            <div className="row">
              <Stars value={book.ratingAvg} />
              {book.publicationYear && <Badge>{book.publicationYear}</Badge>}
              {book.languageCode && <Badge>{book.languageCode.toUpperCase()}</Badge>}
            </div>

            <div className="detail__block">
              <h4>Mi estantería</h4>
              {user ? (
                <div className="seg">
                  {SHELF.map((s) => (
                    <button key={s.key} className={`seg__opt ${shelf === s.key ? "is-active" : ""}`} onClick={() => shelfMut.mutate(s.key)} disabled={shelfMut.isPending}>
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : (
                <Button variant="soft" onClick={() => navigate("/auth")}>Ingresá para guardar</Button>
              )}
            </div>

            <div className="detail__block">
              <h4>Formatos</h4>
              {book.files && book.files.length > 0 ? (
                <div className="row">
                  {book.files.map((f) => (
                    <Button key={f.id} variant="soft" icon="download" onClick={() => download(f.id)}>
                      {f.format.toUpperCase()}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="book__author">Todavía no hay archivos para descargar.</p>
              )}
            </div>

            <div className="detail__block">
              <h4>Parecidos a este</h4>
              <Recommendations query={`${book.title} ${book.authors.join(" ")}`} />
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
