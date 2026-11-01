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
        Copy
      </Button>
      <span className="copy-status" role="status">
        {status}
      </span>
    </span>
  );
}
