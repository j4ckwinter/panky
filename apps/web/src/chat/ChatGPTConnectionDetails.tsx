import {
  BannerToast,
  Button,
  Inline,
  Stack,
  StatusChip,
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
    <ConnectionDetails
      name="ChatGPT"
      onBack={onBack}
      description="Answers with your ChatGPT plan."
      actions={
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
      }
    >
      {state.error && (
        <BannerToast tone="error" title="Could not update ChatGPT connection">
          {state.error}
        </BannerToast>
      )}
      <div className="connection-overview">
        <p>
          Use your ChatGPT plan for answers in chat and Interview. This personal
          prototype is available only to the Panky owner.
        </p>
        <ul>
          <li>
            <strong>Choose your model.</strong> Select ChatGPT in chat or
            Interview when you want to use your plan.
          </li>
          <li>
            <strong>Bring your context.</strong> Answers can use relevant
            passages from your imported sources.
          </li>
          <li>
            <strong>Use your existing allowance.</strong> No API billing key is
            used, and Panky does not switch to paid API requests when you reach
            a limit.
          </li>
        </ul>
      </div>
      <section
        className="connection-card"
        role="region"
        aria-label="ChatGPT connection"
      >
        <Stack gap="space12">
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

          <a
            href="https://chatgpt.com/settings/usage"
            target="_blank"
            rel="noreferrer"
          >
            Manage ChatGPT usage
          </a>
        </Stack>
      </section>
      <p className="connections-privacy">
        When you select a ChatGPT model, your question, conversation context and
        relevant imported passages are sent to OpenAI. Selecting the local model
        keeps model processing on your Windows PC. ChatGPT cannot run Panky
        tools in this prototype.
      </p>
    </ConnectionDetails>
  );
}
