import {
  INTERVIEW_LIMITS,
  MESSAGE_MAX_CHARS,
  type Message,
} from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import type { TranscriptEntry } from "./audio/useLiveTranscription";
import { normalizeQuestion, QuestionDetector } from "./questionDetection";
import type { useChat } from "../useChat";

export type SpokenQuestion = {
  id: number;
  text: string;
  original: string;
  status: "draft" | "pending" | "failed";
};

export function useSpokenQuestions(chat: ReturnType<typeof useChat>) {
  const [topicQuestions, setTopicQuestions] = useState<string[]>([]);
  const [cards, setCards] = useState<SpokenQuestion[]>([]);
  const [acceptedQuestions, setAcceptedQuestions] = useState<
    {
      id: number;
      text: string;
      userMessageId: string;
      assistantMessageId: string;
    }[]
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
  function propose(text: string, automatic = false) {
    const value = text.trim().slice(0, MESSAGE_MAX_CHARS);
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
        status: "draft",
      },
    ]);
  }
  function settle() {
    clearTimeout(timer.current);
    clearTimeout(deadline.current);
    timer.current = undefined;
    deadline.current = undefined;
    const candidate = detector.current.flush();
    if (candidate) propose(candidate, true);
  }
  function onTranscript(entry: TranscriptEntry) {
    if (entry.source !== "shared") return;
    const candidate = detector.current.push(entry.text);
    if (candidate) propose(candidate, true);
    if (entry.endedAtPause && detector.current.pending) settle();
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
      await chat.send(submitted, {
        interview: {
          experience: "",
          inputSource: "speech",
          context: topicQuestions.map((question) => ({
            question,
            spokenAnswer: "",
          })),
          useExperience: true,
          useSources: true,
        },
        onAccepted: (messages) => {
          accepted = true;
          if (!mounted.current || generation.current !== current) return;
          setTopicQuestions((previous) =>
            [...previous, submitted].slice(-INTERVIEW_LIMITS.contextTurns),
          );
          history.current = [];
          remember(card.original);
          remember(submitted);
          setAcceptedQuestions((previous) =>
            [...previous, { id, text: submitted, ...messages }].slice(-20),
          );
          update(items.current.filter((item) => item.id !== id));
          setNotice("");
        },
      });
    } finally {
      if (!accepted) changeStatus("failed");
      sending.current = false;
    }
  }
  async function reply(text: string, question: Message, answer: Message) {
    const submitted = text.trim();
    if (
      unavailable ||
      sending.current ||
      !submitted ||
      !chat.runs.some(
        (run) =>
          run.userMessageId === question.id &&
          run.assistantMessageId === answer.id &&
          run.status === "completed",
      )
    )
      return false;
    sending.current = true;
    const current = generation.current;
    let accepted = false;
    const previous =
      chat.messages.findLast((message) => message.role === "user")?.id ===
        question.id && topicQuestions.at(-1) === question.content
        ? topicQuestions
        : [question.content];
    const truncated = "[Earlier response truncated]\n";
    const context = previous
      .slice(-INTERVIEW_LIMITS.contextTurns)
      .map((text, index, turns) => ({
        question: text,
        spokenAnswer: "",
        ...(index === turns.length - 1
          ? {
              assistantResponse:
                answer.content.length > INTERVIEW_LIMITS.assistantResponseChars
                  ? `${truncated}${answer.content.slice(-(INTERVIEW_LIMITS.assistantResponseChars - truncated.length))}`
                  : answer.content,
            }
          : {}),
      }));
    try {
      await chat.send(submitted, {
        interview: {
          experience: "",
          inputSource: "typed",
          context,
          useExperience: true,
          useSources: true,
        },
        onAccepted: (messages) => {
          accepted = true;
          if (!mounted.current || generation.current !== current) return;
          setTopicQuestions(
            [...previous, submitted].slice(-INTERVIEW_LIMITS.contextTurns),
          );
          history.current = [];
          remember(submitted);
          setAcceptedQuestions((items) =>
            [
              ...items,
              { id: nextId.current++, text: submitted, ...messages },
            ].slice(-20),
          );
          setNotice("");
        },
      });
      return accepted;
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
  }
  return {
    cards,
    acceptedQuestions,
    topicCount: topicQuestions.length,
    newTopic,
    notice,
    unavailable,
    onTranscript,
    resetDetection,
    propose,
    edit,
    dismiss,
    submit,
    review,
    reply,
  };
}
