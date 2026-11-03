import { Button, Text, Textarea } from "@jack.winter/pancake-ui";
import { INTERVIEW_LIMITS, MESSAGE_MAX_CHARS } from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InterviewOptions } from "./InterviewOptions";
import type { Api } from "../api/chat";
import { InterviewSources } from "./InterviewSources";
import type { useInterviewDraft } from "./useInterviewDraft";
import { LiveTranscript } from "./LiveTranscript";
import { InterviewAnswer } from "./InterviewAnswer";
import { ResponseTiming } from "./ResponseTiming";
import { SentQuestions } from "./SentQuestions";
import { SpokenQuestions } from "./SpokenQuestions";
import type { useChat } from "./useChat";
import { useSpokenQuestions } from "./useSpokenQuestions";

export function Interview({
  chat,
  api,
  toolsTarget,
  typedDraft,
  onManageSources,
  restoreDraft,
}: {
  chat: ReturnType<typeof useChat>;
  api: Api;
  toolsTarget: HTMLElement | null;
  typedDraft: ReturnType<typeof useInterviewDraft>;
  onManageSources: () => void;
  restoreDraft: boolean;
}) {
  const questions = useSpokenQuestions(chat);
  const [session, setSession] = useState(0);
  const {
    question: draft,
    experience,
    context,
    spokenAnswer,
    useSources,
  } = typedDraft.value;
  const [typedOpen, setTypedOpen] = useState(restoreDraft);
  const latestQuestion = chat.messages.findLast((item) => item.role === "user");
  const latestAnswer = chat.messages.findLast(
    (item) => item.role === "assistant",
  );
  const [selection, setSelection] = useState<{
    questionId: string;
    currentId: string;
  } | null>(null);
  const selectedQuestion =
    selection?.currentId === latestQuestion?.id
      ? chat.messages.find(
          (item) => item.id === selection?.questionId && item.role === "user",
        )
      : undefined;
  const question = selectedQuestion ?? latestQuestion;
  const viewingEarlier = !!question && question.id !== latestQuestion?.id;
  const displayedRun = chat.runs.find(
    (item) => item.userMessageId === question?.id,
  );
  const answer = displayedRun
    ? chat.messages.find((item) => item.id === displayedRun.assistantMessageId)
    : !viewingEarlier
      ? latestAnswer
      : undefined;
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
      ? latestAnswer?.content
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
        <InterviewOptions target={toolsTarget} initiallyOpen={restoreDraft}>
          {(settingsTarget, closeOptions) => (
            <>
              <LiveTranscript
                key={session}
                settingsTarget={settingsTarget}
                onTranscript={questions.onTranscript}
                onResetDetection={questions.resetDetection}
                onUseAsQuestion={questions.propose}
              >
                {(question || questions.cards.length > 0) && (
                  <div
                    className={`interview-workspace${question ? " has-answer" : ""}`}
                  >
                    <SpokenQuestions questions={questions} />
                    <div className="interview-answer-column">
                      {(question || questions.cards.length > 0) && (
                        <div className="interview-actions">
                          <span role="status">
                            {viewingEarlier
                              ? `Current response: ${state}`
                              : state}
                          </span>
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
                        <InterviewAnswer
                          question={question}
                          answer={answer}
                          run={displayedRun}
                          viewingEarlier={viewingEarlier}
                          providerLabel={chat.providerLabel}
                          onBack={() => setSelection(null)}
                          panelRef={answerPanel}
                        />
                      ) : null}
                    </div>
                    <SentQuestions
                      questions={questions}
                      selectedQuestionId={question?.id}
                      onViewAnswer={(questionId) => {
                        if (latestQuestion)
                          setSelection({
                            questionId,
                            currentId: latestQuestion.id,
                          });
                      }}
                    />
                  </div>
                )}
              </LiveTranscript>
              {settingsTarget &&
                !viewingEarlier &&
                createPortal(
                  <ResponseTiming timing={questions.timing} />,
                  settingsTarget,
                )}
              {settingsTarget &&
                createPortal(
                  <details
                    className="interview-tools"
                    open={typedOpen}
                    onToggle={(event) => setTypedOpen(event.currentTarget.open)}
                  >
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
                            typedDraft.reset();
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
                      <InterviewSources
                        api={api}
                        enabled={useSources}
                        disabled={chat.pending}
                        onChange={(enabled) =>
                          typedDraft.update({ useSources: enabled })
                        }
                        onManage={onManageSources}
                      />
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
                              { experience, context: prior, useSources },
                              () => {
                                typedDraft.update({
                                  context: [
                                    ...prior,
                                    { question: submitted, spokenAnswer: "" },
                                  ].slice(-INTERVIEW_LIMITS.contextTurns),
                                  spokenAnswer: "",
                                  question: "",
                                });
                                closeOptions();
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
                            maxLength={INTERVIEW_LIMITS.experienceChars}
                            disabled={chat.pending}
                            onChange={(event) =>
                              typedDraft.update({
                                experience: event.currentTarget.value,
                              })
                            }
                            helperText="Paste a short project example, your contribution, and its outcome. Up to 4,000 characters. The sample survives a visit to Connections but clears when you leave for Chats or start a new interview. Answers may quote it and are saved in chat history."
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
                                typedDraft.update({
                                  context: [],
                                  spokenAnswer: "",
                                });
                                questions.newTopic();
                              }}
                            >
                              Start new topic
                            </Button>
                          </div>
                          <p className="interview-note">
                            Up to four recent questions and your notes can
                            inform the next answer. Older context may be omitted
                            to fit the model. Suggestions are never treated as
                            things you said. Context survives a visit to
                            Connections, clears when you leave for Chats, and is
                            not restored from saved history.
                          </p>
                          {context.length > 0 ? (
                            <>
                              <details>
                                <summary>
                                  Recent questions ({context.length})
                                </summary>
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
                                maxLength={INTERVIEW_LIMITS.spokenAnswerChars}
                                disabled={chat.pending}
                                onChange={(event) =>
                                  typedDraft.update({
                                    spokenAnswer: event.currentTarget.value,
                                  })
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
                          maxLength={MESSAGE_MAX_CHARS}
                          disabled={chat.pending}
                          onChange={(event) =>
                            typedDraft.update({
                              question: event.currentTarget.value,
                            })
                          }
                          placeholder="Tell me about a technical decision you influenced…"
                        />
                        <div className="interview-actions">
                          <Button
                            type="submit"
                            disabled={unavailable || !draft.trim()}
                          >
                            Get response
                          </Button>
                          {question && (
                            <Button
                              variant="ghost"
                              disabled={chat.pending}
                              onClick={() =>
                                typedDraft.update({
                                  question: latestQuestion?.content ?? "",
                                })
                              }
                            >
                              Edit last question
                            </Button>
                          )}
                        </div>
                      </form>
                      <p className="interview-note">
                        Questions and replies are saved in your chat history.
                        Audio capture starts only through Start listening. No
                        live research is available; technical knowledge may be
                        incomplete or outdated. Check personal facts and
                        technical suggestions before using them.
                      </p>
                    </div>
                  </details>,
                  settingsTarget,
                )}
            </>
          )}
        </InterviewOptions>
      </div>
    </div>
  );
}
