import { Button } from "@jack.winter/pancake-ui";
import { useEffect, useState } from "react";
import { type Api, errorMessage } from "../api/chat";

export function InterviewSources({
  api,
  enabled,
  disabled,
  onChange,
  onManage,
}: {
  api: Api;
  enabled: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
  onManage: () => void;
}) {
  const [status, setStatus] = useState<Awaited<
    ReturnType<Api["experienceStatus"]>
  > | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setStatus(null);
    setError("");
    void api
      .experienceStatus()
      .then((result) => {
        if (alive) setStatus(result);
      })
      .catch((cause: unknown) => {
        if (alive) setError(errorMessage(cause));
      });
    return () => {
      alive = false;
    };
  }, [api, attempt]);
  return (
    <section className="interview-sources" aria-label="Interview sources">
      <div className="interview-source-controls">
        <label className="interview-source-toggle">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.checked)}
          />
          <span>Use my sources</span>
        </label>
        <Button variant="ghost" disabled={disabled} onClick={onManage}>
          Manage sources
        </Button>
      </div>
      {status ? (
        <p role="status">
          {status.usableCount} usable{" "}
          {status.usableCount === 1 ? "page" : "pages"}
          {status.totalCount > status.usableCount
            ? ` · ${status.totalCount - status.usableCount} unavailable or empty`
            : ""}
        </p>
      ) : error ? (
        <div>
          <p role="alert">Could not load source status: {error}</p>
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry source status
          </Button>
        </div>
      ) : (
        <p role="status">Loading source status…</p>
      )}
      <p className="interview-note">
        {enabled
          ? "Relevant passages from your usable imported pages can support typed answers."
          : "Imported pages will not be sent with this typed question."}{" "}
        Your pasted experience sample is separate and is still included.
        {status?.usableCount === 0
          ? " Manage sources to connect Notion, import pages or refresh unavailable copies."
          : ""}
      </p>
    </section>
  );
}
