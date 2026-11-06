import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Textarea, Skeleton, EmptyState } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, type Collection } from "../lib/api";
import { useAuth } from "../context/AuthContext";

function CreateForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", description: "" });
  const mut = useMutation({
    mutationFn: () => api.createCollection(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["collections"] }); onClose(); },
  });
  return (
    <Surface className="coll" as="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); mut.mutate(); }}>
      <Field label="Título de la colección">
        <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Aprender Clean Architecture" required />
      </Field>
      <Field label="Descripción">
        <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Libros y repos para dominar el tema." />
      </Field>
      <div className="row spread">
        <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
        <Button variant="accent" type="submit" loading={mut.isPending} disabled={!form.title}>Crear</Button>
      </div>
    </Surface>
  );
}

export function Collections() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ["collections"], queryFn: () => api.collections() });

  return (
    <Shell
      title="Colecciones"
      subtitle="Rutas que unen los libros que leés con el código que practicás."
      actions={user
        ? <Button variant="accent" icon="plus" onClick={() => setCreating((v) => !v)}>Nueva colección</Button>
        : <Button variant="accent" onClick={() => navigate("/auth")}>Ingresar para crear</Button>}
    >
      {creating && <div style={{ marginBottom: 20, maxWidth: 520 }}><CreateForm onClose={() => setCreating(false)} /></div>}

      {isLoading ? (
        <div className="grid grid--cards">{[0, 1, 2, 3].map((i) => <Surface key={i} className="coll"><Skeleton h={20} w="60%" /><Skeleton h={40} /></Surface>)}</div>
      ) : isError ? (
        <Surface><EmptyState icon="collections" title="No pudimos cargar las colecciones" body="Revisá la conexión con la API." /></Surface>
      ) : !data || data.items.length === 0 ? (
        <Surface><EmptyState icon="collections" title="Sin colecciones todavía" body="Creá la primera y empezá a agrupar libros, repos y snippets por tema." action={user ? <Button variant="accent" icon="plus" onClick={() => setCreating(true)}>Nueva colección</Button> : undefined} /></Surface>
      ) : (
        <div className="grid grid--cards">
          {data.items.map((c: Collection) => (
            <Link key={c.id} to={`/colecciones/${c.id}`}>
              <Surface className="coll">
                <h3>{c.title}</h3>
                <p>{c.description || "Sin descripción."}</p>
                <div className="coll__foot">
                  <span>{c.visibility === "community" ? "Pública" : "Restringida"}</span>
                  <span className="coll__arrow"><Icon name="arrow" size={18} /></span>
                </div>
              </Surface>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
