import { useEffect, useRef, useState } from "react";
import type { TranscriptEntry } from "./LiveTranscript";
import { normalizeQuestion, QuestionDetector } from "./questionDetection";
import { type DetectionTiming, useResponseTiming } from "./ResponseTiming";
import type { useChat } from "./useChat";

export type SpokenQuestion = {
  id: number;
  text: string;
  original: string;
  timing?: DetectionTiming;
  status: "draft" | "pending" | "failed";
};

export function useSpokenQuestions(chat: ReturnType<typeof useChat>) {
  const responseTiming = useResponseTiming();
  const pendingTiming = useRef<{
    receivedAt: number;
    transcriptionMs: number;
  } | null>(null);
  const [topicQuestions, setTopicQuestions] = useState<string[]>([]);
  const [cards, setCards] = useState<SpokenQuestion[]>([]);
  const [acceptedQuestions, setAcceptedQuestions] = useState<
    { id: number; text: string }[]
  >([]);
  const [notice, setNotice] = useState("");
  const items = useRef(cards);
  const history = useRef<string[]>([]);
  const lastAutomatic = useRef("");
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
  function propose(text: string, timing?: DetectionTiming, automatic = false) {
    const value = text.trim().slice(0, 8000);
    const key = normalizeQuestion(value);
    if (automatic) {
      if (key === lastAutomatic.current) return;
      lastAutomatic.current = key;
    }
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
      {
        id: nextId.current++,
        text: value,
        original: value,
        timing,
        status: "draft",
      },
    ]);
  }
  function detectionTiming(): DetectionTiming | undefined {
    const value = pendingTiming.current;
    pendingTiming.current = null;
    return value
      ? {
          transcriptionMs: value.transcriptionMs,
          assemblyMs: performance.now() - value.receivedAt,
        }
      : undefined;
  }
  function settle() {
    clearTimeout(timer.current);
    clearTimeout(deadline.current);
    timer.current = undefined;
    deadline.current = undefined;
    const candidate = detector.current.flush();
    if (candidate) propose(candidate, detectionTiming(), true);
  }
  function onTranscript(entry: TranscriptEntry) {
    if (entry.source !== "shared") return;
    const previous = pendingTiming.current;
    pendingTiming.current =
      detector.current.pending &&
      previous &&
      entry.receivedAt - previous.receivedAt <= 20000
        ? {
            ...previous,
            transcriptionMs: previous.transcriptionMs + entry.transcriptionMs,
          }
        : {
            receivedAt: entry.receivedAt,
            transcriptionMs: entry.transcriptionMs,
          };
    const candidate = detector.current.push(entry.text);
    if (candidate) propose(candidate, detectionTiming(), true);
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
    const measurement = responseTiming.start(submitted, card.timing);
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
        {
          experience: "",
          context: topicQuestions.map((question) => ({
            question,
            spokenAnswer: "",
          })),
          useExperience: false,
        },
        () => {
          accepted = true;
          if (!mounted.current || generation.current !== current) return;
          setTopicQuestions((previous) => [...previous, submitted].slice(-4));
          history.current = [];
          remember(card.original);
          remember(submitted);
          setAcceptedQuestions((previous) =>
            [...previous, { id, text: submitted }].slice(-20),
          );
          update(items.current.filter((item) => item.id !== id));
          setNotice("");
        },
        measurement.firstText,
      );
    } finally {
      measurement.finish();
      if (!accepted) changeStatus("failed");
      sending.current = false;
    }
  }
  async function sendTyped(...args: Parameters<typeof chat.send>) {
    if (unavailable || sending.current) return;
    sending.current = true;
    const measurement = responseTiming.start(args[0]);
    try {
      await chat.send(args[0], args[1], args[2], () => {
        measurement.firstText();
        args[3]?.();
      });
    } finally {
      measurement.finish();
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
  function newTopic() {
    if (sending.current) return;
    setTopicQuestions([]);
    history.current = [];
  }
  function resetDetection() {
    clearTimeout(timer.current);
    timer.current = undefined;
    clearTimeout(deadline.current);
    deadline.current = undefined;
    detector.current.reset();
    pendingTiming.current = null;
  }
  function reset() {
    generation.current++;
    responseTiming.reset();
    resetDetection();
    history.current = [];
    lastAutomatic.current = "";
    update([]);
    setAcceptedQuestions([]);
    setTopicQuestions([]);
    setNotice("");
  }
  return {
    cards,
    acceptedQuestions,
    topicCount: topicQuestions.length,
    newTopic,
    timing: responseTiming.timing,
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
