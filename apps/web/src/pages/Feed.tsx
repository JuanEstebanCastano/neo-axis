import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Textarea, Skeleton, EmptyState } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, type Post } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "·";
}

function Composer() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", bodyMarkdown: "" });
  const mut = useMutation({
    mutationFn: () => api.createPost(form),
    onSuccess: () => {
      setForm({ title: "", bodyMarkdown: "" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  if (!open) {
    return (
      <Button variant="accent" icon="plus" onClick={() => setOpen(true)}>
        {t("feed.new")}
      </Button>
    );
  }

  return (
    <Surface
      className="post"
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <Field label={t("feed.postTitle")}>
        <Input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder={t("feed.postTitlePlaceholder")}
        />
      </Field>
      <Field label={t("feed.postBody")}>
        <Textarea
          value={form.bodyMarkdown}
          onChange={(e) => setForm((f) => ({ ...f, bodyMarkdown: e.target.value }))}
          placeholder={t("feed.postBodyPlaceholder")}
        />
      </Field>
      <div className="row spread">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="accent"
          type="submit"
          loading={mut.isPending}
          disabled={!form.title && !form.bodyMarkdown}
        >
          {t("feed.publish")}
        </Button>
      </div>
      {mut.isError && (
        <p className="field__error" role="alert">
          {t("feed.publishFailed")}
        </p>
      )}
    </Surface>
  );
}

/**
 * Tarjeta de publicación que se expande en el mismo feed. Al abrir, carga el
 * contenido completo (bodyMarkdown) de forma diferida con GET /posts/:id.
 */
function PostCard({ post }: { post: Post }) {
  const { t, timeAgo } = useI18n();
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ["post", post.id],
    queryFn: () => api.post(post.id),
    enabled: open,
  });
  const body = detail.data?.post.bodyMarkdown ?? null;
  const toggle = () => setOpen((v) => !v);

  return (
    /* La tarjeta entera es pulsable con el ratón, pero NO es un botón: con
       `role="button"` alrededor, el lector de pantalla aplastaba el título,
       el autor y el cuerpo en un solo nombre larguísimo y no dejaba leer
       nada por dentro. El control de verdad es el "Leer más" del pie, y por
       ahí pasa el teclado. */
    <Surface
      className={`post post--clickable ${open ? "post--open" : ""}`}
      // Seleccionar un pedazo de texto termina en un clic sobre la tarjeta:
      // sin esta guarda, copiar una cita la cerraba en la cara.
      onClick={() => {
        if (window.getSelection()?.toString()) return;
        toggle();
      }}
    >
      <div className="post__meta">
        <span className="post__av" aria-hidden>
          {initials(post.authorDisplayName)}
        </span>
        <strong className="post__author">{post.authorDisplayName}</strong>
        <span className="post__seg">
          <span className="post__dot" aria-hidden />
          <span>@{post.authorUsername}</span>
        </span>
        <span className="post__seg">
          <span className="post__dot" aria-hidden />
          <span>{timeAgo(post.createdAt)}</span>
        </span>
      </div>

      {post.title && <h3>{post.title}</h3>}

      {open ? (
        detail.isLoading ? (
          <Skeleton h={38} />
        ) : detail.isError ? (
          <p className="field__error">{t("feed.bodyFailed")}</p>
        ) : body ? (
          <p className="post__body">{body}</p>
        ) : (
          <p className="post__body post__body--muted">{t("feed.noBody")}</p>
        )
      ) : (
        post.excerpt && <p>{post.excerpt}</p>
      )}

      <button
        type="button"
        className="post__toggle"
        aria-expanded={open}
        // La tarjeta de arriba también escucha el clic: sin frenarlo acá, un
        // clic en este botón contaba doble y la tarjeta volvía a cerrarse.
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        <Icon name="arrow" size={15} />
        {t(open ? "feed.showLess" : "feed.readMore")}
      </button>
    </Surface>
  );
}

export function Feed() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({ queryKey: ["feed"], queryFn: () => api.feed(20) });

  return (
    <Shell
      title={t("feed.title")}
      subtitle={t("feed.subtitle")}
      actions={
        user ? (
          <Composer />
        ) : (
          <Button variant="accent" onClick={() => navigate("/auth")}>
            {t("feed.signInToPost")}
          </Button>
        )
      }
    >
      {isLoading ? (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <Surface key={i} className="post">
              <Skeleton h={14} w="40%" />
              <Skeleton h={22} w="70%" />
              <Skeleton h={38} />
            </Surface>
          ))}
        </div>
      ) : isError ? (
        <Surface>
          <EmptyState icon="feed" title={t("feed.errorTitle")} body={t("feed.errorBody")} />
        </Surface>
      ) : !data || data.items.length === 0 ? (
        <Surface>
          <EmptyState
            icon="feed"
            title={t("feed.emptyTitle")}
            body={t("feed.emptyBody")}
            action={
              user ? undefined : (
                <Button variant="accent" onClick={() => navigate("/auth")}>
                  {t("common.createAccount")}
                </Button>
              )
            }
          />
        </Surface>
      ) : (
        <div className="stack">
          {data.items.map((p: Post) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </Shell>
  );
}
