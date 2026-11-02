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
    review:
      "No prior spoken context is supplied: request the missing approach.",
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

export const interviewSequences = [
  {
    id: "technical-retries",
    category: "technical-follow-up",
    turns: [
      {
        question: "How would you make payment requests safe to retry?",
        spokenAnswer:
          "I proposed a client idempotency key and a durable record of the request and result. This is a design proposal, not a past achievement.",
        review:
          "Explain a durable uniqueness boundary and concurrent duplicate handling without claiming personal experience.",
      },
      {
        question: "Why that approach?",
        spokenAnswer:
          "I said the durable unique key prevents two workers from independently accepting the same operation.",
        review:
          "Resolve the reference to idempotency, discuss alternatives, and distinguish a proposed design from work the user has done.",
      },
      {
        question:
          "What if the provider charges the card but our database write fails?",
        spokenAnswer: "",
        review:
          "Recognise the external side-effect gap; discuss provider idempotency, reconciliation and uncertainty rather than promising exactly-once execution.",
      },
    ],
  },
  {
    id: "design-constraints",
    category: "design-follow-up",
    turns: [
      {
        question: "Design a notification service.",
        spokenAnswer:
          "I asked about channels and delivery guarantees. The interviewer specified email, a million users and at-least-once delivery.",
        review:
          "Ask about missing requirements before prescribing scale, delivery guarantees or infrastructure.",
      },
      {
        question: "What tradeoffs would you make?",
        spokenAnswer:
          "I proposed queue workers with bounded retries and a dead-letter queue. Duplicate emails remain possible.",
        review:
          "Use the explicit email and delivery requirements; discuss duplicate handling and retry limits without inventing latency targets.",
      },
      {
        question: "What if that fails?",
        spokenAnswer: "",
        review:
          "Refer to the queue/worker proposal, clarify the failure mode where needed, and cover backpressure and recovery without pretending guarantees were agreed.",
      },
    ],
  },
  {
    id: "mixed-contribution",
    category: "mixed-follow-up",
    turns: [
      {
        question:
          "Use a project from my supplied experience to explain a technical tradeoff.",
        spokenAnswer:
          "I said I need to check my notes before claiming ownership or an outcome. I have not repeated any suggested project story.",
        review:
          "Use only supported personal evidence and distinguish a suggested framing from what the user actually said.",
      },
      {
        question: "What did I personally contribute?",
        spokenAnswer:
          "I said I can only claim contributions explicitly documented in my notes.",
        review:
          "Do not turn the prior generated suggestion into a spoken statement or personal achievement. Identify any evidence gap.",
      },
      {
        question: "What would you change next time?",
        spokenAnswer: "",
        review:
          "Label future improvements as suggestions, not past actions, and ask which project if the context still lacks a supported referent.",
      },
    ],
  },
  {
    id: "topic-change",
    category: "topic-change",
    turns: [
      {
        question: "How would you diagnose a slow React screen?",
        spokenAnswer:
          "I proposed profiling component renders before optimising.",
        review: "Offer measurable hypotheses, not an unsupported diagnosis.",
      },
      {
        question: "New topic: explain database transaction isolation levels.",
        spokenAnswer:
          "I described isolation as controlling which concurrent changes a transaction can observe, with engine-specific details.",
        review:
          "Answer the new database topic without forcing React profiling into the explanation; acknowledge database-specific behaviour.",
      },
      {
        question: "Can you give an example of that?",
        spokenAnswer: "",
        review:
          "Resolve the nearest topic to transaction isolation, not React. Provide an accurate concurrent schedule and qualify engine-specific semantics.",
      },
    ],
  },
] as const;
