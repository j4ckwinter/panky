import { BannerToast, Button, Text } from "@jack.winter/pancake-ui";
import { useEffect, useRef, useState } from "react";
import type { Api } from "../../api/chat";
import { PickCard } from "./PickCard";
import { PickDetails } from "./PickDetails";
import { PicksPerformance } from "./PicksPerformance";
import { PicksStatus } from "./PicksStatus";
import { usePicks } from "./usePicks";
import "./picks.css";

export function Picks({
  api,
  canRefresh = false,
}: {
  api: Api;
  canRefresh?: boolean;
}) {
  const {
    fixtures,
    availability,
    history,
    performance,
    loading,
    refreshing,
    error,
    load,
  } = usePicks(api);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"upcoming" | "history">("upcoming");
  const [competition, setCompetition] = useState("All competitions");
  const viewButton = useRef<HTMLButtonElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!selected && returnFocus.current) {
      (cards.current.get(returnFocus.current) ?? viewButton.current)?.focus();
      returnFocus.current = null;
    }
  }, [selected]);
  const historyEntry = history.find((entry) => entry.fixture.id === selected);
  const fixture =
    fixtures.find((item) => item.id === selected) ?? historyEntry?.fixture;
  const displayed =
    view === "history" ? history.map((entry) => entry.fixture) : fixtures;
  const competitions = [
    "All competitions",
    ...new Set(displayed.map((item) => item.competition)),
  ];
  return (
    <div className="picks-scroll">
      <div className="picks-panel">
        {availability && (
          <PicksStatus
            availability={availability}
            canRefresh={canRefresh}
            refreshing={refreshing}
            onRefresh={() => {
              void load(true);
            }}
          />
        )}
        {error && (
          <BannerToast tone="error" title="Could not load fixtures">
            {error}
          </BannerToast>
        )}
        {fixture ? (
          <PickDetails
            key={fixture.id}
            api={api}
            fixture={fixture}
            historyEntry={historyEntry}
            backLabel={view === "history" ? "Results history" : "All fixtures"}
            onBack={() => {
              returnFocus.current = fixture.id;
              setSelected(null);
            }}
          />
        ) : (
          <>
            {availability?.mode === "real" && (
              <div
                className="picks-filters"
                role="group"
                aria-label="Prediction views"
              >
                <Button
                  variant="ghost"
                  aria-pressed={view === "upcoming"}
                  ref={view === "upcoming" ? viewButton : undefined}
                  onClick={() => {
                    setView("upcoming");
                    setCompetition("All competitions");
                  }}
                >
                  Upcoming
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={view === "history"}
                  ref={view === "history" ? viewButton : undefined}
                  onClick={() => {
                    setView("history");
                    setCompetition("All competitions");
                  }}
                >
                  Results history
                </Button>
              </div>
            )}
            <div className="picks-intro">
              <p className="picks-eyebrow">Football, with context</p>
              <Text as="h2" variant="heading">
                {availability?.mode === "real"
                  ? view === "history"
                    ? "Recorded predictions"
                    : "Upcoming predictions"
                  : "The weekend view"}
              </Text>
              <p>
                {view === "history"
                  ? "Every saved prediction, including pending results and outcomes the model missed. The probabilities shown are the original forecast."
                  : "Explore the numbers behind each match, then ask Panky to walk you through them."}
              </p>
            </div>
            {loading && <p role="status">Loading fixtures…</p>}
            {error && (
              <Button
                variant="secondary"
                onClick={() => {
                  void load();
                }}
              >
                Try again
              </Button>
            )}
            {!loading && !error && (
              <>
                {view === "history" && (
                  <PicksPerformance performance={performance} />
                )}
                <div
                  className="picks-filters"
                  role="group"
                  aria-label="Filter by competition"
                >
                  {competitions.map((item) => (
                    <Button
                      key={item}
                      variant="ghost"
                      aria-pressed={competition === item}
                      onClick={() => setCompetition(item)}
                    >
                      {item}
                    </Button>
                  ))}
                </div>
                <div
                  className="picks-fixtures"
                  role="region"
                  aria-label={
                    view === "history"
                      ? "Recorded predictions"
                      : "Upcoming fixtures"
                  }
                >
                  {displayed
                    .filter(
                      (item) =>
                        competition === "All competitions" ||
                        item.competition === competition,
                    )
                    .map((item) => (
                      <PickCard
                        key={item.id}
                        fixture={item}
                        entry={
                          view === "history"
                            ? history.find(
                                (entry) => entry.fixture.id === item.id,
                              )
                            : undefined
                        }
                        buttonRef={(node) => {
                          if (node) cards.current.set(item.id, node);
                          else cards.current.delete(item.id);
                        }}
                        onSelect={() => setSelected(item.id)}
                      />
                    ))}
                </div>
                {displayed.length === 0 && (
                  <p>
                    {view === "history"
                      ? "No predictions recorded yet."
                      : availability?.mode === "real"
                        ? "No upcoming predictions available. Predictions appear when the source is current and has enough completed matches."
                        : "No fixtures available yet."}
                  </p>
                )}
              </>
            )}
          </>
        )}
        <p className="picks-footer">
          18+ · Football outcomes are uncertain. No selection is a guaranteed
          win.
        </p>
      </div>
    </div>
  );
}
