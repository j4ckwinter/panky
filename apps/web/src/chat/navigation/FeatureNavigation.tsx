import { Button } from "@jack.winter/pancake-ui";

export type ChatView = "chat" | "interview" | "connections" | "picks";

export function FeatureNavigation({
  view,
  pending,
  onNavigate,
}: {
  view: ChatView;
  pending: boolean;
  onNavigate: (view: ChatView) => void;
}) {
  return (
    <nav aria-label="Panky features">
      <Button
        size={40}
        variant="ghost"
        className="sidebar-feature-button"
        aria-label="Chats"
        title="Chats"
        aria-current={view === "chat" ? "page" : undefined}
        disabled={pending}
        onClick={() => {
          onNavigate("chat");
        }}
      >
        <svg
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
          <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
        </svg>
      </Button>
      <Button
        size={40}
        variant="ghost"
        className="sidebar-feature-button"
        aria-label="Interview"
        title="Interview"
        aria-current={view === "interview" ? "page" : undefined}
        disabled={pending}
        onClick={() => {
          onNavigate("interview");
        }}
      >
        <svg
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
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
        </svg>
      </Button>
      <Button
        size={40}
        variant="ghost"
        className="sidebar-feature-button"
        aria-label="Picks"
        title="Picks"
        aria-current={view === "picks" ? "page" : undefined}
        disabled={pending}
        onClick={() => onNavigate("picks")}
      >
        <svg
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
          <circle cx="12" cy="12" r="9" />
          <path d="m12 7 5 4-2 6H9l-2-6 5-4ZM12 7V3M17 11l4-2M15 17l2 3M9 17l-2 3M7 11 3 9" />
        </svg>
      </Button>
      <Button
        size={40}
        variant="ghost"
        className="sidebar-feature-button"
        aria-label="Connections"
        title="Connections"
        aria-current={view === "connections" ? "page" : undefined}
        disabled={pending}
        onClick={() => {
          onNavigate("connections");
        }}
      >
        <svg
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
          <path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4" />
        </svg>
      </Button>
    </nav>
  );
}
