import type { Activity, Message, TaskRun } from "@panky/shared";
import { PankyMark } from "../components/PankyMark";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import { TaskActivity } from "./TaskActivity";
import { SourceEvidence } from "./SourceEvidence";

export function MessageList({
  messages,
  runs,
  activities,
  streaming,
}: {
  messages: Message[];
  runs: TaskRun[];
  activities: Activity[];
  streaming: boolean;
}) {
  return messages.length === 0 ? (
    <section className="welcome">
      <h2>Start a chat</h2>
    </section>
  ) : (
    <div className="message-list" aria-label="Messages">
      {messages.map((message) => {
        const task = runs.find((run) => run.assistantMessageId === message.id);
        return (
          <article
            key={message.id}
            className={`message message-${message.role}`}
            aria-label={
              message.role === "user" ? "Your message" : "Panky response"
            }
          >
            {message.role === "assistant" && (
              <div className="message-meta">
                <PankyMark small />
                <strong>Panky</strong>
              </div>
            )}
            <div className="message-content">
              {(message.role === "assistant" && message.content ? (
                <Markdown>{message.content}</Markdown>
              ) : (
                message.content
              )) ||
                (message.status === "streaming"
                  ? "Preparing reply…"
                  : "No reply text was saved.")}
            </div>
            {message.role === "assistant" && (
              <SourceEvidence sources={message.sources ?? []} />
            )}
            {message.status === "interrupted" && (
              <p className="interrupted">
                {task?.status === "cancelled"
                  ? "Task cancelled. Any partial reply was saved."
                  : task?.status === "failed"
                    ? "Task failed. See task activity for details."
                    : "Reply interrupted. This partial reply was saved; nothing was retried."}
              </p>
            )}
            {message.status === "streaming" && (
              <p className="streaming-label">
                {streaming
                  ? "Replying…"
                  : "Reply in progress. Refresh history to check for updates."}
              </p>
            )}
            <div className="response-footer">
              {message.role === "assistant" &&
                message.content &&
                message.status !== "streaming" && (
                  <div className="reply-actions">
                    <CopyButton
                      label="Copy response"
                      text={() => message.content}
                    />
                  </div>
                )}
              {task && <TaskActivity task={task} activities={activities} />}
            </div>
          </article>
        );
      })}
    </div>
  );
}
