import { useLayoutEffect, useRef, useState, type UIEvent } from "react";

export function useChatScroll(
  conversationId: string | undefined,
  hasMessages: boolean,
) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const scrollContent = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showJump, setShowJump] = useState(false);
  useLayoutEffect(() => {
    following.current = true;
    setShowJump(false);
    const area = scrollArea.current;
    if (area) area.scrollTop = hasMessages ? area.scrollHeight : 0;
  }, [conversationId, hasMessages]);
  useLayoutEffect(() => {
    const area = scrollArea.current;
    const content = scrollContent.current;
    if (!area || !content) return;
    const observer = new ResizeObserver(() => {
      if (following.current) {
        area.scrollTop = hasMessages ? area.scrollHeight : 0;
      } else if (area.scrollHeight - area.scrollTop - area.clientHeight < 48) {
        following.current = true;
        setShowJump(false);
      }
    });
    observer.observe(content);
    observer.observe(area);
    return () => observer.disconnect();
  }, [hasMessages]);
  function jumpToLatest() {
    following.current = true;
    setShowJump(false);
    const area = scrollArea.current;
    if (area) area.scrollTop = area.scrollHeight;
  }
  function onScroll(event: UIEvent<HTMLDivElement>) {
    const area = event.currentTarget;
    const nearBottom =
      area.scrollHeight - area.scrollTop - area.clientHeight < 48;
    following.current = nearBottom;
    setShowJump(!nearBottom);
  }
  return { scrollArea, scrollContent, showJump, jumpToLatest, onScroll };
}
