import { Button } from "@jack.winter/pancake-ui";
import type { ExperienceSource } from "@panky/shared";
import type { Api } from "../api/chat";

export function NotionSourceList({
  sources,
  disabled,
  connected,
  inspect,
  refresh,
  remove,
}: {
  sources: ExperienceSource[];
  disabled: boolean;
  connected: boolean;
  inspect: (id: string) => void;
  refresh: (source: ExperienceSource) => void;
  remove: (id: string) => void;
}) {
  return (
    <div className="notion-source-list">
      {sources.map((source) => (
        <article
          className="notion-source"
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
          <p className="muted">
            Imported {new Date(source.importedAt).toLocaleString()} ·{" "}
            {source.passageCount}{" "}
            {source.passageCount === 1 ? "passage" : "passages"}
          </p>
          <p className="notion-source-status">
            {!connected
              ? "Reconnect required"
              : source.error
                ? "Failed refresh"
                : source.passageCount === 0
                  ? "No usable text"
                  : source.warnings.length
                    ? "Partial import"
                    : "Ready"}
          </p>
          {source.error && (
            <p className="notion-source-error">
              Last refresh failed: {source.error} This older copy is excluded
              from new answers until refreshed successfully.
            </p>
          )}
          {source.warnings.length > 0 && (
            <ul className="notion-source-warnings">
              {source.warnings.map((warning, index) => (
                <li key={`${index}-${warning}`}>{warning}</li>
              ))}
            </ul>
          )}
          <div className="notion-connection-actions">
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => inspect(source.id)}
            >
              Inspect passages
            </Button>
            <Button
              variant="ghost"
              disabled={disabled || !connected}
              onClick={() => refresh(source)}
            >
              Refresh page
            </Button>
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => remove(source.id)}
            >
              Remove page
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function NotionPassages({
  detail,
  close,
}: {
  detail: Awaited<ReturnType<Api["notionSourceDetail"]>>;
  close: () => void;
}) {
  return (
    <section className="notion-passages" aria-label="Imported passages">
      <div className="notion-source-heading">
        <h3>{detail.source.title}</h3>
        <Button variant="ghost" onClick={close}>
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
  );
}
