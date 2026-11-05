import { HttpError } from "./http-utils.js";

export class ExecutionGate {
  private occupied = false;
  get busy() {
    return this.occupied;
  }
  acquire() {
    if (this.occupied)
      throw new HttpError(
        409,
        "Panky is already replying. Wait for the current response to finish.",
      );
    this.occupied = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.occupied = false;
    };
  }
}
