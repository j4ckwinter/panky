import { BannerToast, Button, TextField } from "@jack.winter/pancake-ui";
import { EXPERIENCE_LIMITS, type NotionConnection } from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import { type Api, errorMessage } from "../api/chat";

type Page = { id: string; title: string };
export function NotionPagePicker({
  api,
  disabled,
  onImport,
  onBusy,
  onConnectionChange,
  close,
}: {
  api: Api;
  disabled: boolean;
  onImport: (pages: Page[]) => Promise<void>;
  onBusy: (busy: boolean) => void;
  onConnectionChange: (connection: NotionConnection) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Page[]>([]);
  const [pageLink, setPageLink] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const searchField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchField.current?.focus();
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      active.current?.abort();
      onBusy(false);
    };
  }, [onBusy]);
  useEffect(() => {
    if (disabled) active.current?.abort();
  }, [disabled]);

  async function search(next?: string) {
    if (active.current || disabled) return;
    const controller = new AbortController();
    active.current = controller;
    setSearching(true);
    onBusy(true);
    setError("");
    const title = next ? searchedQuery : query.trim();
    try {
      const result = await api.searchNotionPages(
        { query: title, ...(next ? { cursor: next } : {}) },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setPages(result.pages);
      setCursor(result.nextCursor);
      setSearchedQuery(title);
      setSearched(true);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(errorMessage(cause));
      try {
        const connection = await api.notionConnection(controller.signal);
        if (!controller.signal.aborted) onConnectionChange(connection);
      } catch {}
    } finally {
      if (active.current === controller) active.current = null;
      if (alive.current) {
        setSearching(false);
        onBusy(false);
      }
    }
  }

  const unavailable = disabled || searching;
  return (
    <section className="notion-page-picker" aria-label="Choose Notion pages">
      <div className="notion-source-heading">
        <h3>Choose pages</h3>
        <Button variant="ghost" disabled={disabled} onClick={close}>
          Close picker
        </Button>
      </div>
      <p className="muted">
        Search titles of pages shared with this connection. Results may be
        incomplete or take time to update. Search again to reload, or enter a
        page link. Child pages must be selected separately.
      </p>
      <form
        className="notion-page-search"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <TextField
          ref={searchField}
          label="Search page titles"
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.currentTarget.value)}
          disabled={unavailable}
          helperText="Leave blank to browse available pages."
        />
        <Button type="submit" variant="secondary" disabled={unavailable}>
          Search pages
        </Button>
      </form>
      {error && (
        <BannerToast tone="error" title="Could not find pages">
          {error}
        </BannerToast>
      )}
      {searching && <p role="status">Searching Notion…</p>}
      {searched && !searching && pages.length === 0 && (
        <p>
          No matching pages. Check page permissions in Notion or enter its link
          below.
        </p>
      )}
      <div className="notion-page-options">
        {pages.map((page) => {
          const checked = selected.some((item) => item.id === page.id);
          return (
            <label className="notion-page-option" key={page.id}>
              <input
                type="checkbox"
                checked={checked}
                disabled={
                  unavailable ||
                  (!checked && selected.length >= EXPERIENCE_LIMITS.sources)
                }
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setSelected((current) =>
                    checked
                      ? [...current, page]
                      : current.filter((item) => item.id !== page.id),
                  );
                }}
              />
              <span>{page.title}</span>
            </label>
          );
        })}
      </div>
      <div className="notion-connection-actions">
        {cursor && (
          <Button
            variant="secondary"
            disabled={unavailable}
            onClick={() => {
              void search(cursor);
            }}
          >
            Next results
          </Button>
        )}
        <Button
          disabled={unavailable || selected.length === 0}
          onClick={() => {
            const chosen = selected;
            setSelected([]);
            void onImport(chosen);
          }}
        >
          Import selected ({selected.length})
        </Button>
      </div>
      <p className="muted">
        {selected.length} selected across results. Up to{" "}
        {EXPERIENCE_LIMITS.sources} imported pages per account. Importing
        creates a local copy.
      </p>
      <form
        className="notion-page-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pageLink.trim() || unavailable) return;
          const page = pageLink.trim();
          setPageLink("");
          void onImport([{ id: page, title: page }]);
        }}
      >
        <TextField
          label="Notion page ID or link"
          value={pageLink}
          maxLength={500}
          disabled={unavailable}
          onChange={(event) => setPageLink(event.currentTarget.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={unavailable || !pageLink.trim()}
        >
          Import page
        </Button>
      </form>
    </section>
  );
}
