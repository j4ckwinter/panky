import { Text } from "@jack.winter/pancake-ui";
import { useEffect, useRef, type ReactNode } from "react";

export function ConnectionDetails({
  name,
  onBack,
  description,
  actions,
  children,
}: {
  name: string;
  description: string;
  actions?: ReactNode;
  onBack: () => void;
  children: ReactNode;
}) {
  const back = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    back.current?.focus();
  }, []);
  return (
    <div className="connections-scroll">
      <section
        className="connections-panel connection-detail-panel"
        aria-label="Your connections"
      >
        <nav aria-label="Breadcrumb" className="connection-breadcrumbs">
          <ol>
            <li>
              <a
                ref={back}
                href="?view=connections"
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onBack();
                }}
              >
                Connections
              </a>
            </li>
            <li>
              <span aria-current="page">{name}</span>
            </li>
          </ol>
        </nav>
        <header className="connection-detail-header">
          <div className="connection-detail-identity">
            <span
              className={`connection-icon${name === "ChatGPT" ? " connection-icon-image" : ""}`}
              aria-hidden="true"
            >
              {name === "ChatGPT" ? (
                <img src="/icons/chatgpt.svg" alt="" width={36} height={36} />
              ) : (
                "N"
              )}
            </span>
            <div>
              <Text as="h2" variant="heading">
                {name}
              </Text>
              <p className="muted">{description}</p>
            </div>
          </div>
          <div className="connection-detail-actions">{actions}</div>
        </header>
        {children}
      </section>
    </div>
  );
}
