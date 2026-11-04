import { MESSAGE_MAX_CHARS } from "@panky/shared";
import { Button, Textarea } from "@jack.winter/pancake-ui";
import type { useSpokenQuestions } from "./useSpokenQuestions";

export function SpokenQuestions({
  questions,
}: {
  questions: ReturnType<typeof useSpokenQuestions>;
}) {
  return (
    <section className="spoken-questions" aria-label="Detected questions">
      {questions.notice && <p role="status">{questions.notice}</p>}
      <section
        className="spoken-question-list"
        aria-label="Question queue"
        tabIndex={questions.cards.length ? 0 : undefined}
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
                rows={2}
                maxLength={MESSAGE_MAX_CHARS}
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
                    size={40}
                    className="question-send"
                    disabled={questions.unavailable || !card.text.trim()}
                  >
                    Send question
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 19V5m-6 6 6-6 6 6" />
                    </svg>
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
                  aria-label="Dismiss question"
                  className="question-dismiss"
                  size={40}
                  disabled={card.status === "pending"}
                  onClick={() => questions.dismiss(card.id)}
                >
                  Dismiss
                </Button>
              </div>
            </form>
          </article>
        ))}
      </section>
    </section>
  );
}
