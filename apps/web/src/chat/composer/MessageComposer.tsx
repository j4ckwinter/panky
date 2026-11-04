import { Button, Textarea } from "@jack.winter/pancake-ui";
import { MESSAGE_MAX_CHARS } from "@panky/shared";
import type { ReactNode, RefObject } from "react";
import "./message-composer.css";

export function MessageComposer({
  input,
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
  disabled,
  submitDisabled,
  submitLabel,
  describedBy,
  actions,
  submitAction,
}: {
  input?: RefObject<HTMLTextAreaElement | null>;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  disabled?: boolean;
  submitDisabled: boolean;
  submitLabel: string;
  describedBy?: string;
  actions?: ReactNode;
  submitAction?: ReactNode;
}) {
  return (
    <form
      className="composer"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !submitDisabled && value.trim())
          void onSubmit(value.trim());
      }}
    >
      <Textarea
        ref={input}
        label={label}
        placeholder={placeholder}
        rows={1}
        wrap="off"
        maxLength={MESSAGE_MAX_CHARS}
        value={value}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-describedby={describedBy}
        onKeyDown={(event) => {
          if (
            event.key !== "Enter" ||
            event.shiftKey ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229
          )
            return;
          event.preventDefault();
          if (!event.repeat) event.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="composer-actions">
        {actions}
        {submitAction ?? (
          <Button
            className="send-button"
            size={40}
            type="submit"
            aria-label={submitLabel}
            title={submitLabel}
            disabled={disabled || submitDisabled || !value.trim()}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </Button>
        )}
      </div>
    </form>
  );
}
