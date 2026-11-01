import { Button, StatusChip } from "@jack.winter/pancake-ui";
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
      return <strong>Mock reply · step {activity.step}</strong>;
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
  runs,
  activities,
  cancelling,
  onCancel,
}: {
  runs: TaskRun[];
  activities: Activity[];
  cancelling: boolean;
  onCancel: (id: string) => void;
}) {
  if (!runs.length) return null;
  const latest = runs.at(-1);
  function renderTask(task: TaskRun, showHeading = true) {
    const status = statuses[task.status];
    return (
      <div className="task-record">
        {showHeading && (
          <div className="task-heading">
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
            {task.status === "running" && (
              <Button
                variant="secondary"
                onClick={() => onCancel(task.id)}
                disabled={cancelling}
                aria-label="Cancel task"
              >
                {cancelling ? "Cancelling…" : "Cancel task"}
              </Button>
            )}
          </div>
        )}
        <ol className="task-events" aria-label="Task timeline">
          {activities
            .filter((activity) => activity.runId === task.id)
            .sort((a, b) => a.sequence - b.sequence)
            .map((activity) => (
              <li key={activity.id} className="task-event">
                <ActivityEntry activity={activity} />
              </li>
            ))}
        </ol>
        {task.error && <p className="task-error">{task.error}</p>}
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
      </div>
    );
  }
  return (
    <section className="task-activity" aria-label="Task activity">
      {latest && (
        <>
          <details
            key={`${latest.id}:${latest.status}`}
            className="latest-task"
            open={
              latest.status === "running" ||
              latest.status === "failed" ||
              latest.status === "interrupted"
            }
          >
            <summary>
              <span>Task activity</span>
              <StatusChip tone={statuses[latest.status].tone}>
                {statuses[latest.status].label}
              </StatusChip>
            </summary>
            {renderTask(latest, false)}
          </details>
          {latest.status === "running" && (
            <div className="task-controls">
              <Button
                variant="secondary"
                onClick={() => onCancel(latest.id)}
                disabled={cancelling}
                aria-label="Cancel task"
              >
                {cancelling ? "Cancelling…" : "Cancel task"}
              </Button>
            </div>
          )}
        </>
      )}
      {runs.length > 1 && (
        <details className="previous-tasks">
          <summary>Previous tasks ({runs.length - 1})</summary>
          {runs
            .slice(0, -1)
            .reverse()
            .map((task) => (
              <details key={task.id}>
                <summary>
                  {statuses[task.status].label} ·{" "}
                  {new Date(task.createdAt).toLocaleString()}
                </summary>
                {renderTask(task)}
              </details>
            ))}
        </details>
      )}
    </section>
  );
}
