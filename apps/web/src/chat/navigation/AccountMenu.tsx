import { Button } from "@jack.winter/pancake-ui";
import { ActionMenu } from "../../components/ActionMenu";

export function AccountMenu({
  email,
  providerLabel,
  pending,
  onAccess,
  onSessions,
  onDisconnect,
  onCloseSidebar,
}: {
  email: string;
  providerLabel: string;
  pending: boolean;
  onAccess?: () => void;
  onSessions: () => void;
  onDisconnect: () => void;
  onCloseSidebar: () => void;
}) {
  return (
    <div className="sidebar-bottom">
      <ActionMenu
        label="Account"
        iconOnly
        className="account-menu"
        icon={
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="9" r="3" />
            <path d="M5 18c1-6 13-6 14 0" />
          </svg>
        }
      >
        <p className="account-email">{email}</p>
        <p className="account-provider">{providerLabel}</p>
        {onAccess && (
          <Button
            variant="ghost"
            onClick={() => {
              onCloseSidebar();
              onAccess();
            }}
          >
            People
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            onCloseSidebar();
            onSessions();
          }}
        >
          Sessions
        </Button>
        <Button variant="ghost" onClick={onDisconnect} disabled={pending}>
          Sign out
        </Button>
      </ActionMenu>
    </div>
  );
}
