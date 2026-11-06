import type { Activity, Message, StreamEvent, TaskRun } from "@panky/shared";

type Operation =
  | { phase: "idle" | "settling"; accepted: boolean }
  | { phase: "request" }
  | {
      phase: "stream";
      response: { assistantId: string; runId: string } | null;
    };

type HistoryContent = {
  messages: Message[];
  runs: TaskRun[];
  activities: Activity[];
};

type ChatState = HistoryContent & {
  operation: Operation;
  cancelling: boolean;
  error: string;
};

type Action =
  | { type: "operation-started" }
  | { type: "operation-finished" }
  | { type: "stream-opened" }
  | { type: "stream-closed" }
  | { type: "stream-event"; event: StreamEvent }
  | { type: "stream-interrupted" }
  | { type: "history-replaced"; history: HistoryContent | null }
  | { type: "cancel-started" }
  | { type: "cancel-result"; run: TaskRun }
  | { type: "cancel-finished" }
  | { type: "error"; error: string };

export const initialChatState: ChatState = {
  messages: [],
  runs: [],
  activities: [],
  operation: { phase: "idle", accepted: false },
  cancelling: false,
  error: "",
};

export function submissionAccepted(operation: Operation) {
  switch (operation.phase) {
    case "request":
      return false;
    case "stream":
      return operation.response !== null;
    case "idle":
    case "settling":
      return operation.accepted;
  }
}

export function chatReducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "operation-started":
      return { ...state, operation: { phase: "request" }, error: "" };
    case "operation-finished":
      return {
        ...state,
        operation: {
          phase: "idle",
          accepted: submissionAccepted(state.operation),
        },
      };
    case "stream-opened":
      return { ...state, operation: { phase: "stream", response: null } };
    case "stream-closed":
      return {
        ...state,
        operation: {
          phase: "settling",
          accepted: submissionAccepted(state.operation),
        },
      };
    case "stream-event":
      return receiveEvent(state, action.event);
    case "stream-interrupted": {
      const response =
        state.operation.phase === "stream" ? state.operation.response : null;
      return {
        ...state,
        runs: state.runs.map((run) =>
          run.id === response?.runId && run.status === "running"
            ? {
                ...run,
                status: "interrupted",
                error:
                  "Connection interrupted. Refresh history to confirm the saved task status.",
              }
            : run,
        ),
        messages: state.messages.map((message) =>
          message.id === response?.assistantId && message.status === "streaming"
            ? { ...message, status: "interrupted" }
            : message,
        ),
      };
    }
    case "history-replaced":
      return {
        ...state,
        messages: action.history?.messages ?? [],
        runs: action.history?.runs ?? [],
        activities: action.history?.activities ?? [],
      };
    case "cancel-started":
      return { ...state, cancelling: true };
    case "cancel-result":
      return {
        ...state,
        runs: state.runs.map((run) =>
          run.id === action.run.id ? action.run : run,
        ),
      };
    case "cancel-finished":
      return { ...state, cancelling: false };
    case "error":
      return { ...state, error: action.error };
  }
}

function receiveEvent(state: ChatState, event: StreamEvent): ChatState {
  if (state.operation.phase !== "stream") return state;
  switch (event.type) {
    case "start":
      if (state.operation.response) return state;
      return {
        ...state,
        operation: {
          phase: "stream",
          response: { assistantId: event.assistant.id, runId: event.run.id },
        },
        runs: [...state.runs, event.run],
        messages: [...state.messages, event.user, event.assistant],
      };
    case "delta": {
      const assistantId = state.operation.response?.assistantId;
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === assistantId
            ? { ...message, content: message.content + event.text }
            : message,
        ),
      };
    }
    case "activity":
      return {
        ...state,
        activities: state.activities.some(
          (item) => item.id === event.activity.id,
        )
          ? state.activities
          : [...state.activities, event.activity],
      };
    case "done":
      return {
        ...state,
        runs: state.runs.map((run) =>
          run.id === event.run.id ? event.run : run,
        ),
        messages: state.messages.map((message) =>
          message.id === event.message.id ? event.message : message,
        ),
        error:
          event.run.error && event.run.status !== "cancelled"
            ? event.run.error
            : state.error,
      };
    case "error":
      return { ...state, error: event.error };
  }
}
