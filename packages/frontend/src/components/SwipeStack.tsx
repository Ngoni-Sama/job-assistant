"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Check } from "lucide-react";

const THRESHOLD = 110;

/** Generic Tinder-style swipe stack. Drag, arrow keys, or buttons. */
export function SwipeStack<T>({
  items,
  getKey,
  renderCard,
  onDecision,
  rightLabel = "YES",
  leftLabel = "NO",
  emptyState,
}: {
  items: T[];
  getKey: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  onDecision: (item: T, liked: boolean) => void;
  rightLabel?: string;
  leftLabel?: string;
  emptyState?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const startRef = useRef({ x: 0, y: 0 });

  const current = items[index];
  const done = index >= items.length;

  const decide = useCallback(
    (liked: boolean) => {
      if (!current || exiting) return;
      setExiting(liked ? "right" : "left");
      onDecision(current, liked);
      setTimeout(() => {
        setIndex((i) => i + 1);
        setDrag({ x: 0, y: 0, active: false });
        setExiting(null);
      }, 260);
    },
    [current, exiting, onDecision],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") decide(true);
      if (e.key === "ArrowLeft") decide(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  function onPointerDown(e: React.PointerEvent) {
    if (exiting) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.active) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y, active: true });
  }
  function onPointerUp() {
    if (!drag.active) return;
    if (drag.x > THRESHOLD) return decide(true);
    if (drag.x < -THRESHOLD) return decide(false);
    setDrag({ x: 0, y: 0, active: false });
  }

  if (done) {
    return <>{emptyState ?? <div className="glass rounded-3xl p-10 text-center text-gray-500">All done!</div>}</>;
  }

  const dx = exiting === "right" ? 600 : exiting === "left" ? -600 : drag.x;
  const rot = dx / 18;
  const yes = Math.min(Math.max(dx / THRESHOLD, 0), 1);
  const no = Math.min(Math.max(-dx / THRESHOLD, 0), 1);

  return (
    <div className="mx-auto max-w-sm">
      <div className="relative h-[440px] select-none">
        {items[index + 1] && (
          <div className="absolute inset-0 top-3 scale-95 opacity-60">{renderCard(items[index + 1])}</div>
        )}
        <div
          className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            transform: `translate(${dx}px, ${drag.y * 0.15}px) rotate(${rot}deg)`,
            transition: drag.active ? "none" : "transform 0.26s ease-out",
          }}
        >
          <div className="relative">
            {renderCard(current)}
            <Badge label={rightLabel} color="green" opacity={yes} rotate={-15} side="left" />
            <Badge label={leftLabel} color="red" opacity={no} rotate={15} side="right" />
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-6">
        <button
          onClick={() => decide(false)}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-red-500 shadow-xl transition-transform hover:scale-110 active:scale-95"
          aria-label={leftLabel}
        >
          <X className="h-7 w-7" />
        </button>
        <button
          onClick={() => decide(true)}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-xl transition-transform hover:scale-110 active:scale-95"
          aria-label={rightLabel}
        >
          <Check className="h-7 w-7" />
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">Swipe or drag · ← {leftLabel} · → {rightLabel}</p>
    </div>
  );
}

function Badge({
  label,
  color,
  opacity,
  rotate,
  side,
}: {
  label: string;
  color: "green" | "red";
  opacity: number;
  rotate: number;
  side: "left" | "right";
}) {
  return (
    <div
      className={`pointer-events-none absolute top-8 ${side === "left" ? "left-6" : "right-6"} rounded-lg border-4 px-3 py-1 text-xl font-extrabold ${
        color === "green" ? "border-green-500 text-green-500" : "border-red-500 text-red-500"
      }`}
      style={{ opacity, transform: `rotate(${rotate}deg)` }}
    >
      {label}
    </div>
  );
}
