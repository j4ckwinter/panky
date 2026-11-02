export function mockInterviewReply(question: string) {
  const technical =
    /\b(system|design|technical|cache|database|typescript|react|api|scal|concurren|latency|code|algorithm|index|transaction)\w*/i.test(
      question,
    );
  return technical
    ? `Suggested approach (synthetic demo): clarify the workload, constraints and success criteria.

- Start with the simplest design that meets those constraints.
- Discuss one tradeoff and one failure case before adding complexity.
- No personal experience has been verified; connect this to a real example only if you have one.

This is a deterministic synthetic demo, not a model-generated technical answer. No AI model, Notion retrieval or tools were used. The demo does not analyse your pasted experience.

Suggested approach: explain your assumptions, outline the request and data flow, then describe how you would measure the design. Ask for missing requirements before making a precise claim.`
    : `Synthetic example only: a fictional engineer helped migrate an internal reporting service.

- Their contribution was comparing two rollout options and proposing a staged release.
- The fictional team used a rollback rehearsal to resolve disagreement.
- No measured outcome is supplied; do not invent one or present this story as your experience.

This is a deterministic synthetic demo using a fictional migration story. No AI model, Notion retrieval or tools were used. The demo does not analyse your pasted experience.

Suggested approach: describe the situation, your own decision and the evidence behind it, then give an outcome you can substantiate. Replace the synthetic story with a relevant real example when evaluating the local model.`;
}
