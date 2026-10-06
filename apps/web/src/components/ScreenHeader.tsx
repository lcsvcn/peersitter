import type { ReactNode } from "react";
import { ChevronLeftIcon } from "./Icon";

interface Props {
  title: string;
  onBack: () => void;
  trailing?: ReactNode;
}

/** Top app bar: a clearly labelled Back button, the screen title, and optional trailing actions. */
export default function ScreenHeader({ title, onBack, trailing }: Props) {
  return (
    <header className="appbar">
      <button className="back" onClick={onBack}>
        <ChevronLeftIcon size={22} />
        Back
      </button>
      <h2>{title}</h2>
      {trailing && <div className="appbar-trailing">{trailing}</div>}
    </header>
  );
}
