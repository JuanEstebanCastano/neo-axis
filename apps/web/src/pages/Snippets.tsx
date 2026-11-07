import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Textarea, Skeleton, EmptyState, Badge } from "../components/ui";
import { api, type Snippet } from "../lib/api";
import { useAuth } from "../context/AuthContext";

function ShareForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", language: "", filename: "", sourceCode: "" });
  const mut = useMutation({
    mutationFn: () => api.createSnippet(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["snippets"] }); onClose(); },
  });
  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Surface className="post" as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); mut.mutate(); }}>
      <div className="row" style={{ gap: 14 }}>
        <div style={{ flex: 2, minWidth: 180 }}><Field label="Título"><Input value={form.title} onChange={upd("title")} placeholder="Debounce en TypeScript" required /></Field></div>
        <div style={{ flex: 1, minWidth: 120 }}><Field label="Lenguaje"><Input value={form.language} onChange={upd("language")} placeholder="typescript" required /></Field></div>
        <div style={{ flex: 1, minWidth: 120 }}><Field label="Archivo (opcional)"><Input value={form.filename} onChange={upd("filename")} placeholder="debounce.ts" /></Field></div>
      </div>
      <Field label="Código">
        <Textarea className="input input--area mono" value={form.sourceCode} onChange={upd("sourceCode")} placeholder="export function debounce(...) { … }" style={{ minHeight: 160 }} required />
      </Field>
      <div className="row spread">
        <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
        <Button variant="accent" type="submit" loading={mut.isPending} disabled={!form.title || !form.language || !form.sourceCode}>Compartir</Button>
      </div>
      {mut.isError && <p className="field__error">No se pudo compartir. ¿Iniciaste sesión?</p>}
    </Surface>
  );
}

export function Snippets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sharing, setSharing] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ["snippets"], queryFn: () => api.snippets() });

  return (
    <Shell
      title="Snippets"
      subtitle="Fragmentos de código que la comunidad comparte."
      actions={user
        ? <Button variant="accent" icon="plus" onClick={() => setSharing((v) => !v)}>Compartir snippet</Button>
        : <Button variant="accent" onClick={() => navigate("/auth")}>Ingresar para compartir</Button>}
    >
      {sharing && <div style={{ marginBottom: 20 }}><ShareForm onClose={() => setSharing(false)} /></div>}

      {isLoading ? (
        <div className="stack">{[0, 1].map((i) => <Skeleton key={i} h={160} r={18} />)}</div>
      ) : isError ? (
        <Surface><EmptyState icon="snippet" title="No pudimos cargar los snippets" body="Revisá la conexión con la API." /></Surface>
      ) : !data || data.items.length === 0 ? (
        <Surface><EmptyState icon="snippet" title="Todavía no hay snippets" body="Compartí el primer fragmento de código útil." action={user ? <Button variant="accent" icon="plus" onClick={() => setSharing(true)}>Compartir snippet</Button> : undefined} /></Surface>
      ) : (
        <div className="stack">
          {data.items.map((s: Snippet) => (
            <Surface key={s.id} className="post">
              <div className="row spread">
                <div>
                  <h3>{s.title}</h3>
                  <div className="post__meta"><span>@{s.authorUsername}</span>{s.filename && <><span className="post__dot" /><span className="mono">{s.filename}</span></>}</div>
                </div>
                <Badge tone="accent">{s.language}</Badge>
              </div>
              <pre className="code"><code>{s.sourceCode}</code></pre>
            </Surface>
          ))}
        </div>
      )}
    </Shell>
  );
}
