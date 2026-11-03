import { BannerToast, Button, Stack } from "@jack.winter/pancake-ui";
import { useEffect, useRef, useState } from "react";
import {
  googleOptions,
  signInError,
  signInErrorTitle,
  verifyGoogle,
} from "./api";

type GoogleIdentity = {
  initialize(options: {
    client_id: string;
    nonce: string;
    callback: (result: { credential?: string }) => void;
    auto_select: boolean;
    use_fedcm_for_button: boolean;
  }): void;
  renderButton(
    element: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      text: "signin_with";
      shape: "pill";
      width: number;
    },
  ): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}
let scriptPromise: Promise<GoogleIdentity> | undefined;
function loadGoogle() {
  if (window.google?.accounts.id)
    return Promise.resolve(window.google.accounts.id);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      scriptPromise = undefined;
      reject(
        new Error(
          "Google sign-in could not load. Check your connection and try again.",
        ),
      );
    };
    const timeout = setTimeout(fail, 15_000);
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timeout);
      const identity = window.google?.accounts.id;
      if (identity) resolve(identity);
      else fail();
    };
    document.head.append(script);
  });
  return scriptPromise;
}

export function GoogleSignIn({
  onSignedIn,
}: {
  onSignedIn: () => Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let submitted = false;
    let resizeObserver: ResizeObserver | undefined;
    const element = container.current;
    setLoading(true);
    setVerifying(false);
    element?.replaceChildren();
    void (async () => {
      try {
        const identity = await loadGoogle();
        if (!alive) return;
        const options = await googleOptions();
        if (!alive || !element) return;
        identity.initialize({
          client_id: options.clientId,
          nonce: options.nonce,
          auto_select: false,
          use_fedcm_for_button: true,
          callback: (result) => {
            if (!alive || submitted) return;
            submitted = true;
            setVerifying(true);
            setError("");
            element.replaceChildren();
            void (async () => {
              try {
                if (!result.credential)
                  throw new Error(
                    "Google did not return a sign-in credential.",
                  );
                await verifyGoogle(result.credential);
                if (alive) await onSignedIn();
              } catch (cause) {
                if (alive) {
                  setError(signInError(cause));
                  setVerifying(false);
                }
              }
            })();
          },
        });
        let renderedWidth = 0;
        const render = () => {
          if (!alive || submitted) return;
          const width = Math.min(400, Math.floor(element.clientWidth));
          if (width < 1 || width === renderedWidth) return;
          renderedWidth = width;
          element.replaceChildren();
          identity.renderButton(element, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "signin_with",
            shape: "pill",
            width,
          });
        };
        render();
        resizeObserver = new ResizeObserver(render);
        resizeObserver.observe(element);
      } catch (cause) {
        if (alive) setError(signInError(cause));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      resizeObserver?.disconnect();
      element?.replaceChildren();
    };
  }, [attempt, onSignedIn]);
  return (
    <Stack gap="space16">
      {(loading || verifying) && (
        <p role="status">
          {verifying ? "Signing in…" : "Loading Google sign-in…"}
        </p>
      )}
      <div ref={container} className="google-sign-in" />
      {error && (
        <>
          <BannerToast tone="error" title={signInErrorTitle(error)}>
            {error}
          </BannerToast>
          <Button
            disabled={loading || verifying}
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </Button>
        </>
      )}
    </Stack>
  );
}
