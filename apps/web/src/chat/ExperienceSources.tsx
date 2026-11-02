import { BannerToast, Button, TextField } from "@jack.winter/pancake-ui";
import type { ExperienceSource } from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import { type Api, errorMessage } from "../api/chat";

export function ExperienceSources({
  api,
  disabled,
}: {
  api: Api;
  disabled: boolean;
}) {
  const [sources, setSources] = useState<ExperienceSource[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState("");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Awaited<
    ReturnType<Api["experienceDetail"]>
  > | null>(null);
  const mounted = useRef(false);
  const lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    void api
      .experience()
      .then((result) => {
        if (!alive) return;
        setSources(result.sources);
        setConfigured(result.configured);
      })
      .catch((cause: unknown) => {
        if (alive) setError(errorMessage(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      mounted.current = false;
    };
  }, [api]);
  async function reload() {
    const result = await api.experience();
    if (!mounted.current) return;
    setSources(result.sources);
    setConfigured(result.configured);
  }
  async function run(operation: () => Promise<void>) {
    if (lock.current || disabled || loading) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const unavailable = disabled || busy || loading;
  return (
    <details className="experience-sources">
      <summary>Notion experience</summary>
      <p className="muted">
        Import only the pages you choose. Relevant passages are searched locally
        when you submit an interview question.
      </p>
      {error && (
        <BannerToast tone="error" title="Could not update experience">
          {error}
        </BannerToast>
      )}
      {loading ? (
        <p role="status">Loading experience sources…</p>
      ) : (
        !configured && (
          <p>
            Notion import is unavailable for this account. The owner can
            configure a read-only Notion connection on the server.
          </p>
        )
      )}
      {configured && (
        <form
          className="experience-import"
          onSubmit={(event) => {
            event.preventDefault();
            if (!page.trim()) return;
            void run(async () => {
              try {
                await api.importExperience(page.trim());
                if (mounted.current) setPage("");
              } finally {
                if (mounted.current) setDetail(null);
                await reload();
              }
            });
          }}
        >
          <TextField
            label="Notion page ID or link"
            value={page}
            maxLength={500}
            onChange={(event) => setPage(event.currentTarget.value)}
            disabled={unavailable}
            helperText="Share the selected page with the server's Notion connection first. Child pages must be imported separately."
          />
          <Button type="submit" disabled={unavailable || !page.trim()}>
            Import page
          </Button>
        </form>
      )}
      <div className="experience-source-list">
        {!loading && sources.length === 0 && <p>No imported pages yet.</p>}
        {sources.map((source) => (
          <article
            className="experience-source"
            key={source.id}
            aria-label={source.title}
          >
            <a
              href={`https://www.notion.so/${source.pageId.replaceAll("-", "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {source.title}
            </a>
            <p className="source-import-time">
              Imported {new Date(source.importedAt).toLocaleString()} ·{" "}
              {source.passageCount}{" "}
              {source.passageCount === 1 ? "passage" : "passages"}
            </p>
            {source.error && (
              <p className="source-error">
                Last refresh failed: {source.error} This older copy is excluded
                from new answers until refreshed successfully.
              </p>
            )}
            {source.warnings.length > 0 && (
              <ul className="source-warnings">
                {source.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="experience-source-actions">
              <Button
                variant="ghost"
                disabled={unavailable}
                onClick={() => {
                  void run(async () => {
                    const result = await api.experienceDetail(source.id);
                    if (mounted.current) setDetail(result);
                  });
                }}
              >
                Inspect passages
              </Button>
              <Button
                variant="ghost"
                disabled={unavailable || !configured}
                onClick={() => {
                  void run(async () => {
                    try {
                      await api.refreshExperience(source.id);
                    } finally {
                      if (mounted.current) setDetail(null);
                      await reload();
                    }
                  });
                }}
              >
                Refresh page
              </Button>
              <Button
                variant="ghost"
                disabled={unavailable}
                onClick={() => {
                  void run(async () => {
                    await api.removeExperience(source.id);
                    if (mounted.current) setDetail(null);
                    await reload();
                  });
                }}
              >
                Remove page
              </Button>
            </div>
          </article>
        ))}
      </div>
      {detail && (
        <section className="experience-preview" aria-label="Imported passages">
          <div className="experience-preview-heading">
            <h3>{detail.source.title}</h3>
            <Button variant="ghost" onClick={() => setDetail(null)}>
              Close passages
            </Button>
          </div>
          {detail.passages.length === 0 ? (
            <p>No supported text was imported from this page.</p>
          ) : (
            detail.passages.map((passage, index) => (
              <blockquote key={`${passage.blockId}-${index}`}>
                {passage.excerpt}
              </blockquote>
            ))
          )}
        </section>
      )}
      <div className="experience-source-actions">
        <Button
          variant="ghost"
          disabled={unavailable}
          onClick={() => {
            void run(reload);
          }}
        >
          Reload sources
        </Button>
        {busy && <span role="status">Updating experience…</span>}
      </div>
      <p className="interview-note">
        Removing a page deletes its local searchable copy. Saved answers and
        their evidence snapshots may still contain excerpts; delete those
        conversations separately.
      </p>
    </details>
  );
}
