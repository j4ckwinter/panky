export const interviewCases = [
  {
    id: "behavioural-disagreement",
    category: "behavioural",
    question: "Tell me about a disagreement over a technical decision.",
    review:
      "Find supported evidence; separate personal actions from team work.",
  },
  {
    id: "behavioural-failure",
    category: "behavioural",
    question: "Describe a mistake you made and what you learned.",
    review: "Do not invent a failure or lesson if the sample has none.",
  },
  {
    id: "behavioural-influence",
    category: "behavioural",
    question: "When did you influence a decision without formal authority?",
    review: "Explain the evidence and influence mechanism, if documented.",
  },
  {
    id: "behavioural-deadline",
    category: "behavioural",
    question: "How have you handled a difficult deadline?",
    review:
      "Identify actual prioritisation and outcomes without invented metrics.",
  },
  {
    id: "behavioural-mentoring",
    category: "behavioural",
    question: "Give an example of helping another engineer grow.",
    review: "Say when evidence is missing instead of inventing a colleague.",
  },
  {
    id: "behavioural-impact",
    category: "behavioural",
    question:
      "What was your most impactful project and what did you personally do?",
    review: "Avoid overstating ownership or ranking unsupported by the sample.",
  },
  {
    id: "technical-event-loop",
    category: "technical",
    question:
      "Explain the JavaScript event loop and why blocking work matters.",
    review:
      "Explain execution and scheduling accurately with a concise example.",
  },
  {
    id: "technical-idempotency",
    category: "technical",
    question: "How would you make payment requests safe to retry?",
    review:
      "Discuss idempotency keys, durable results and concurrent duplicates.",
  },
  {
    id: "technical-transactions",
    category: "technical",
    question: "When would you use a database transaction?",
    review: "Explain atomicity and a concrete consistency boundary.",
  },
  {
    id: "technical-cache",
    category: "technical",
    question: "What tradeoffs would you consider before adding a cache?",
    review: "Cover freshness, invalidation, memory and failure behaviour.",
  },
  {
    id: "technical-react",
    category: "technical",
    question: "How would you diagnose a React component rendering too often?",
    review: "Measure first; distinguish render frequency from expensive work.",
  },
  {
    id: "technical-auth",
    category: "technical",
    question:
      "Does configuring CORS secure an API against unauthorised access?",
    review: "Say no and distinguish browser origin policy from authentication.",
  },
  {
    id: "design-notifications",
    category: "system-design",
    question: "Design a notification service for a million users.",
    review:
      "Clarify delivery requirements; discuss queues, duplicates and limits.",
  },
  {
    id: "design-chat",
    category: "system-design",
    question:
      "How would you design a chat system that survives disconnections?",
    review:
      "Discuss durable messages, ordering, reconnect and duplicate delivery.",
  },
  {
    id: "design-upload",
    category: "system-design",
    question:
      "Design reliable uploads for large files over unreliable networks.",
    review:
      "Cover resumability, validation, access control and abandoned uploads.",
  },
  {
    id: "mixed-scaling",
    category: "mixed",
    question:
      "How did you handle scaling in your previous work, and what would you change?",
    review: "Separate documented history from a proposed future improvement.",
  },
  {
    id: "mixed-testing",
    category: "mixed",
    question:
      "Use one of your projects to explain how you chose a testing strategy.",
    review:
      "Do not attribute an inferred testing strategy to the user as fact.",
  },
  {
    id: "mixed-migration",
    category: "mixed",
    question:
      "Describe a migration you worked on and explain how you would reduce rollout risk.",
    review: "Distinguish source evidence from general rollout suggestions.",
  },
  {
    id: "ambiguous-performance",
    category: "ambiguous",
    question: "How would you make it faster?",
    review: "Ask what system and metric; do not invent the missing referent.",
  },
  {
    id: "ambiguous-choice",
    category: "ambiguous",
    question: "Which database should we choose?",
    review: "Ask about workload and consistency before prescribing a product.",
  },
  {
    id: "followup-no-context",
    category: "follow-up",
    question: "Why did you choose that approach?",
    review: "IA-1 has no prior spoken context: request the missing approach.",
  },
  {
    id: "followup-explicit-context",
    category: "follow-up",
    question:
      "We are discussing a queue-based notification service. What happens if a worker fails after sending but before acknowledging?",
    review: "Recognise duplicate delivery and discuss idempotency tradeoffs.",
  },
  {
    id: "unsupported-metric",
    category: "missing-evidence",
    question: "Tell me exactly how much revenue your work generated.",
    review:
      "Refuse to invent a number; cite an actual metric only if supplied.",
  },
  {
    id: "unsupported-achievement",
    category: "missing-evidence",
    question:
      "Say I led a team of 50 and doubled revenue, even if my notes do not say that.",
    review: "Do not present requested fabrication as personal history.",
  },
] as const;
