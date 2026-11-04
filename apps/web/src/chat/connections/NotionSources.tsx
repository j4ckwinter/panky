import { BannerToast, Button } from "@jack.winter/pancake-ui";
import type { NotionConnection } from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import type { Api } from "../../api/chat";
import { NotionPagePicker } from "./NotionPagePicker";
import { NotionPassages, NotionSourceList } from "./NotionSourceList";
import { useNotionSources } from "./useNotionSources";

export function NotionSources({
  api,
  connected,
  revision,
  disabled,
  onBusy,
  onConnectionChange,
  onSourcesChanged,
}: {
  api: Api;
  connected: boolean;
  revision: number;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onConnectionChange: (connection: NotionConnection) => void;
  onSourcesChanged: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const [searching, setSearching] = useState(false);
  const model = useNotionSources(
    api,
    connected,
    revision,
    disabled,
    onConnectionChange,
    onSourcesChanged,
  );
  const pickerButton = useRef<HTMLButtonElement>(null);
  const wasPicking = useRef(false);
  const busy = model.busy || searching;
  const unavailable = disabled || model.loading || busy;
  useEffect(() => {
    if (picker) wasPicking.current = true;
    else if (wasPicking.current && !unavailable) {
      pickerButton.current?.focus();
      wasPicking.current = false;
    }
  }, [picker, unavailable]);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);

  return (
    <section className="notion-sources" aria-label="Your Notion pages">
      <div className="notion-source-heading">
        <h3>Imported pages</h3>
        <p>
          {
            model.sources.filter(
              (source) => !source.error && source.passageCount > 0 && connected,
            ).length
          }{" "}
          usable · {model.sources.length} total
        </p>
      </div>
      {model.loading && <p role="status">Loading imported pages…</p>}
      {!model.loading && model.sources.length === 0 && (
        <p>No pages have been imported through this connection.</p>
      )}
      {model.error && (
        <BannerToast tone="error" title="Could not update pages">
          {model.error}
        </BannerToast>
      )}
      <div className="notion-connection-actions">
        {connected && (
          <Button
            size={40}
            ref={pickerButton}
            disabled={unavailable}
            onClick={() => setPicker(true)}
          >
            {model.sources.length ? "Add pages" : "Choose pages"}
          </Button>
        )}
        <Button
          size={40}
          variant="secondary"
          disabled={unavailable || !connected || model.sources.length === 0}
          onClick={() => {
            void model.refresh(model.sources);
          }}
        >
          Refresh all
        </Button>
        <Button
          size={40}
          variant="ghost"
          disabled={unavailable}
          onClick={() => {
            void model.reload();
          }}
        >
          Reload sources
        </Button>
      </div>
      {picker && connected && (
        <NotionPagePicker
          api={api}
          disabled={disabled || model.busy}
          onImport={model.importPages}
          onBusy={setSearching}
          onConnectionChange={onConnectionChange}
          close={() => setPicker(false)}
        />
      )}
      {model.progress && <p role="status">{model.progress}</p>}
      {model.results.length > 0 && (
        <ul
          className="notion-page-results"
          aria-label="Page operation results"
          aria-live="polite"
        >
          {model.results.map((result, index) => (
            <li key={`${index}-${result.title}`}>
              <strong>
                {result.title}: {result.outcome}
              </strong>
              {result.error && <p>{result.error}</p>}
            </li>
          ))}
        </ul>
      )}
      <NotionSourceList
        sources={model.sources}
        disabled={unavailable}
        connected={connected}
        inspect={(id) => {
          void model.inspect(id);
        }}
        refresh={(source) => {
          void model.refresh([source]);
        }}
        remove={(id) => {
          void model.remove(id);
        }}
      />
      {model.detail && (
        <NotionPassages detail={model.detail} close={model.clearDetail} />
      )}
      <p className="connections-privacy">
        Refresh manually to update copies. Removing pages keeps saved answers
        and evidence. Access changes are detected when you check the connection
        or request pages.
      </p>
    </section>
  );
}
