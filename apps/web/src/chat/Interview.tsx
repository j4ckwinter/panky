import { Button, Text, Textarea } from "@jack.winter/pancake-ui";
import { useState } from "react";
import type { InterviewInput } from "@panky/shared";
import { Markdown } from "./Markdown";
import type { useChat } from "./useChat";
import type { Api } from "../api/chat";
import { ExperienceSources } from "./ExperienceSources";
import { SourceEvidence } from "./SourceEvidence";

export function Interview({
  chat,
  api,
}: {
  chat: ReturnType<typeof useChat>;
  api: Api;
}) {
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
  const detailHeading = /^## Supporting detail\s*$/m.exec(
    answer?.content ?? "",
  );
  const cues = detailHeading
    ? (answer?.content.slice(0, detailHeading.index) ?? "")
    : (answer?.content ?? "");
  const detail = detailHeading
    ? (answer?.content.slice(detailHeading.index + detailHeading[0].length) ??
      "")
    : "";
  const state = !chat.connected
    ? "Connection lost. Refresh history to reconnect."
    : chat.streaming
      ? "Preparing talking points…"
      : chat.serverBusy
        ? "Panky is busy with another response. Wait for it to finish."
        : run?.status === "cancelled"
          ? "Stopped. Partial talking points are saved."
          : run?.status === "interrupted"
            ? "Interrupted. Refresh history before sending again."
            : run?.status === "failed"
              ? "Could not finish. Review the error before submitting again."
              : run?.status === "completed"
                ? "Talking points ready."
                : "Ready for a question.";

  return (
    <div className="interview-scroll">
      <div className="interview-panel">
        <div className="interview-intro">
          <div>
            <Text as="h2" variant="heading">
              A few cues for your next answer
            </Text>
            <p className="muted">
              Experience, technical questions, or both. Follow up on recent
              questions and add notes about what you actually said.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={chat.pending}
            onClick={() => {
              chat.create();
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
                index === context.length - 1 ? { ...turn, spokenAnswer } : turn,
              );
              void chat.send(submitted, { experience, context: prior }, () => {
                setContext(
                  [...prior, { question: submitted, spokenAnswer: "" }].slice(
                    -4,
                  ),
                );
                setSpokenAnswer("");
                setDraft("");
              });
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
              answer. Older context may be omitted to fit the model. Suggestions
              are never treated as things you said. Context clears when you
              leave this view and is not restored from saved history.
            </p>
            {context.length > 0 ? (
              <>
                <details>
                  <summary>Recent questions ({context.length})</summary>
                  <ol>
                    {context.map((turn, index) => (
                      <li key={`${index}-${turn.question}`}>
                        <p>{turn.question}</p>
                        {index < context.length - 1 && turn.spokenAnswer && (
                          <p className="muted">You said: {turn.spokenAnswer}</p>
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
            {run?.status === "running" ? (
              <Button
                disabled={chat.cancelling}
                onClick={() => {
                  void chat.cancel(run.id);
                }}
              >
                Stop response
              </Button>
            ) : (
              <Button type="submit" disabled={unavailable || !draft.trim()}>
                Get talking points
              </Button>
            )}
            {question && (
              <Button
                variant="ghost"
                disabled={chat.pending}
                onClick={() => setDraft(question.content)}
              >
                Edit last question
              </Button>
            )}
            <span role="status">{state}</span>
          </div>
        </form>
        {question ? (
          <section className="interview-result" aria-label="Interview answer">
            <div className="interview-question">
              <Text as="h2" variant="heading">
                Current question
              </Text>
              <p>{question.content}</p>
            </div>
            <div className="interview-cues">
              <Markdown>{cues || "Waiting for talking points…"}</Markdown>
            </div>
            <SourceEvidence sources={answer?.sources ?? []} />
            {detail.trim() && (
              <details className="interview-detail" key={answer?.id}>
                <summary>Supporting detail</summary>
                <Markdown>{detail}</Markdown>
              </details>
            )}
          </section>
        ) : (
          <div className="interview-empty">
            <Text as="h2" variant="heading">
              Keep the conversation in view
            </Text>
            <p>
              Ask a question to see concise talking points here. Supporting
              detail stays tucked away until you need it.
            </p>
          </div>
        )}
        <p className="interview-note">
          Questions and replies are saved in your chat history. Audio is not
          captured. No live research is available; technical knowledge may be
          incomplete or outdated. Check personal facts and technical suggestions
          before using them.
        </p>
      </div>
    </div>
  );
}
