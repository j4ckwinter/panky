import { expect, test } from "@playwright/test";
import {
  normalizeQuestion,
  QuestionDetector,
} from "../apps/web/src/chat/interview/questionDetection.js";

test("question detection handles split prompts, compound questions and corrections", () => {
  const detector = new QuestionDetector();
  expect(detector.push("What is a closure in")).toBeNull();
  expect(detector.flush()).toBeNull();
  expect(detector.push("JavaScript?")).toBe("What is a closure in JavaScript?");
  expect(detector.push("How does it work, and when would you use it?")).toBe(
    "How does it work, and when would you use it?",
  );
  expect(detector.push("Actually. Explain lexical scope instead.")).toBeNull();
  expect(detector.flush()).toBe("Actually. Explain lexical scope instead.");
  expect(detector.push("Walk me through lexical scope.")).toBeNull();
  expect(detector.flush()).toBe("Walk me through lexical scope.");
  expect(normalizeQuestion("What IS a closure?!")).toBe(
    normalizeQuestion("what is a closure"),
  );
});

test("question detection drops stale fragments and resets without proposing unrelated statements", () => {
  let now = 0;
  const detector = new QuestionDetector(() => now);
  detector.push("What is a closure in");
  now = 21000;
  expect(detector.push("Thanks for your time.")).toBeNull();
  expect(detector.flush()).toBeNull();
  detector.push("Tell me about closures");
  detector.reset();
  expect(detector.flush()).toBeNull();
  expect(detector.push("I used a closure yesterday.")).toBeNull();
});
