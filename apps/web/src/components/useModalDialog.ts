import { useEffect, useRef } from "react";

export function useModalDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.getClientRects().length)
        trigger.focus();
    };
  }, []);
  return dialog;
}
