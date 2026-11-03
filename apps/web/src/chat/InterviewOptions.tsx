import { Button } from "@jack.winter/pancake-ui";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { DialogHeading } from "../components/DialogHeading";

export function InterviewOptions({
  target,
  children,
  initiallyOpen = false,
}: {
  target: HTMLElement | null;
  initiallyOpen?: boolean;
  children: (
    settingsTarget: HTMLElement | null,
    close: () => void,
  ) => ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [settingsTarget, setSettingsTarget] = useState<HTMLElement | null>(
    null,
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const element = panel.current;
    element?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    element?.addEventListener("keydown", onKeyDown);
    return () => element?.removeEventListener("keydown", onKeyDown);
  }, [open, close]);
  return (
    <>
      {target &&
        createPortal(
          <Button
            ref={trigger}
            variant="ghost"
            size={40}
            className="header-icon-button"
            aria-label="Interview options"
            title="Interview options"
            aria-expanded={open}
            aria-controls="interview-options"
            onClick={() => setOpen(!open)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 17h16M9 4v6M15 14v6" />
            </svg>
          </Button>,
          target,
        )}
      <aside
        ref={panel}
        id="interview-options"
        aria-labelledby="interview-options-title"
        className="interview-options"
        hidden={!open}
      >
        <DialogHeading id="interview-options-title" onClose={close}>
          Interview options
        </DialogHeading>
        <div ref={setSettingsTarget} />
      </aside>
      {children(settingsTarget, close)}
    </>
  );
}
