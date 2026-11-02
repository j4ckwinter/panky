import type { Evidence } from "@panky/shared";

export function SourceEvidence({ sources }: { sources: Evidence[] }) {
  if (sources.length === 0) return null;
  return (
    <details className="source-evidence">
      <summary>Retrieved evidence ({sources.length})</summary>
      <p className="muted">
        Passages supplied with this question. These are saved snapshots,
        separate from generated suggestions.
      </p>
      {sources.map((source, index) => (
        <div
          className="source-passage"
          key={`${source.sourceId}-${source.blockId}-${index}`}
        >
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            [S{index + 1}] {source.title}
          </a>
          <p className="source-import-time">
            Imported {new Date(source.importedAt).toLocaleString()}
          </p>
          <blockquote>{source.excerpt}</blockquote>
        </div>
      ))}
    </details>
  );
}
