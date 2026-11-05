import { Text } from "@jack.winter/pancake-ui";
import type { RealPickFixture } from "@panky/shared";
import { formatMatchDate, formatTimestamp } from "./dates";

export function PredictionRecord({ fixture }: { fixture: RealPickFixture }) {
  const record = fixture.prediction;
  return (
    <section className="picks-section" aria-label="Prediction record">
      <Text as="h3" variant="heading">
        Prediction record
      </Text>
      <p className="muted">
        These probabilities are saved when the model runs. AI explanations do
        not change them.
      </p>
      <dl className="picks-record">
        <div>
          <dt>Recorded</dt>
          <dd>{formatTimestamp(record.recordedAt)}</dd>
        </div>
        <div>
          <dt>Training results through</dt>
          <dd>{formatMatchDate(record.trainingThrough, true)}</dd>
        </div>
        <div>
          <dt>Completed training matches</dt>
          <dd>{record.trainingMatches}</dd>
        </div>
        <div>
          <dt>Source downloaded</dt>
          <dd>{formatTimestamp(record.sourceRetrievedAt)}</dd>
        </div>
      </dl>
      <details className="picks-model-details">
        <summary>Model and source details</summary>
        <dl className="picks-record">
          <div>
            <dt>Model</dt>
            <dd>{record.modelVersion}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <a
                href={`https://github.com/openfootball/football.json/tree/${record.sourceRevision}`}
                target="_blank"
                rel="noreferrer"
              >
                OpenFootball · CC0
              </a>
            </dd>
          </div>
          <div>
            <dt>Home team home matches</dt>
            <dd>{record.homeMatches}</dd>
          </div>
          <div>
            <dt>Away team away matches</dt>
            <dd>{record.awayMatches}</dd>
          </div>
          <div>
            <dt>Model goal estimates</dt>
            <dd>
              {fixture.homeTeam} {record.expectedGoals.home.toFixed(2)} ·{" "}
              {fixture.awayTeam} {record.expectedGoals.away.toFixed(2)}
            </dd>
          </div>
        </dl>
        <p className="muted">
          Goal estimates come from past scores, not shot-based expected goals.
          Missing team history uses league averages.
        </p>
      </details>
    </section>
  );
}
