import { BannerToast, Button, Text } from "@jack.winter/pancake-ui";
import { useEffect, useRef, useState } from "react";
import type { Api } from "../../api/chat";
import { fixtureDate } from "./dates";
import { PickDetails } from "./PickDetails";
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
  const { fixtures, availability, loading, refreshing, error, load } =
    usePicks(api);
  const [selected, setSelected] = useState<string | null>(null);
  const [competition, setCompetition] = useState("All competitions");
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!selected && returnFocus.current) {
      cards.current.get(returnFocus.current)?.focus();
      returnFocus.current = null;
    }
  }, [selected]);
  const fixture = fixtures.find((item) => item.id === selected);
  const competitions = [
    "All competitions",
    ...new Set(fixtures.map((item) => item.competition)),
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
            onBack={() => {
              returnFocus.current = fixture.id;
              setSelected(null);
            }}
          />
        ) : (
          <>
            <div className="picks-intro">
              <p className="picks-eyebrow">Football, with context</p>
              <Text as="h2" variant="heading">
                {availability?.mode === "real"
                  ? "Upcoming predictions"
                  : "The weekend view"}
              </Text>
              <p>
                Explore the numbers behind each match, then ask Panky to walk
                you through them.
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
                <div className="picks-fixtures">
                  {fixtures
                    .filter(
                      (item) =>
                        competition === "All competitions" ||
                        item.competition === competition,
                    )
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="picks-fixture"
                        aria-label={`View ${item.homeTeam} vs ${item.awayTeam}`}
                        ref={(node) => {
                          if (node) cards.current.set(item.id, node);
                          else cards.current.delete(item.id);
                        }}
                        onClick={() => setSelected(item.id)}
                      >
                        <span className="picks-fixture-meta">
                          <span>{item.competition}</span>
                          <time
                            dateTime={
                              item.sample ? item.kickoff : item.matchDate
                            }
                          >
                            {fixtureDate(item)}
                          </time>
                        </span>
                        <strong>
                          {item.homeTeam}{" "}
                          <span className="picks-versus">vs</span>{" "}
                          {item.awayTeam}
                        </strong>
                        <span className="picks-fixture-probabilities">
                          <span>
                            Home {Math.round(item.probabilities.home * 100)}%
                          </span>
                          <span>
                            Draw {Math.round(item.probabilities.draw * 100)}%
                          </span>
                          <span>
                            Away {Math.round(item.probabilities.away * 100)}%
                          </span>
                        </span>
                        <span className="picks-fixture-link">
                          View match analysis <span aria-hidden="true">↗</span>
                        </span>
                      </button>
                    ))}
                </div>
                {fixtures.length === 0 && (
                  <p>
                    {availability?.mode === "real"
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
