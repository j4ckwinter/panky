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
  cancelling,
  onCancel,
}: {
  task: TaskRun;
  activities: Activity[];
  cancelling: boolean;
  onCancel: (id: string) => void;
}) {
  const status = statuses[task.status];
  return (
    <section className="task-activity" aria-label="Task activity">
      <details
        key={`${task.id}:${task.status}`}
        className="task-details"
        open={
          task.status === "running" ||
          task.status === "failed" ||
          task.status === "interrupted"
        }
      >
        <summary>
          <span>Task activity</span>
          <StatusChip tone={status.tone}>{status.label}</StatusChip>
        </summary>
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
      </details>
      {task.status === "running" && (
        <div className="task-controls">
          <Button
            variant="secondary"
            onClick={() => onCancel(task.id)}
            disabled={cancelling}
            aria-label="Cancel task"
          >
            {cancelling ? "Cancelling…" : "Cancel task"}
          </Button>
        </div>
      )}
    </section>
  );
}
