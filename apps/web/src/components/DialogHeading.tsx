import { Button } from "@jack.winter/pancake-ui";
import type { ReactNode } from "react";

export function DialogHeading({
  id,
  children,
  onClose,
  disabled = false,
}: {
  id: string;
  children: ReactNode;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="dialog-heading">
      <h2 id={id}>{children}</h2>
      <Button
        variant="ghost"
        className="dialog-close"
        aria-label="Close"
        title="Close"
        disabled={disabled}
        onClick={onClose}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </Button>
    </div>
  );
}
