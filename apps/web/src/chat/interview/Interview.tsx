import { InterviewReply } from "./InterviewReply";
import { Button } from "@jack.winter/pancake-ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LiveTranscript } from "./audio/LiveTranscript";
import { InterviewAnswer } from "./InterviewAnswer";
import { SentQuestions } from "./SentQuestions";
import { SpokenQuestions } from "./SpokenQuestions";
import type { useChat } from "../useChat";
import { useSpokenQuestions } from "./useSpokenQuestions";

export function Interview({
  chat,
  modelPicker,
  modelNotice,
}: {
  chat: ReturnType<typeof useChat>;
  modelPicker?: ReactNode;
  modelNotice?: ReactNode;
}) {
  const questions = useSpokenQuestions(chat);
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
        <LiveTranscript
          modelPicker={modelPicker}
          modelNotice={modelNotice}
          topicAction={
            questions.topicCount > 0 && (
              <Button
                variant="ghost"
                size={40}
                className="capture-action"
                title="Clear follow-up context"
                disabled={questions.unavailable}
                onClick={questions.newTopic}
              >
                New topic
              </Button>
            )
          }
          onTranscript={questions.onTranscript}
          onResetDetection={questions.resetDetection}
          onUseAsQuestion={questions.propose}
        >
          {(question || questions.cards.length > 0) && (
            <div
              className={`interview-workspace${question ? " has-answer" : ""}`}
            >
              {(questions.cards.length > 0 || questions.notice) && (
                <SpokenQuestions questions={questions} />
              )}
              <div className="interview-answer-column">
                {(question || questions.cards.length > 0) && (
                  <div className="interview-actions">
                    <span role="status">
                      {viewingEarlier ? `Current response: ${state}` : state}
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
                {question && (
                  <InterviewReply
                    questionId={question.id}
                    hidden={
                      displayedRun?.status !== "completed" || !answer?.content
                    }
                    disabled={questions.unavailable}
                    onSend={(text) =>
                      answer
                        ? questions.reply(text, question, answer)
                        : Promise.resolve(false)
                    }
                  />
                )}
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
      </div>
    </div>
  );
}
