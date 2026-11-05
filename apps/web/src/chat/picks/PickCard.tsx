import type { PickFixture, PickHistoryEntry } from "@panky/shared";
import type { Ref } from "react";
import { fixtureDate, formatTimestamp } from "./dates";
import { resultDescription } from "./PickResultRecord";

export function PickCard({
  fixture,
  entry,
  buttonRef,
  onSelect,
}: {
  fixture: PickFixture;
  entry?: PickHistoryEntry;
  buttonRef: Ref<HTMLButtonElement>;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="picks-fixture"
      aria-label={`${entry ? "View result:" : "View"} ${fixture.homeTeam} vs ${fixture.awayTeam}`}
      ref={buttonRef}
      onClick={onSelect}
    >
      <span className="picks-fixture-meta">
        <span>{fixture.competition}</span>
        <time dateTime={fixture.sample ? fixture.kickoff : fixture.matchDate}>
          {fixtureDate(fixture)}
        </time>
      </span>
      <strong>
        {fixture.homeTeam} <span className="picks-versus">vs</span>{" "}
        {fixture.awayTeam}
      </strong>
      <span className="picks-fixture-probabilities">
        <span>Home {Math.round(fixture.probabilities.home * 100)}%</span>
        <span>Draw {Math.round(fixture.probabilities.draw * 100)}%</span>
        <span>Away {Math.round(fixture.probabilities.away * 100)}%</span>
      </span>
      {entry && (
        <>
          {entry.result && (
            <span>
              Score: {entry.result.homeGoals} – {entry.result.awayGoals}
            </span>
          )}
          <span>{resultDescription(entry)}</span>
          <span className="picks-fixture-meta">
            Prediction recorded{" "}
            {formatTimestamp(entry.fixture.prediction.recordedAt)}
          </span>
        </>
      )}
      <span className="picks-fixture-link">
        {entry ? "View recorded prediction" : "View match analysis"}{" "}
        <span aria-hidden="true">↗</span>
      </span>
    </button>
  );
}
