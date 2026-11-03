import type { InterviewInput } from "@panky/shared";
import { useState } from "react";

function emptyDraft() {
  return {
    question: "",
    experience: "",
    context: [] as NonNullable<InterviewInput["context"]>,
    spokenAnswer: "",
    useSources: true,
  };
}

export function useInterviewDraft() {
  const [value, setValue] = useState(emptyDraft);
  function update(patch: Partial<typeof value>) {
    setValue((current) => ({ ...current, ...patch }));
  }
  return { value, update, reset: () => setValue(emptyDraft()) };
}
