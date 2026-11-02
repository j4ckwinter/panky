const questionCue =
  /(?:^|[.!?]\s+)(?:(?:okay|so|and|also)[,\s]+)?(?:what|why|how|when|where|who|which|can you|could you|would you|do you|does|is|are|have you|tell me|walk me through|explain|describe|compare|discuss|give me)\b/i;

export function normalizeQuestion(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Bounded heuristic over finalized shared-audio chunks, not an LLM classifier. */
export class QuestionDetector {
  private buffer = "";
  private startedAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  get pending() {
    return this.buffer.length > 0;
  }

  push(text: string): string | null {
    const value = text.trim();
    if (this.buffer && this.now() - this.startedAt > 20_000) this.reset();
    if (!value) return null;
    if (!this.buffer && !questionCue.test(value)) return null;
    if (!this.buffer) this.startedAt = this.now();
    this.buffer = `${this.buffer} ${value}`.trim().slice(0, 8000);
    return /\?\s*$/.test(this.buffer) ? this.flush() : null;
  }

  flush(): string | null {
    if (this.buffer && this.now() - this.startedAt > 20_000) this.reset();
    // Keep obvious split phrases for the next chunk instead of proposing fragments.
    if (/\b(?:a|an|the|of|in|to|and|is|are)[.!]?$/i.test(this.buffer))
      return null;
    const candidate = this.buffer;
    this.buffer = "";
    return candidate && questionCue.test(candidate) ? candidate : null;
  }

  reset() {
    this.buffer = "";
  }
}
