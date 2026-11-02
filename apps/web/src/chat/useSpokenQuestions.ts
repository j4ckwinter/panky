import { useEffect, useRef, useState } from "react";
import type { TranscriptEntry } from "./LiveTranscript";
import { normalizeQuestion, QuestionDetector } from "./questionDetection";
import type { useChat } from "./useChat";

export type SpokenQuestion = {
  id: number;
  text: string;
  original: string;
  status: "draft" | "pending" | "failed";
};

export function useSpokenQuestions(chat: ReturnType<typeof useChat>) {
  const [cards, setCards] = useState<SpokenQuestion[]>([]);
  const [acceptedQuestions, setAcceptedQuestions] = useState<
    { id: number; text: string }[]
  >([]);
  const [notice, setNotice] = useState("");
  const items = useRef(cards);
  const history = useRef<string[]>([]);
  const detector = useRef(new QuestionDetector());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextId = useRef(0);
  const sending = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const unavailable = chat.pending || chat.serverBusy || !chat.connected;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      clearTimeout(deadline.current);
      generation.current++;
    };
  }, []);

  function update(next: SpokenQuestion[]) {
    items.current = next;
    setCards(next);
  }
  function remember(text: string) {
    history.current = [...history.current, normalizeQuestion(text)].slice(-100);
  }
  function propose(text: string) {
    const value = text.trim().slice(0, 8000);
    const key = normalizeQuestion(value);
    if (
      !key ||
      history.current.includes(key) ||
      items.current.some(
        (item) =>
          normalizeQuestion(item.text) === key ||
          normalizeQuestion(item.original) === key,
      )
    )
      return;
    if (items.current.length >= 5) {
      setNotice(
        "Five questions are waiting. Dismiss one, then use a transcript segment to add another.",
      );
      return;
    }
    update([
      ...items.current,
      { id: nextId.current++, text: value, original: value, status: "draft" },
    ]);
  }
  function settle() {
    clearTimeout(timer.current);
    clearTimeout(deadline.current);
    timer.current = undefined;
    deadline.current = undefined;
    const candidate = detector.current.flush();
    if (candidate) propose(candidate);
  }
  function onTranscript(entry: TranscriptEntry) {
    if (entry.source !== "shared") return;
    const candidate = detector.current.push(entry.text);
    if (candidate) propose(candidate);
    if (!detector.current.pending) {
      resetDetection();
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(settle, 6500);
    deadline.current ??= setTimeout(settle, 15000);
  }
  function edit(id: number, text: string) {
    update(
      items.current.map((item) =>
        item.id === id && item.status === "draft" ? { ...item, text } : item,
      ),
    );
  }
  function dismiss(id: number) {
    const card = items.current.find((item) => item.id === id);
    if (!card || card.status === "pending") return;
    remember(card.original);
    remember(card.text);
    update(items.current.filter((item) => item.id !== id));
    setNotice("");
  }
  async function submit(id: number) {
    const card = items.current.find((item) => item.id === id);
    if (
      unavailable ||
      sending.current ||
      !card ||
      card.status !== "draft" ||
      !card.text.trim()
    )
      return;
    const submitted = card.text.trim();
    if (history.current.includes(normalizeQuestion(submitted))) {
      setNotice(
        "This question has already been submitted or dismissed. Edit it to ask a different question.",
      );
      return;
    }
    sending.current = true;
    const current = generation.current;
    const changeStatus = (status: SpokenQuestion["status"]) => {
      if (mounted.current && generation.current === current)
        update(
          items.current.map((item) =>
            item.id === id ? { ...item, text: submitted, status } : item,
          ),
        );
    };
    changeStatus("pending");
    let accepted = false;
    try {
      await chat.send(
        submitted,
        { experience: "", context: [], useExperience: false },
        () => {
          accepted = true;
          if (!mounted.current || generation.current !== current) return;
          remember(card.original);
          remember(submitted);
          setAcceptedQuestions((previous) =>
            [...previous, { id, text: submitted }].slice(-20),
          );
          update(items.current.filter((item) => item.id !== id));
          setNotice("");
        },
      );
    } finally {
      if (!accepted) changeStatus("failed");
      sending.current = false;
    }
  }
  async function sendTyped(...args: Parameters<typeof chat.send>) {
    if (unavailable || sending.current) return;
    sending.current = true;
    try {
      await chat.send(...args);
    } finally {
      sending.current = false;
    }
  }
  function review(id: number) {
    update(
      items.current.map((item) =>
        item.id === id && item.status === "failed"
          ? { ...item, status: "draft" }
          : item,
      ),
    );
  }
  function resetDetection() {
    clearTimeout(timer.current);
    timer.current = undefined;
    clearTimeout(deadline.current);
    deadline.current = undefined;
    detector.current.reset();
  }
  function reset() {
    generation.current++;
    resetDetection();
    history.current = [];
    update([]);
    setAcceptedQuestions([]);
    setNotice("");
  }
  return {
    cards,
    acceptedQuestions,
    notice,
    unavailable,
    onTranscript,
    resetDetection,
    propose,
    edit,
    dismiss,
    submit,
    sendTyped,
    review,
    reset,
  };
}
