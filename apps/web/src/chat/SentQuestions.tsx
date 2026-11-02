import { Button } from "@jack.winter/pancake-ui";
import type { useSpokenQuestions } from "./useSpokenQuestions";

export function SentQuestions({
  questions,
  selectedQuestionId,
  onViewAnswer,
}: {
  questions: ReturnType<typeof useSpokenQuestions>;
  selectedQuestionId?: string;
  onViewAnswer: (questionId: string) => void;
}) {
  if (!questions.acceptedQuestions.length) return null;
  return (
    <div className="sent-questions">
      <details className="accepted-questions">
        <summary>
          <span>Sent questions ({questions.acceptedQuestions.length})</span>
          <svg
            className="history-chevron"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="m9 5 7 7-7 7" />
          </svg>
        </summary>
        <ol>
          {questions.acceptedQuestions.map((question, index) => (
            <li key={question.id}>
              <Button
                variant="ghost"
                aria-label={`View answer: ${question.text}`}
                aria-pressed={selectedQuestionId === question.userMessageId}
                onClick={() => onViewAnswer(question.userMessageId)}
              >
                <span className="sent-question-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="sent-question-text">{question.text}</span>
                <svg
                  className="sent-question-arrow"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </Button>
            </li>
          ))}
        </ol>
      </details>
      {questions.topicCount > 0 && (
        <Button
          variant="ghost"
          size={40}
          className="new-topic-button"
          disabled={questions.unavailable}
          onClick={questions.newTopic}
        >
          New topic
        </Button>
      )}
    </div>
  );
}
