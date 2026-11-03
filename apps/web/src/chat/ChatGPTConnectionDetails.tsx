import {
  BannerToast,
  Button,
  Inline,
  Stack,
  StatusChip,
  Surface,
  Text,
} from "@jack.winter/pancake-ui";
import { ConnectionDetails } from "./ConnectionDetails";
import type { ChatGPTState } from "./useChatGPT";

export function ChatGPTConnectionDetails({
  state,
  pending,
  onBack,
}: {
  state: ChatGPTState;
  pending: boolean;
  onBack: () => void;
}) {
  const connected = state.connection?.kind === "connected";
  const kind = state.connection?.kind;
  return (
    <ConnectionDetails name="ChatGPT" onBack={onBack}>
      {state.error && (
        <BannerToast tone="error" title="Could not update ChatGPT connection">
          {state.error}
        </BannerToast>
      )}
      <Surface
        className="connection-card"
        role="region"
        aria-label="ChatGPT connection"
      >
        <Stack gap="space12">
          <Text as="h2" variant="heading">
            ChatGPT
          </Text>
          <p>
            Use your ChatGPT plan for answers in chat and Interview. This
            personal prototype is available only to the Panky owner.
          </p>
          <Inline gap="space12">
            <StatusChip tone={connected ? "success" : "neutral"} role="status">
              {connected
                ? "Connected"
                : kind === "reconnect_required"
                  ? "Reconnect required"
                  : kind === "unavailable"
                    ? "Unavailable"
                    : state.busy
                      ? "Checking connection…"
                      : "Not connected"}
            </StatusChip>
            {state.connection?.email && <span>{state.connection.email}</span>}
          </Inline>
          {kind === "unavailable" ? (
            <p>The ChatGPT prototype is not enabled on this server.</p>
          ) : (
            !connected && (
              <p>
                On the Windows PC hosting Panky, run{" "}
                <code>pnpm connect:chatgpt</code> from the project folder and
                complete sign-in in that PC’s browser. Then check the connection
                here.
              </p>
            )
          )}
          <Inline gap="space8" className="notion-connection-actions">
            <Button
              size={40}
              variant="secondary"
              disabled={pending || state.busy}
              onClick={() => void state.refresh()}
            >
              Check ChatGPT connection
            </Button>
            {(connected || kind === "reconnect_required") && (
              <Button
                size={40}
                variant="secondary"
                disabled={pending || state.busy}
                onClick={() => void state.disconnect()}
              >
                Disconnect ChatGPT
              </Button>
            )}
          </Inline>
          <p>
            ChatGPT uses your existing plan allowance. Panky does not use an API
            billing key or switch to paid API requests when you reach a limit.
          </p>
          <a
            href="https://chatgpt.com/settings/usage"
            target="_blank"
            rel="noreferrer"
          >
            Manage ChatGPT usage
          </a>
        </Stack>
      </Surface>
      <p className="connections-privacy">
        When you select a ChatGPT model, your question, conversation context and
        relevant imported passages are sent to OpenAI. Selecting the local model
        keeps model processing on your Windows PC. ChatGPT cannot run Panky
        tools in this prototype.
      </p>
    </ConnectionDetails>
  );
}
