import { PankyMark } from "./PankyMark";

export function Brand() {
  return (
    <div className="brand">
      <PankyMark />
      <span>
        Panky<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
