import { useEffect, useRef, type ReactNode } from "react";

export function ConnectionDetails({
  name,
  onBack,
  children,
}: {
  name: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const back = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    back.current?.focus();
  }, []);
  return (
    <div className="connections-scroll">
      <section className="connections-panel" aria-label="Your connections">
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
        {children}
      </section>
    </div>
  );
}
