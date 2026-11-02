import { Button, Text, Textarea } from "@jack.winter/pancake-ui";
import type { InterviewInput } from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import type { Api } from "../api/chat";
import { ExperienceSources } from "./ExperienceSources";
import { LiveTranscript } from "./LiveTranscript";
import { Markdown } from "./Markdown";
import { ResponseTiming } from "./ResponseTiming";
import { SourceEvidence } from "./SourceEvidence";
import { SpokenQuestions } from "./SpokenQuestions";
import type { useChat } from "./useChat";
import { useSpokenQuestions } from "./useSpokenQuestions";

export function Interview({
  chat,
  api,
}: {
  chat: ReturnType<typeof useChat>;
  api: Api;
}) {
  const questions = useSpokenQuestions(chat);
  const [session, setSession] = useState(0);
  const [draft, setDraft] = useState("");
  const [experience, setExperience] = useState("");
  const [context, setContext] = useState<
    NonNullable<InterviewInput["context"]>
  >([]);
  const [spokenAnswer, setSpokenAnswer] = useState("");
  const question = chat.messages.findLast((item) => item.role === "user");
  const answer = chat.messages.findLast((item) => item.role === "assistant");
  const run = chat.runs.at(-1);
  const unavailable = chat.pending || chat.serverBusy || !chat.connected;
  const answerPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (question?.id && answerPanel.current) {
      answerPanel.current.scrollTop = 0;
      answerPanel.current.scrollIntoView({ block: "nearest" });
    }
  }, [question?.id]);
  const state = !chat.connected
    ? "Connection lost. Refresh history to reconnect."
    : chat.streaming
      ? answer?.content
        ? "Responding…"
        : "Waiting for response…"
      : chat.serverBusy
        ? "Panky is busy with another response. Wait for it to finish."
        : run?.status === "cancelled"
          ? "Stopped. Partial response is saved."
          : run?.status === "interrupted"
            ? "Interrupted. Refresh history before sending again."
            : run?.status === "failed"
              ? "Could not finish. Review the error before submitting again."
              : run?.status === "completed"
                ? "Response ready."
                : "Ready for a question.";

  return (
    <div className="interview-scroll">
      <div className="interview-panel">
        <LiveTranscript
          key={session}
          onTranscript={questions.onTranscript}
          onResetDetection={questions.resetDetection}
          onUseAsQuestion={questions.propose}
        >
          {(question || questions.cards.length > 0) && (
            <div
              className={`interview-workspace${question ? " has-answer" : ""}`}
            >
              <SpokenQuestions
                questions={questions}
                providerLabel={chat.providerLabel}
              />
              <div className="interview-answer-column">
                {(question || questions.cards.length > 0) && (
                  <div className="interview-actions">
                    <span role="status">{state}</span>
                    {run?.status === "running" && (
                      <Button
                        disabled={chat.cancelling}
                        onClick={() => void chat.cancel(run.id)}
                      >
                        Stop response
                      </Button>
                    )}
                  </div>
                )}
                {question ? (
                  <section
                    ref={answerPanel}
                    tabIndex={0}
                    className="interview-result"
                    aria-label="Interview answer"
                  >
                    <div className="interview-question">
                      <Text as="h2" variant="heading">
                        Current question
                      </Text>
                      <p>{question.content}</p>
                      <p className="interview-note">{chat.providerLabel}</p>
                    </div>
                    <div className="interview-response">
                      <Markdown>
                        {answer?.content || "Waiting for response…"}
                      </Markdown>
                    </div>
                    <SourceEvidence sources={answer?.sources ?? []} />
                  </section>
                ) : null}
                <ResponseTiming timing={questions.timing} />
              </div>
            </div>
          )}
        </LiveTranscript>
        <details className="interview-tools">
          <summary>Ask a question</summary>
          <div className="interview-tools-content">
            <div className="interview-actions">
              <Button
                variant="ghost"
                disabled={chat.pending}
                onClick={() => {
                  chat.create();
                  questions.reset();
                  setSession((value) => value + 1);
                  setDraft("");
                  setExperience("");
                  setContext([]);
                  setSpokenAnswer("");
                }}
              >
                New interview
              </Button>
            </div>
            <p className="interview-mode">
              {chat.providerLabel}
              {chat.providerLabel === "Demo mode"
                ? " · Scripted synthetic examples, not your experience. No AI reasoning. Retrieved evidence is shown separately."
                : " · Uses relevant imported passages and the experience you paste below. Check the evidence behind personal claims."}
            </p>
            <ExperienceSources api={api} disabled={chat.pending} />
            <form
              className="interview-form"
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                if (!unavailable && draft.trim()) {
                  const submitted = draft.trim();
                  const prior = context.map((turn, index) =>
                    index === context.length - 1
                      ? { ...turn, spokenAnswer }
                      : turn,
                  );
                  void questions.sendTyped(
                    submitted,
                    { experience, context: prior },
                    () => {
                      setContext(
                        [
                          ...prior,
                          { question: submitted, spokenAnswer: "" },
                        ].slice(-4),
                      );
                      setSpokenAnswer("");
                      setDraft("");
                    },
                  );
                }
              }}
            >
              <details className="interview-experience">
                <summary>Experience sample (optional)</summary>
                <Textarea
                  label="Your experience sample"
                  value={experience}
                  rows={5}
                  maxLength={4000}
                  disabled={chat.pending}
                  onChange={(event) => setExperience(event.currentTarget.value)}
                  helperText="Paste a short project example, your contribution, and its outcome. Up to 4,000 characters. The sample stays in this view until you leave; answers may quote it and are saved in chat history."
                />
              </details>
              <div className="interview-context">
                <div className="interview-actions">
                  <Text as="h2" variant="heading">
                    Conversation context
                  </Text>
                  <Button
                    variant="ghost"
                    disabled={chat.pending || context.length === 0}
                    onClick={() => {
                      setContext([]);
                      setSpokenAnswer("");
                    }}
                  >
                    Start new topic
                  </Button>
                </div>
                <p className="interview-note">
                  Up to four recent questions and your notes can inform the next
                  answer. Older context may be omitted to fit the model.
                  Suggestions are never treated as things you said. Context
                  clears when you leave this view and is not restored from saved
                  history.
                </p>
                {context.length > 0 ? (
                  <>
                    <details>
                      <summary>Recent questions ({context.length})</summary>
                      <ol>
                        {context.map((turn, index) => (
                          <li key={`${index}-${turn.question}`}>
                            <p>{turn.question}</p>
                            {index < context.length - 1 &&
                              turn.spokenAnswer && (
                                <p className="muted">
                                  You said: {turn.spokenAnswer}
                                </p>
                              )}
                          </li>
                        ))}
                      </ol>
                    </details>
                    <Textarea
                      label="What I actually said"
                      value={spokenAnswer}
                      rows={3}
                      maxLength={2000}
                      disabled={chat.pending}
                      onChange={(event) =>
                        setSpokenAnswer(event.currentTarget.value)
                      }
                      helperText={`Optional summary of your answer to: ${context.at(-1)?.question}. Used for the next question; generated replies may quote it and are saved.`}
                    />
                  </>
                ) : (
                  <p className="interview-note">
                    No previous questions in context.
                  </p>
                )}
              </div>
              <Textarea
                label="Interview question"
                value={draft}
                rows={3}
                maxLength={8000}
                disabled={chat.pending}
                onChange={(event) => setDraft(event.currentTarget.value)}
                placeholder="Tell me about a technical decision you influenced…"
              />
              <div className="interview-actions">
                <Button type="submit" disabled={unavailable || !draft.trim()}>
                  Get response
                </Button>
                {question && (
                  <Button
                    variant="ghost"
                    disabled={chat.pending}
                    onClick={() => setDraft(question.content)}
                  >
                    Edit last question
                  </Button>
                )}
              </div>
            </form>
            <p className="interview-note">
              Questions and replies are saved in your chat history. Audio
              capture starts only through the browser audio controls above. No
              live research is available; technical knowledge may be incomplete
              or outdated. Check personal facts and technical suggestions before
              using them.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
