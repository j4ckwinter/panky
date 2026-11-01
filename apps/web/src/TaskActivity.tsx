import type { Activity, TaskRun } from "@panky/shared";
import "./task-activity.css";

const statuses = {
  running: { label: "Running", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  interrupted: { label: "Interrupted", tone: "warning" },
} as const;

function ActivityEntry({ activity }: { activity: Activity }) {
  switch (activity.kind) {
    case "run_started":
      return (
        <>
          <strong>Conversation prepared</strong>
          <span className="task-event-note">
            {activity.historyChars.toLocaleString()} characters of context
            {activity.omittedMessages > 0
              ? ` · ${activity.omittedMessages} older messages omitted`
              : ""}
          </span>
        </>
      );
    case "model_step":
      return <strong>Model response · step {activity.step}</strong>;
    case "tool_requested":
      return (
        <>
          <strong>Tool requested</strong>
          <span className="task-event-note">
            <code>{activity.name}</code>
          </span>
          <details className="task-payload">
            <summary>View tool arguments</summary>
            <pre aria-label="Tool arguments">
              {JSON.stringify(activity.arguments, null, 2)}
            </pre>
          </details>
        </>
      );
    case "tool_completed":
      return (
        <>
          <strong>Tool result saved</strong>
          <span className="task-event-note">
            <code>{activity.name}</code>
          </span>
          <details className="task-payload">
            <summary>View tool result</summary>
            <pre aria-label="Tool result">
              {JSON.stringify(activity.result, null, 2)}
            </pre>
          </details>
        </>
      );
    case "run_finished":
      return (
        <strong>Task {statuses[activity.status].label.toLowerCase()}</strong>
      );
  }
}

export function TaskActivity({
  task,
  activities,
}: {
  task: TaskRun;
  activities: Activity[];
}) {
  const status = statuses[task.status];
  const entries = activities.filter((activity) => activity.runId === task.id);
  const toolCount = entries.filter(
    (activity) => activity.kind === "tool_completed",
  ).length;
  const label =
    toolCount > 0
      ? `Used ${toolCount} tool${toolCount === 1 ? "" : "s"}`
      : "Response details";
  return (
    <section className="task-activity" aria-label="Task activity">
      <details key={`${task.id}:${task.status}`} className="task-details">
        <summary>
          <span>{label}</span>
          {(task.status !== "completed" || toolCount > 0) && (
            <span className={`task-status task-status-${task.status}`}>
              {status.label}
            </span>
          )}
        </summary>
        <ol className="task-events" aria-label="Task timeline">
          {entries
            .sort((a, b) => a.sequence - b.sequence)
            .map((activity) => (
              <li key={activity.id} className="task-event">
                <ActivityEntry activity={activity} />
              </li>
            ))}
        </ol>
        {task.status === "cancelled" && (
          <p className="task-note">
            Stopped at your request. Any completed tool results are saved.
          </p>
        )}
        {task.status === "interrupted" && (
          <p className="task-note">
            Refresh history to check what was saved. Nothing is retried
            automatically.
          </p>
        )}
      </details>
      {task.error && task.status !== "cancelled" && (
        <p className="task-error" role="alert">
          {task.error}
        </p>
      )}
    </section>
  );
}
