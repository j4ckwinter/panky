const stopWords = new Set(
  "a an and are as at be been but by can could describe did do does for from give had has have how i in into is it me my of on or our should tell than that the their them then there these they this to us use used using was we were what when where which who why will with would you your about example experience project work worked approach situation outcome explain choose chosen choice decision personally most one something make made".split(
    " ",
  ),
);

const equivalents = [
  ["conflict", "disagreement", "disagree", "debate"],
  ["mentor", "mentoring", "mentorship", "coach", "coaching"],
  ["migration", "migrate", "migrating", "migrated"],
  ["deploy", "deployment", "rollout", "release", "shipping"],
  ["latency", "performance", "slow", "speed"],
  ["scale", "scaling", "scalability"],
  ["incident", "outage", "downtime"],
  ["test", "testing", "tests", "qa"],
];

export function experienceQuery(question: string): string | undefined {
  const words = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]+/gu))]
    .filter(
      (word) => word.length >= 3 && word.length <= 64 && !stopWords.has(word),
    )
    .slice(0, 16);
  if (!words.length) return undefined;
  return words
    .map((word) => {
      const terms = equivalents.find((group) => group.includes(word)) ?? [word];
      return `(${terms.map((term) => `"${term}"`).join(" OR ")})`;
    })
    .join(" OR ");
}
