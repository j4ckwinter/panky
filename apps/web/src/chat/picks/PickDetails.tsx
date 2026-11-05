import { BannerToast, Button, Text, Textarea } from "@jack.winter/pancake-ui";
import type { PickFixture, PickHistoryEntry } from "@panky/shared";
import { useEffect, useRef } from "react";
import type { Api } from "../../api/chat";
import { Markdown } from "../messages/Markdown";
import { fixtureDate } from "./dates";
import { PickResultRecord } from "./PickResultRecord";
import { PredictionRecord } from "./PredictionRecord";
import { usePickAnalysis } from "./usePickAnalysis";

export function PickDetails({
  api,
  fixture,
  onBack,
  historyEntry,
  backLabel = "All fixtures",
}: {
  api: Api;
  fixture: PickFixture;
  onBack: () => void;
  historyEntry?: PickHistoryEntry;
  backLabel?: string;
}) {
  const back = useRef<HTMLButtonElement>(null);
  const analysis = usePickAnalysis(api, fixture.id);
  const responseRunning = analysis.messages.some(
    (message) => message.status === "running",
  );
  useEffect(() => {
    back.current?.focus();
  }, []);
  const outcomes = [
    { key: "home", label: fixture.homeTeam },
    { key: "draw", label: "Draw" },
    { key: "away", label: fixture.awayTeam },
  ] as const;
  return (
    <>
      <Button
        ref={back}
        variant="ghost"
        className="picks-back"
        onClick={onBack}
      >
        {backLabel}
      </Button>
      <div className="picks-intro">
        <p className="picks-eyebrow">{fixture.competition}</p>
        <Text as="h2" variant="heading">
          {fixture.homeTeam} vs {fixture.awayTeam}
        </Text>
        <p>
          {fixtureDate(fixture, true)}
          {!fixture.sample && " · Kickoff time unavailable"}
        </p>
      </div>
      <section className="picks-section" aria-label="Match probabilities">
        <Text as="h3" variant="heading">
          Match result
        </Text>
        <p className="muted">
          {fixture.sample
            ? "Illustrative probabilities. These predictions have not been evaluated against real results."
            : "Experimental statistical probabilities based on recorded results. Outcomes remain uncertain; these are not guarantees."}
        </p>
        <table className="picks-probabilities">
          <thead>
            <tr>
              <th scope="col">Outcome</th>
              <th scope="col">Probability</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map(({ key, label }) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td>{Math.round(fixture.probabilities[key] * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {historyEntry && <PickResultRecord entry={historyEntry} />}
      {!fixture.sample && <PredictionRecord fixture={fixture} />}
      <div className="picks-evidence-grid">
        <section className="picks-section">
          <Text as="h3" variant="heading">
            Supporting evidence
          </Text>
          <ul>
            {fixture.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="picks-section">
          <Text as="h3" variant="heading">
            What to keep in mind
          </Text>
          <ul>
            {fixture.caveats.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
      <section
        className="picks-section picks-analysis"
        aria-label="Match analysis"
        aria-busy={analysis.pending || analysis.loading}
      >
        <div className="picks-section-heading">
          <Text as="h3" variant="heading">
            Explore this match
          </Text>
          <Button
            variant="ghost"
            disabled={analysis.pending || analysis.loading}
            onClick={analysis.reload}
          >
            Refresh analysis
          </Button>
        </div>
        <p className="muted">
          Ask Panky to explain the supplied match evidence. AI explanations can
          be mistaken; the figures above remain the source of truth.
        </p>
        {analysis.loading && <p role="status">Loading analysis…</p>}
        {analysis.error && (
          <BannerToast tone="error" title="Analysis unavailable">
            {analysis.error}
          </BannerToast>
        )}
        <div className="picks-analysis-messages" aria-live="polite">
          {analysis.messages.map((message) => (
            <article
              key={message.id}
              className={`picks-analysis-message picks-analysis-${message.role}`}
            >
              <strong>{message.role === "user" ? "You" : "Panky"}</strong>
              <Markdown>
                {message.content ||
                  (message.status === "running"
                    ? "Waiting for the explanation…"
                    : "No explanation was saved.")}
              </Markdown>
              {message.status === "running" ? (
                <p className="muted" role="status">
                  Response in progress. Refresh analysis to see the latest saved
                  response.
                </p>
              ) : (
                message.status !== "completed" && (
                  <p className="muted">
                    {message.status === "interrupted"
                      ? "Response interrupted"
                      : "Response failed"}
                    . This request will not be retried automatically.
                  </p>
                )
              )}
            </article>
          ))}
        </div>
        {analysis.messages.length === 0 && !analysis.loading && (
          <Button
            className="visible-action"
            disabled={analysis.pending || Boolean(analysis.error)}
            onClick={() => {
              void analysis.ask(
                "Explain this prediction and its limitations using the supplied match evidence.",
              );
            }}
          >
            Explain this prediction
          </Button>
        )}
        <form
          className="picks-question"
          onSubmit={(event) => {
            event.preventDefault();
            void analysis.ask(analysis.draft);
          }}
        >
          <Textarea
            label="Ask about this match"
            placeholder="What could change this prediction?"
            rows={2}
            maxLength={2000}
            value={analysis.draft}
            disabled={analysis.pending || analysis.loading}
            onChange={(event) => analysis.setDraft(event.currentTarget.value)}
          />
          <div className="picks-question-actions">
            {analysis.pending ? (
              <>
                <span role="status">Panky is analysing this match…</span>
                <Button variant="secondary" onClick={analysis.cancel}>
                  Cancel analysis
                </Button>
              </>
            ) : (
              <Button
                type="submit"
                disabled={
                  analysis.loading || responseRunning || !analysis.draft.trim()
                }
              >
                Ask Panky
              </Button>
            )}
          </div>
        </form>
      </section>
    </>
  );
}
