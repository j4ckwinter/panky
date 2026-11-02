import { INTERVIEW_LIMITS, type InterviewInput } from "@panky/shared";

export function interviewRetrievalQuery(
  question: string,
  input: InterviewInput,
) {
  const followsUp =
    question.length <= 160 &&
    /^(?:why\b|what (?:if|about|happens|would|were)\b|how (?:did|would|could|does|do|will|can)\b|(?:can|could|would) you\b|(?:and|but)\b)/i.test(
      question,
    ) &&
    /\b(that|this|it|those|these|they|them|your approach|your decision)\b/i.test(
      question,
    ) &&
    !/\b(new topic|switch topics|moving on|instead discuss)\b/i.test(question);
  if (!followsUp) return question;
  const turns: string[] = [];
  let chars = 0;
  for (const turn of [...(input.context ?? [])]
    .slice(-INTERVIEW_LIMITS.contextTurns)
    .reverse()) {
    const text = `${turn.question}\n${turn.spokenAnswer}`;
    if (chars + text.length > 8000) break;
    turns.push(text);
    chars += text.length;
  }
  return [question, ...turns].join("\n");
}
