import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, Textarea, Skeleton, EmptyState } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, type Collection } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";

function CreateForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [form, setForm] = useState({ title: "", description: "" });
  const mut = useMutation({
    mutationFn: () => api.createCollection(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections"] });
      onClose();
    },
  });

  return (
    <Surface
      className="coll"
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <Field label={t("collections.formTitle")}>
        <Input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder={t("collections.formTitlePlaceholder")}
          required
        />
      </Field>
      <Field label={t("collections.formDesc")}>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder={t("collections.formDescPlaceholder")}
        />
      </Field>
      <div className="row spread">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="accent" type="submit" loading={mut.isPending} disabled={!form.title}>
          {t("common.create")}
        </Button>
      </div>
      {mut.isError && (
        <p className="field__error" role="alert">
          {t("common.saveFailed")}
        </p>
      )}
    </Surface>
  );
}

export function Collections() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["collections"],
    queryFn: () => api.collections(),
  });

  return (
    <Shell
      title={t("collections.title")}
      subtitle={t("collections.subtitle")}
      actions={
        user ? (
          <Button variant="accent" icon="plus" onClick={() => setCreating((v) => !v)}>
            {t("collections.new")}
          </Button>
        ) : (
          <Button variant="accent" onClick={() => navigate("/auth")}>
            {t("collections.signInToCreate")}
          </Button>
        )
      }
    >
      {creating && (
        <div className="block-gap narrow">
          <CreateForm onClose={() => setCreating(false)} />
        </div>
      )}

      {isLoading ? (
        <div className="grid grid--cards">
          {[0, 1, 2, 3].map((i) => (
            <Surface key={i} className="coll">
              <Skeleton h={20} w="60%" />
              <Skeleton h={40} />
            </Surface>
          ))}
        </div>
      ) : isError ? (
        <Surface>
          <EmptyState
            icon="collections"
            title={t("collections.errorTitle")}
            body={t("common.checkApi")}
          />
        </Surface>
      ) : !data || data.items.length === 0 ? (
        <Surface>
          <EmptyState
            icon="collections"
            title={t("collections.emptyTitle")}
            body={t("collections.emptyBody")}
            action={
              user ? (
                <Button variant="accent" icon="plus" onClick={() => setCreating(true)}>
                  {t("collections.new")}
                </Button>
              ) : undefined
            }
          />
        </Surface>
      ) : (
        <div className="grid grid--cards">
          {data.items.map((c: Collection) => (
            <Link key={c.id} to={`/colecciones/${c.id}`} className="coll-link">
              <Surface className="coll">
                <h3>{c.title}</h3>
                <p>{c.description || t("collections.noDesc")}</p>
                <div className="coll__foot">
                  <span>
                    {t(c.visibility === "community" ? "collections.public" : "collections.restricted")}
                  </span>
                  <span className="coll__arrow" aria-hidden>
                    <Icon name="arrow" size={18} />
                  </span>
                </div>
              </Surface>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
