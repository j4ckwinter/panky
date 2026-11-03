import "./model-picker.css";
import { Select } from "@jack.winter/pancake-ui";
import type { ModelSelection } from "@panky/shared";
import type { ChatGPTState } from "./useChatGPT";
export function ModelPicker({
  state,
  value,
  onChange,
  pending,
  localLabel,
}: {
  state: ChatGPTState;
  value: ModelSelection | undefined;
  onChange: (value: ModelSelection | undefined) => void;
  pending: boolean;
  localLabel: string;
}) {
  const available = state.connection?.kind === "connected" && !state.error;
  const missing =
    value && !state.models.some((model) => model.id === value.model);
  return (
    <div className="model-picker">
      <svg
        className="model-picker-icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
        <path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z" />
      </svg>
      <Select
        label="Answer model"
        title={`Answer model: ${value ? `ChatGPT · ${state.models.find((model) => model.id === value.model)?.name ?? value.model}` : localLabel}`}
        value={value?.model ?? ""}
        disabled={pending || state.busy}
        onChange={(event) =>
          onChange(
            event.currentTarget.value
              ? { provider: "chatgpt", model: event.currentTarget.value }
              : undefined,
          )
        }
      >
        <option value="">{localLabel}</option>
        {missing && (
          <option value={value.model} disabled>
            ChatGPT · {value.model} (unavailable)
          </option>
        )}
        {state.models.map((model) => (
          <option key={model.id} value={model.id} disabled={!available}>
            ChatGPT · {model.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function ModelNotice({
  state,
  value,
}: {
  state: ChatGPTState;
  value: ModelSelection | undefined;
}) {
  const available = state.connection?.kind === "connected" && !state.error;
  const missing =
    value && !state.models.some((model) => model.id === value.model);
  return (
    <div className="model-notice">
      {value && (
        <p>
          {available && !missing
            ? "Using ChatGPT plan. Questions, chat context and relevant source passages are sent to OpenAI."
            : "ChatGPT is unavailable. Check its connection or choose the local model. Messages are not switched automatically."}{" "}
          <a
            href="https://chatgpt.com/settings/usage"
            target="_blank"
            rel="noreferrer"
          >
            Manage usage
          </a>
        </p>
      )}
    </div>
  );
}
