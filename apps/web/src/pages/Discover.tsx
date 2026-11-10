import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Shell } from "../components/Shell";
import { Surface, Button, Field, Input, EmptyState, Spinner } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, type RecoHit } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";

export function Discover() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<RecoHit[] | null>(null);

  const search = useMutation({
    mutationFn: () => api.recommend({ q, limit: 10 }),
    onSuccess: (r) => setHits(r.hits),
  });
  const reindex = useMutation({ mutationFn: () => api.reindex() });

  return (
    <Shell
      title={t("discover.title")}
      subtitle={t("discover.subtitle")}
      actions={
        user ? (
          <Button
            variant="soft"
            icon="spark"
            loading={reindex.isPending}
            onClick={() => reindex.mutate()}
          >
            {reindex.isSuccess ? t("discover.indexed", { n: reindex.data?.indexed ?? 0 }) : t("discover.reindex")}
          </Button>
        ) : undefined
      }
    >
      <Surface
        className="post"
        as="form"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          if (q.trim().length >= 2) search.mutate();
        }}
      >
        <div className="row row--end">
          <Field label={t("discover.searchLabel")} className="col col--lg">
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("discover.placeholder")}
            />
          </Field>
          <Button
            variant="accent"
            icon="search"
            type="submit"
            loading={search.isPending}
            disabled={q.trim().length < 2}
          >
            {t("discover.search")}
          </Button>
        </div>
      </Surface>

      <div className="discover__out">
        {search.isPending ? (
          <div className="wait">
            <Spinner />
          </div>
        ) : search.isError ? (
          <Surface>
            <EmptyState icon="spark" title={t("discover.errorTitle")} body={t("discover.errorBody")} />
          </Surface>
        ) : hits == null ? (
          <Surface>
            <EmptyState icon="search" title={t("discover.startTitle")} body={t("discover.startBody")} />
          </Surface>
        ) : hits.length === 0 ? (
          <Surface>
            <EmptyState
              icon="spark"
              title={t("discover.noResultsTitle")}
              body={t("discover.noResultsBody")}
            />
          </Surface>
        ) : (
          <div className="stack stack--sm">
            {hits.map((h, i) => (
              <div className="reco" key={h.entityId}>
                <span className="reco__rank" aria-hidden>
                  {i + 1}
                </span>
                <span className="reco__t">{h.title ?? t("common.empty")}</span>
                <span className="badge badge--accent">
                  <Icon name="spark" size={13} />
                  {t("discover.affinity", { n: Math.max(0, Math.round((1 - h.distance) * 100)) })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
