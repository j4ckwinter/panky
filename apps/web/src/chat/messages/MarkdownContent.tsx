import { isValidElement, useRef, type ReactNode } from "react";
import { CopyButton } from "./CopyButton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => <span>{alt || "Image"}</span>,
          table: ({ children }) => (
            <div
              className="markdown-table"
              role="region"
              aria-label="Table"
              tabIndex={0}
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  const pre = useRef<HTMLPreElement>(null);
  const language = isValidElement<{ className?: string }>(children)
    ? children.props.className?.match(/language-([^ ]+)/)?.[1]
    : undefined;
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language || "Code"}</span>
        <CopyButton
          label="Copy code"
          text={() => pre.current?.textContent ?? ""}
        />
      </div>
      <pre ref={pre}>{children}</pre>
    </div>
  );
}
