"use client";

import { useEffect, useState } from "react";

export function CountdownBar({
  minutes,
  label,
  primary,
  bg,
  color,
}: {
  minutes: number;
  label: string;
  primary: string;
  /** Cores escolhidas pelo seller no builder. Vazio = derivado do primary. */
  bg?: string;
  color?: string;
}) {
  const [secondsLeft, setSecondsLeft] = useState(Math.max(1, minutes) * 60);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div
      className="relative z-10 w-full px-4 py-2 text-center text-sm font-medium"
      style={{ background: bg || `${primary}22`, color: color || primary }}
    >
      ⏱ {label}{" "}
      <span className="ml-1 font-mono tabular-nums">
        {mm}:{ss}
      </span>
    </div>
  );
}
