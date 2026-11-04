import "./model-picker.css";
import { IconButton, Popover, RadioGroup } from "@jack.winter/pancake-ui";
import { useId, useRef } from "react";
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
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const available = state.connection?.kind === "connected" && !state.error;
  const missing =
    value && !state.models.some((model) => model.id === value.model);
  return (
    <>
      <IconButton
        ref={trigger}
        label="Answer model"
        title={`Answer model: ${value ? `ChatGPT · ${state.models.find((model) => model.id === value.model)?.name ?? value.model}` : localLabel}`}
        className="model-picker"
        variant="secondary"
        size={40}
        popoverTarget={id}
        disabled={pending || state.busy}
      >
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
      </IconButton>
      <Popover
        ref={panel}
        id={id}
        label="Choose answer model"
        className="model-picker-panel"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            panel.current?.hidePopover();
            trigger.current?.focus();
          }
        }}
      >
        <RadioGroup
          label="Answer model"
          value={value?.model ?? ""}
          disabled={pending || state.busy}
          options={[
            {
              value: "",
              label: localLabel,
              description: "Runs locally on your Panky server",
            },
            ...(missing
              ? [
                  {
                    value: value.model,
                    label: value.model,
                    description: "ChatGPT · Unavailable",
                    disabled: true,
                  },
                ]
              : []),
            ...state.models.map((model) => ({
              value: model.id,
              label: model.name,
              description: available
                ? "ChatGPT subscription"
                : "ChatGPT · Unavailable",
              disabled: !available,
            })),
          ]}
          onValueChange={(model) => {
            if (
              pending ||
              state.busy ||
              (model &&
                (!available || !state.models.some((item) => item.id === model)))
            )
              return;
            onChange(model ? { provider: "chatgpt", model } : undefined);
            panel.current?.hidePopover();
            trigger.current?.focus();
          }}
        />
      </Popover>
    </>
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
