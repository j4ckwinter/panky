import { Text } from "@jack.winter/pancake-ui";
import type { PicksHistory } from "@panky/shared";

export function PicksPerformance({
  performance,
}: {
  performance: PicksHistory["performance"];
}) {
  return (
    <section className="picks-section" aria-label="Prediction performance">
      <Text as="h3" variant="heading">
        Performance since recording began
      </Text>
      <p className="muted">
        Only eligible predictions saved before the match count here. This is
        separate from the historical backtest. Small samples are unreliable.
      </p>
      {performance.length === 0 && <p>No predictions recorded yet.</p>}
      {performance.map((model) => (
        <article className="picks-performance" key={model.modelVersion}>
          <dl className="picks-record">
            <div>
              <dt>Recorded predictions</dt>
              <dd>{model.recorded}</dd>
            </div>
            <div>
              <dt>Scored</dt>
              <dd>{model.scored}</dd>
            </div>
            <div>
              <dt>Pending results</dt>
              <dd>{model.pending}</dd>
            </div>
            <div>
              <dt>Excluded</dt>
              <dd>{model.excluded}</dd>
            </div>
            <div>
              <dt>Most likely outcome matched</dt>
              <dd>
                {model.correct} of {model.scored}
              </dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>
                {model.accuracy === null
                  ? "Awaiting results"
                  : `${(model.accuracy * 100).toFixed(1)}%`}
              </dd>
            </div>
            <div>
              <dt>Brier score</dt>
              <dd>
                {model.brier === null
                  ? "Awaiting results"
                  : model.brier.toFixed(3)}
              </dd>
            </div>
            <div>
              <dt>Log loss</dt>
              <dd>
                {model.logLoss === null
                  ? "Awaiting results"
                  : model.logLoss.toFixed(3)}
              </dd>
            </div>
          </dl>
          <details className="picks-model-details">
            <summary>Model version</summary>
            <p>{model.modelVersion}</p>
          </details>
        </article>
      ))}
      <p className="muted">
        Accuracy counts matches where the most likely outcome happened. Brier
        score and log loss measure all three probabilities; lower is better. Log
        loss penalises confident mistakes more strongly.
      </p>
    </section>
  );
}
