import { Component, lazy, Suspense, type ReactNode } from "react";

const MarkdownContent = lazy(() =>
  import("./MarkdownContent").then((module) => ({
    default: module.MarkdownContent,
  })),
);

export function Markdown({ children }: { children: string }) {
  const plainText = <div className="markdown-plain">{children}</div>;
  return (
    <FormattingBoundary fallback={plainText}>
      <Suspense fallback={plainText}>
        <MarkdownContent>{children}</MarkdownContent>
      </Suspense>
    </FormattingBoundary>
  );
}

class FormattingBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
}> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <>
        {this.props.fallback}
        <p className="muted" role="status">
          Formatting unavailable. Showing plain text.
        </p>
      </>
    ) : (
      this.props.children
    );
  }
}
