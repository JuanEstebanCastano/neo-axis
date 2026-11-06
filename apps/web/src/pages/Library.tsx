import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Skeleton, EmptyState, Stars } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, type Book } from "../lib/api";

function Cover({ book }: { book: Book }) {
  if (book.coverUrl) {
    return <div className="book__cover"><img src={book.coverUrl} alt={`Portada de ${book.title}`} loading="lazy" /></div>;
  }
  return (
    <div className="book__cover book__cover--ph">
      <Icon name="book" size={34} />
    </div>
  );
}

export function Library() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["books"], queryFn: () => api.books() });

  return (
    <Shell title="Biblioteca" subtitle="Libros de la comunidad. Guardalos en tu estantería y seguí tu lectura.">
      {isLoading ? (
        <div className="grid grid--books">{Array.from({ length: 10 }).map((_, i) => (
          <div className="book" key={i}><Skeleton h={220} r={14} /><Skeleton h={14} w="80%" /><Skeleton h={12} w="50%" /></div>
        ))}</div>
      ) : isError ? (
        <Surface><EmptyState icon="library" title="No pudimos cargar los libros" body="Revisá la conexión con la API." /></Surface>
      ) : !data || data.items.length === 0 ? (
        <Surface><EmptyState icon="library" title="Biblioteca vacía" body="Todavía no hay libros cargados en el catálogo." /></Surface>
      ) : (
        <div className="grid grid--books">
          {data.items.map((b: Book) => (
            <Link to={`/biblioteca/${b.id}`} key={b.id} className="book">
              <Cover book={b} />
              <div>
                <div className="book__title">{b.title}</div>
                <div className="book__author">{b.authors.length ? b.authors.join(", ") : "Autor desconocido"}</div>
              </div>
              <Stars value={b.ratingAvg} />
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
