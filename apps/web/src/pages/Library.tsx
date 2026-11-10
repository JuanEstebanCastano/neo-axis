import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import {
  Surface,
  Button,
  Field,
  Input,
  Select,
  Skeleton,
  EmptyState,
  Stars,
  Badge,
} from "../components/ui";
import { Icon } from "../components/Icon";
import { api, type Book, type LibroExterno } from "../lib/api";
import { useAuth } from "../context/AuthContext";
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

// ── Traer libros del catálogo externo ─────────────────────────────────

/** Los idiomas con más fondo en Project Gutenberg, y "cualquiera". */
const IDIOMAS = ["es", "en", "fr", "de", "pt", "it"];

/**
 * Una fila de resultado. Guarda su propio estado de importación para que
 * agregar uno no deje a los demás en "cargando".
 */
function Resultado({ libro }: { libro: LibroExterno }) {
  const qc = useQueryClient();
  const { t } = useI18n();

  const importar = useMutation({
    mutationFn: () => api.importExternalBook(libro.externalId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });

  return (
    <div className="item-row">
      <span className="item-row__ico" aria-hidden>
        <Icon name="book" size={19} />
      </span>

      <div className="grow">
        <div className="item-row__t">{libro.title}</div>
        <div className="item-row__note">
          {libro.authors.length ? libro.authors.join(", ") : t("common.unknownAuthor")}
        </div>
        <div className="row row--sm item-row__tags">
          {libro.readUrl && <Badge>{t("library.readable")}</Badge>}
          {libro.downloadUrl && <Badge>{t("library.downloadable")}</Badge>}
          {libro.languages.map((l) => (
            <Badge key={l} tone="accent">
              {l}
            </Badge>
          ))}
        </div>
      </div>

      {importar.data ? (
        <span className="row row--sm">
          <span className="result-line result-line--ok">
            <Icon name="check" size={14} />
            {t(importar.data.yaExistia ? "library.alreadyThere" : "library.added")}
          </span>
          <Link to={"/biblioteca/" + importar.data.bookId} className="btn btn--ghost">
            {t("library.seeBook")}
          </Link>
        </span>
      ) : (
        <Button
          variant="soft"
          icon="plus"
          loading={importar.isPending}
          onClick={() => importar.mutate()}
        >
          {t("library.add")}
        </Button>
      )}

      {importar.isError && (
        <p className="field__error" role="alert">
          {(importar.error as Error).message || t("library.addFailed")}
        </p>
      )}
    </div>
  );
}

function PanelImportar() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("");
  // El término con el que se buscó de verdad: sin esto, cada letra tecleada
  // dispararía una consulta a un servicio que no es nuestro.
  const [buscado, setBuscado] = useState<{ q: string; lang: string } | null>(null);

  const busqueda = useQuery({
    queryKey: ["books", "external", buscado?.q, buscado?.lang],
    queryFn: () => api.searchExternalBooks(buscado!.q, buscado!.lang || undefined),
    enabled: buscado !== null,
  });

  return (
    <Surface className="post block-gap">
      <p className="post__meta measure">{t("library.importIntro")}</p>

      <form
        className="row row--end"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) setBuscado({ q: q.trim(), lang });
        }}
      >
        <Field label={t("library.searchLabel")} className="col col--lg">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("library.searchPlaceholder")}
            required
          />
        </Field>
        <Field label={t("library.lang")} className="col col--sm">
          <Select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="">{t("library.langAny")}</option>
            {IDIOMAS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="accent"
          icon="search"
          type="submit"
          loading={busqueda.isFetching}
          disabled={q.trim().length < 2}
        >
          {t("library.search")}
        </Button>
      </form>

      {/* El aviso de derechos va acá, junto a la acción, y no enterrado en la
          documentación: es donde la persona decide traer algo. */}
      <p className="post__meta measure">
        <Icon name="alert" size={14} />
        {t("library.importRights")}
      </p>

      {busqueda.isFetching ? (
        <div className="wait">
          <span className="post__meta">{t("library.searching")}</span>
        </div>
      ) : busqueda.isError ? (
        <p className="field__error" role="alert">
          {t("library.searchFailed")}
        </p>
      ) : busqueda.data ? (
        busqueda.data.items.length === 0 ? (
          <p className="post__meta">{t("library.noResults")}</p>
        ) : (
          <div className="stack stack--sm">
            {busqueda.data.items.map((l) => (
              <Resultado key={l.externalId} libro={l} />
            ))}
          </div>
        )
      ) : null}
    </Surface>
  );
}

// ── Página ────────────────────────────────────────────────────────────

export function Library() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [importando, setImportando] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ["books"], queryFn: () => api.books() });

  return (
    <Shell
      title={t("library.title")}
      subtitle={t("library.subtitle")}
      actions={
        user ? (
          <Button variant="accent" icon="download" onClick={() => setImportando((v) => !v)}>
            {t(importando ? "common.close" : "library.import")}
          </Button>
        ) : (
          <Button variant="accent" onClick={() => navigate("/auth")}>
            {t("library.signInToImport")}
          </Button>
        )
      }
    >
      {importando && <PanelImportar />}

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
          <EmptyState
            icon="library"
            title={t("library.emptyTitle")}
            body={t("library.emptyBody")}
            action={
              user ? (
                <Button variant="accent" icon="download" onClick={() => setImportando(true)}>
                  {t("library.import")}
                </Button>
              ) : undefined
            }
          />
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
