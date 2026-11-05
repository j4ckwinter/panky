import { Button } from "@jack.winter/pancake-ui";
import type { PicksAvailability } from "@panky/shared";
import { formatMatchDate, formatTimestamp } from "./dates";

export function PicksStatus({
  availability,
  canRefresh,
  refreshing,
  onRefresh,
}: {
  availability: PicksAvailability;
  canRefresh: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  if (availability.mode === "sample")
    return (
      <p className="picks-sample-notice">
        <strong>Preview · sample data</strong> Explore how Picks works.
        Fixtures, statistics and probabilities are illustrative, not evaluated
        predictions.
      </p>
    );
  return (
    <section
      className="picks-sample-notice picks-data-status"
      aria-label="Prediction data status"
    >
      <div className="picks-section-heading">
        <strong>
          {availability.state === "ready"
            ? "Experimental predictions"
            : "New predictions on hold"}
        </strong>
        {canRefresh && (
          <Button variant="secondary" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? "Refreshing predictions…" : "Refresh predictions"}
          </Button>
        )}
      </div>
      <p role="status">{availability.message}</p>
      <p className="muted">
        {availability.sourceRetrievedAt
          ? `Source downloaded ${formatTimestamp(availability.sourceRetrievedAt)}.`
          : "Source download time unavailable."}{" "}
        {availability.lastResultDate &&
          `Latest recorded result: ${formatMatchDate(availability.lastResultDate, true)}.`}
      </p>
      {availability.state !== "ready" && (
        <p>
          Any predictions shown below retain the evidence recorded when they
          were created.
        </p>
      )}
    </section>
  );
}
