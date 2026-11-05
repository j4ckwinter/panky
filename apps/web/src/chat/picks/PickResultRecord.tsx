import { Text } from "@jack.winter/pancake-ui";
import { mostLikelyPickOutcome, type PickHistoryEntry } from "@panky/shared";
import { formatMatchDate, formatTimestamp } from "./dates";

export function resultDescription(entry: PickHistoryEntry) {
  if (entry.status === "excluded") return "Excluded from performance";
  if (entry.status === "upcoming") return "Upcoming match";
  if (entry.status === "awaiting") return "Awaiting result";
  const predicted = mostLikelyPickOutcome(entry.fixture.probabilities);
  return predicted === entry.result?.outcome
    ? "Most likely outcome matched"
    : "Most likely outcome did not match";
}

export function PickResultRecord({ entry }: { entry: PickHistoryEntry }) {
  return (
    <section className="picks-section" aria-label="Recorded result">
      <Text as="h3" variant="heading">
        Recorded result
      </Text>
      {entry.result && (
        <p>
          {entry.fixture.homeTeam} {entry.result.homeGoals} –{" "}
          {entry.result.awayGoals} {entry.fixture.awayTeam}
        </p>
      )}
      <p>{resultDescription(entry)}</p>
      {entry.exclusionReason && (
        <p className="muted">{entry.exclusionReason}</p>
      )}
      <p className="muted">
        Original probabilities stay unchanged when results are recorded or
        corrected.
      </p>
      {entry.revisions.length > 0 && (
        <details className="picks-model-details">
          <summary>Result revisions</summary>
          {entry.revisions.map((result, index) => (
            <dl className="picks-record" key={`${result.recordedAt}-${index}`}>
              <div>
                <dt>Score</dt>
                <dd>
                  {result.homeGoals} – {result.awayGoals}
                </dd>
              </div>
              <div>
                <dt>Match date</dt>
                <dd>{formatMatchDate(result.matchDate, true)}</dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>{formatTimestamp(result.recordedAt)}</dd>
              </div>
              <div>
                <dt>Source downloaded</dt>
                <dd>{formatTimestamp(result.sourceRetrievedAt)}</dd>
              </div>
              <div>
                <dt>Source revision</dt>
                <dd>
                  <a
                    href={`https://github.com/openfootball/football.json/tree/${result.sourceRevision}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {result.sourceRevision}
                  </a>
                </dd>
              </div>
            </dl>
          ))}
        </details>
      )}
    </section>
  );
}
