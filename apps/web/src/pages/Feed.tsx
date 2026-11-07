import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Textarea, Skeleton, EmptyState } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, type Post } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "·";
}
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "hace un momento";
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function Composer() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", bodyMarkdown: "" });
  const mut = useMutation({
    mutationFn: () => api.createPost(form),
    onSuccess: () => { setForm({ title: "", bodyMarkdown: "" }); setOpen(false); qc.invalidateQueries({ queryKey: ["feed"] }); },
  });

  if (!open) {
    return <Button variant="accent" icon="plus" onClick={() => setOpen(true)}>Nueva publicación</Button>;
  }
  return (
    <Surface className="post" as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); mut.mutate(); }}>
      <Field label="Título">
        <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="¿Qué querés compartir?" />
      </Field>
      <Field label="Contenido">
        <Textarea value={form.bodyMarkdown} onChange={(e) => setForm((f) => ({ ...f, bodyMarkdown: e.target.value }))} placeholder="Escribí en Markdown…" />
      </Field>
      <div className="row spread">
        <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button variant="accent" type="submit" loading={mut.isPending} disabled={!form.title && !form.bodyMarkdown}>Publicar</Button>
      </div>
      {mut.isError && <p className="field__error">No se pudo publicar. ¿Iniciaste sesión?</p>}
    </Surface>
  );
}

/**
 * Tarjeta de publicación que se expande en el mismo feed. Al abrir, carga el
 * contenido completo (bodyMarkdown) de forma diferida con GET /posts/:id.
 */
function PostCard({ post }: { post: Post }) {
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ["post", post.id],
    queryFn: () => api.post(post.id),
    enabled: open,
  });
  const body = detail.data?.post.bodyMarkdown ?? null;
  const toggle = () => setOpen((v) => !v);

  return (
    <Surface
      className={`post post--clickable ${open ? "post--open" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      }}
    >
      <div className="post__meta">
        <span className="post__av">{initials(post.authorDisplayName)}</span>
        <strong style={{ color: "var(--text-2)" }}>{post.authorDisplayName}</strong>
        <span className="post__dot" />
        <span>@{post.authorUsername}</span>
        <span className="post__dot" />
        <span>{timeAgo(post.createdAt)}</span>
      </div>
      {post.title && <h3>{post.title}</h3>}

      {open ? (
        detail.isLoading ? (
          <Skeleton h={38} />
        ) : detail.isError ? (
          <p className="field__error">No se pudo cargar el contenido.</p>
        ) : body ? (
          <p className="post__body">{body}</p>
        ) : (
          <p className="post__body" style={{ color: "var(--text-3)" }}>Esta publicación no tiene contenido adicional.</p>
        )
      ) : (
        post.excerpt && <p>{post.excerpt}</p>
      )}

      <span className="post__toggle">
        <Icon name="arrow" size={15} />
        {open ? "Mostrar menos" : "Leer más"}
      </span>
    </Surface>
  );
}

export function Feed() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({ queryKey: ["feed"], queryFn: () => api.feed(20) });

  return (
    <Shell
      title="Feed de la comunidad"
      subtitle="Lo último que comparte la gente que construye."
      actions={user ? <Composer /> : <Button variant="accent" onClick={() => navigate("/auth")}>Ingresar para publicar</Button>}
    >
      {isLoading ? (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <Surface key={i} className="post"><Skeleton h={14} w="40%" /><Skeleton h={22} w="70%" /><Skeleton h={38} /></Surface>
          ))}
        </div>
      ) : isError ? (
        <Surface className="post"><EmptyState icon="feed" title="No pudimos cargar el feed" body="Revisá que la API esté corriendo e intentá de nuevo." /></Surface>
      ) : !data || data.items.length === 0 ? (
        <Surface><EmptyState icon="feed" title="Todavía no hay nada" body="Sé la primera persona en publicar algo para la comunidad." action={user ? undefined : <Button variant="accent" onClick={() => navigate("/auth")}>Crear cuenta</Button>} /></Surface>
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
