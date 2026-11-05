import type { PickFixture } from "@panky/shared";

export function formatMatchDate(date: string, full = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: full ? "long" : "short",
    day: "numeric",
    month: full ? "long" : "short",
    ...(full ? { year: "numeric" as const } : {}),
  });
}

export function formatTimestamp(date: string) {
  return new Date(date).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function fixtureDate(fixture: PickFixture, full = false) {
  if (!fixture.sample) return formatMatchDate(fixture.matchDate, full);
  return new Date(fixture.kickoff).toLocaleString(
    "en-GB",
    full
      ? {
          dateStyle: "full",
          timeStyle: "short",
        }
      : {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        },
  );
}
