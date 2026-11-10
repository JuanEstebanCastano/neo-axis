import { useEffect, useState } from "react";
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
import { api, type Book, type BookFilters, type LibroExterno } from "../lib/api";
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

// ── Agregar un libro pegando sus enlaces ──────────────────────────────

const FORM_VACIO = {
  title: "",
  authors: "",
  languageCode: "",
  readUrl: "",
  downloadUrl: "",
  coverUrl: "",
  sourceUrl: "",
  rightsNote: "",
};

function PanelEnlace({ onListo }: { onListo: () => void }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [form, setForm] = useState(FORM_VACIO);

  const upd =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const guardar = useMutation({
    mutationFn: () =>
      api.linkBook({
        title: form.title.trim(),
        // "Rivera, José Eustasio, Otro Autor" -> dos nombres. Lo separa la
        // coma porque es como se escriben los autores en una ficha.
        authors: form.authors
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        rightsNote: form.rightsNote.trim(),
        ...(form.languageCode.trim() ? { languageCode: form.languageCode.trim() } : {}),
        ...(form.readUrl.trim() ? { readUrl: form.readUrl.trim() } : {}),
        ...(form.downloadUrl.trim() ? { downloadUrl: form.downloadUrl.trim() } : {}),
        ...(form.coverUrl.trim() ? { coverUrl: form.coverUrl.trim() } : {}),
        ...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
      setForm(FORM_VACIO);
    },
  });

  const sinEnlace = !form.readUrl.trim() && !form.downloadUrl.trim();
  const listo = form.title.trim() && form.rightsNote.trim() && !sinEnlace;

  if (guardar.data) {
    return (
      <Surface className="post block-gap">
        <p className="result-line result-line--ok" role="status">
          <Icon name="check" size={14} />
          {t("link.added")}
          <Link to={"/biblioteca/" + guardar.data.bookId}>{t("link.seeBook")}</Link>
        </p>
        <div className="row row--sm">
          <Button variant="ghost" icon="plus" onClick={() => guardar.reset()}>
            {t("link.add")}
          </Button>
          <Button variant="ghost" onClick={onListo}>
            {t("common.close")}
          </Button>
        </div>
      </Surface>
    );
  }

  return (
    <Surface
      className="post block-gap"
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        if (listo) guardar.mutate();
      }}
    >
      <p className="post__meta measure">{t("link.intro")}</p>

      {/* El aviso va antes de los campos, no debajo del botón: tiene que
          leerse antes de pegar nada, no después de haberlo subido. */}
      <p className="post__meta measure">
        <Icon name="alert" size={14} />
        {t("link.legal")}
      </p>

      <div className="row row--top">
        <Field label={t("link.title")} className="col col--lg">
          <Input value={form.title} onChange={upd("title")} placeholder={t("link.titlePlaceholder")} required />
        </Field>
        <Field label={t("link.lang")} className="col col--sm">
          <Input value={form.languageCode} onChange={upd("languageCode")} placeholder={t("link.langPlaceholder")} />
        </Field>
      </div>

      <Field label={t("link.authors")} hint={t("link.authorsHint")}>
        <Input value={form.authors} onChange={upd("authors")} placeholder={t("link.authorsPlaceholder")} />
      </Field>

      <div className="row row--top">
        <Field label={t("link.readUrl")} hint={t("link.readUrlHint")} className="col">
          <Input type="url" value={form.readUrl} onChange={upd("readUrl")} placeholder="https://…" />
        </Field>
        <Field label={t("link.downloadUrl")} hint={t("link.downloadUrlHint")} className="col">
          <Input type="url" value={form.downloadUrl} onChange={upd("downloadUrl")} placeholder="https://…" />
        </Field>
      </div>

      {sinEnlace && <p className="field__hint">{t("link.oneLinkNeeded")}</p>}

      <div className="row row--top">
        <Field label={t("link.coverUrl")} className="col">
          <Input type="url" value={form.coverUrl} onChange={upd("coverUrl")} placeholder="https://…" />
        </Field>
        <Field label={t("link.sourceUrl")} hint={t("link.sourceUrlHint")} className="col">
          <Input type="url" value={form.sourceUrl} onChange={upd("sourceUrl")} placeholder="https://…" />
        </Field>
      </div>

      <Field label={t("link.rights")} hint={t("link.rightsHint")}>
        <Input
          value={form.rightsNote}
          onChange={upd("rightsNote")}
          placeholder={t("link.rightsPlaceholder")}
          required
        />
      </Field>

      <div className="row spread">
        <Button variant="ghost" onClick={onListo}>
          {t("common.cancel")}
        </Button>
        <Button variant="accent" type="submit" loading={guardar.isPending} disabled={!listo}>
          {t("link.submit")}
        </Button>
      </div>

      {guardar.isError && (
        <p className="field__error" role="alert">
          {(guardar.error as Error).message || t("link.failed")}
        </p>
      )}
    </Surface>
  );
}

// ── Filtros del catálogo ──────────────────────────────────────────────

