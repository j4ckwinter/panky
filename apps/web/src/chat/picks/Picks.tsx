import { BannerToast, Button, Text } from "@jack.winter/pancake-ui";
import type { PickFixture } from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import { type Api, errorMessage } from "../../api/chat";
import { PickDetails } from "./PickDetails";
import "./picks.css";

export function Picks({ api }: { api: Api }) {
  const [fixtures, setFixtures] = useState<PickFixture[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [competition, setCompetition] = useState("All competitions");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api
      .picks(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setFixtures(result.fixtures);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, refresh]);
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
        <p className="picks-sample-notice">
          <strong>Preview · sample data</strong> Explore how Picks works.
          Fixtures, statistics and probabilities are illustrative, not evaluated
          predictions.
        </p>
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
                The weekend view
              </Text>
              <p>
                Explore the numbers behind each match, then ask Panky to walk
                you through them.
              </p>
            </div>
            {loading && <p role="status">Loading fixtures…</p>}
            {error && (
              <>
                <BannerToast tone="error" title="Could not load fixtures">
                  {error}
                </BannerToast>
                <Button
                  variant="secondary"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  Try again
                </Button>
              </>
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
                          <time dateTime={item.kickoff}>
                            {new Date(item.kickoff).toLocaleString("en-GB", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
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
                {fixtures.length === 0 && <p>No fixtures available yet.</p>}
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
