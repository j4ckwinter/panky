import { Button, Textarea } from "@jack.winter/pancake-ui";
import type { useSpokenQuestions } from "./useSpokenQuestions";

export function SpokenQuestions({
  questions,
  providerLabel,
}: {
  questions: ReturnType<typeof useSpokenQuestions>;
  providerLabel: string;
}) {
  if (
    !questions.cards.length &&
    !questions.acceptedQuestions.length &&
    !questions.notice
  )
    return null;
  return (
    <section className="spoken-questions" aria-label="Detected questions">
      <h2>Questions</h2>
      <p className="interview-note">
        {providerLabel}
        {providerLabel === "Demo mode"
          ? " · Scripted examples; no AI reasoning."
          : " · General knowledge; your experience is not included."}{" "}
        Review the transcript before sending.
      </p>
      {questions.notice && <p role="status">{questions.notice}</p>}
      <section
        className="spoken-question-list"
        aria-label="Question queue"
        tabIndex={0}
      >
        {questions.cards.map((card) => (
          <article
            className="spoken-question"
            aria-label="Detected question"
            key={card.id}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void questions.submit(card.id);
              }}
            >
              <Textarea
                label="Question to ask"
                rows={3}
                maxLength={8000}
                value={card.text}
                disabled={card.status !== "draft"}
                onChange={(event) =>
                  questions.edit(card.id, event.currentTarget.value)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey)
                  ) {
                    event.preventDefault();
                    void questions.submit(card.id);
                  }
                }}
              />
              <div className="interview-actions">
                {card.status === "draft" && (
                  <Button
                    type="submit"
                    disabled={questions.unavailable || !card.text.trim()}
                  >
                    Use this question
                  </Button>
                )}
                {card.status === "pending" && (
                  <span role="status">Sending question…</span>
                )}
                {card.status === "failed" && (
                  <>
                    <span role="status">
                      Submission not confirmed. Check chat history before trying
                      again.
                    </span>
                    <Button
                      variant="secondary"
                      disabled={questions.unavailable}
                      onClick={() => questions.review(card.id)}
                    >
                      Review again
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  disabled={card.status === "pending"}
                  onClick={() => questions.dismiss(card.id)}
                >
                  Dismiss question
                </Button>
              </div>
            </form>
          </article>
        ))}
      </section>
      {questions.cards.length === 0 && (
        <p className="interview-note">No questions waiting for review.</p>
      )}
      {questions.acceptedQuestions.length > 0 && (
        <details className="accepted-questions">
          <summary>
            Sent questions ({questions.acceptedQuestions.length})
          </summary>
          <p className="interview-note">
            Last 20 accepted requests. Replies are saved in chat history.
          </p>
          <ol>
            {questions.acceptedQuestions.map((question) => (
              <li key={question.id}>{question.text}</li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