function BarraFiltros({
  filtros,
  onCambiar,
  idiomas,
}: {
  filtros: BookFilters;
  onCambiar: (f: BookFilters) => void;
  idiomas: string[];
}) {
  const { t } = useI18n();
  // El texto se escribe acá y se manda con retardo: así teclear no dispara
  // una consulta por letra.
  const [texto, setTexto] = useState(filtros.q ?? "");

  useEffect(() => {
    const id = setTimeout(() => {
      if ((filtros.q ?? "") !== texto) onCambiar({ ...filtros, q: texto || undefined });
    }, 300);
    return () => clearTimeout(id);
    // Sólo `texto` en las dependencias, a propósito: `filtros` y `onCambiar`
    // cambian de identidad en cada render y reiniciarían el temporizador sin
    // parar, de modo que la búsqueda no se mandaría nunca.
  }, [texto]);

  const activos =
    Boolean(filtros.q) ||
    Boolean(filtros.lang) ||
    (filtros.source && filtros.source !== "any") ||
    (filtros.access && filtros.access !== "any");

  return (
    <Surface className="post block-gap">
      <div className="row row--top">
        <Field label={t("library.filterSearch")} className="col col--lg">
          <Input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t("library.filterSearchPlaceholder")}
          />
        </Field>

        <Field label={t("library.filterLang")} className="col col--sm">
          <Select
            value={filtros.lang ?? ""}
            onChange={(e) => onCambiar({ ...filtros, lang: e.target.value || undefined })}
          >
            <option value="">{t("library.filterLangAll")}</option>
            {idiomas.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("library.filterSource")} className="col">
          <Select
            value={filtros.source ?? "any"}
            onChange={(e) => onCambiar({ ...filtros, source: e.target.value as BookFilters["source"] })}
          >
            <option value="any">{t("library.sourceAny")}</option>
            <option value="gutendex">{t("library.sourceGutendex")}</option>
            <option value="manual">{t("library.sourceManual")}</option>
          </Select>
        </Field>

        <Field label={t("library.filterAccess")} className="col">
          <Select
            value={filtros.access ?? "any"}
            onChange={(e) => onCambiar({ ...filtros, access: e.target.value as BookFilters["access"] })}
          >
            <option value="any">{t("library.accessAny")}</option>
            <option value="readable">{t("library.accessReadable")}</option>
            <option value="downloadable">{t("library.accessDownloadable")}</option>
          </Select>
        </Field>
      </div>

      {activos && (
        <div className="row row--right">
          <Button
            variant="ghost"
            icon="close"
            onClick={() => {
              setTexto("");
              onCambiar({});
            }}
          >
            {t("library.clearFilters")}
          </Button>
        </div>
      )}
    </Surface>
  );
}

// ── Página ────────────────────────────────────────────────────────────

export function Library() {
  const { t, tn } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<"ninguno" | "importar" | "enlace">("ninguno");
  const [filtros, setFiltros] = useState<BookFilters>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["books", filtros],
    queryFn: () => api.books(filtros),
  });

  // Los idiomas salen del propio catálogo: ofrecer francés sin libros en
  // francés es un filtro que sólo sirve para no encontrar nada.
  const idiomas = useQuery({ queryKey: ["books", "languages"], queryFn: () => api.bookLanguages() });

  const hayFiltros = Object.values(filtros).some((v) => v && v !== "any");
  const libros = data?.items ?? [];

  return (
    <Shell
      title={t("library.title")}
      subtitle={t("library.subtitle")}
      actions={
        user ? (
          <>
            <Button
              variant="ghost"
              icon="plus"
              onClick={() => setPanel((p) => (p === "enlace" ? "ninguno" : "enlace"))}
            >
              {t("link.add")}
            </Button>
            <Button
              variant="accent"
              icon="download"
              onClick={() => setPanel((p) => (p === "importar" ? "ninguno" : "importar"))}
            >
              {t(panel === "importar" ? "common.close" : "library.import")}
            </Button>
          </>
        ) : (
          <Button variant="accent" onClick={() => navigate("/auth")}>
            {t("library.signInToImport")}
          </Button>
        )
      }
    >
      {panel === "importar" && <PanelImportar />}
      {panel === "enlace" && <PanelEnlace onListo={() => setPanel("ninguno")} />}

      {/* La barra sólo aparece cuando hay algo que filtrar. Con la biblioteca
          vacía sería un control que no puede hacer nada. */}
      {(libros.length > 0 || hayFiltros) && (
        <BarraFiltros
          filtros={filtros}
          onCambiar={setFiltros}
          idiomas={idiomas.data?.languages ?? []}
        />
      )}

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
      ) : libros.length === 0 ? (
        <Surface>
          {/* Dos vacíos distintos: no hay nada, o no hay nada CON ESTOS
              filtros. Decir "biblioteca vacía" con un filtro puesto manda a
              buscar un problema que no existe. */}
          <EmptyState
            icon="library"
            title={t(hayFiltros ? "library.noMatchesTitle" : "library.emptyTitle")}
            body={t(hayFiltros ? "library.noMatchesBody" : "library.emptyBody")}
            action={
              hayFiltros ? (
                <Button variant="soft" icon="close" onClick={() => setFiltros({})}>
                  {t("library.clearFilters")}
                </Button>
              ) : user ? (
                <Button variant="accent" icon="download" onClick={() => setPanel("importar")}>
                  {t("library.import")}
                </Button>
              ) : undefined
            }
          />
        </Surface>
      ) : (
        <>
          <p className="post__meta block-gap">
            {tn(libros.length, "library.countOne", "library.countMany")}
          </p>
          <div className="grid grid--books">
            {libros.map((b: Book) => (
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
        </>
      )}
    </Shell>
  );
}
