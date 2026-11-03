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
      <Select
        label="Answer model"
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
