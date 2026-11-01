import { Button } from "@jack.winter/pancake-ui";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function ActionMenu({
  label,
  children,
  className = "",
  disabled = false,
  iconOnly = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      ref={root}
      className={`action-menu ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <Button
        ref={trigger}
        variant="ghost"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {!iconOnly && <span className="action-menu-label">{label}</span>}
        <span aria-hidden="true">{iconOnly ? "···" : open ? "▴" : "▾"}</span>
      </Button>
      {open && (
        <div
          id={id}
          className="action-menu-panel"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button:not(:disabled)"))
              setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
