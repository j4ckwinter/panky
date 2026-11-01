import { Button } from "@jack.winter/pancake-ui";
import { useEffect, useRef, useState } from "react";

export function CopyButton({
  text,
  label,
}: {
  text: () => string;
  label: string;
}) {
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  return (
    <span className="copy-control">
      <Button
        variant="ghost"
        size={40}
        aria-label={label}
        title={label}
        onClick={async () => {
          clearTimeout(timer.current);
          try {
            await navigator.clipboard.writeText(text());
            if (!mounted.current) return;
            setStatus("Copied");
          } catch {
            if (!mounted.current) return;
            setStatus("Could not copy. Select the text instead.");
          }
          timer.current = setTimeout(() => setStatus(""), 3000);
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
        </svg>
      </Button>
      <span className="copy-status" role="status">
        {status}
      </span>
    </span>
  );
}
