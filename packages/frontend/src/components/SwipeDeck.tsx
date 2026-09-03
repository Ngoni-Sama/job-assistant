"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Building2, X, Heart } from "lucide-react";
import type { JobListing } from "@/lib/types";

const THRESHOLD = 110; // px drag before a swipe counts

export function SwipeDeck({
  jobs,
  onDecision,
}: {
  jobs: JobListing[];
  onDecision: (job: JobListing, liked: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const startRef = useRef({ x: 0, y: 0 });

  const current = jobs[index];
  const done = index >= jobs.length;

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

  // Keyboard support on web
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
    setDrag({ x: 0, y: 0, active: false }); // snap back
  }

  if (done) {
    return (
      <div className="glass rounded-3xl p-10 text-center">
        <Heart className="mx-auto h-10 w-10 text-brand-600" />
        <h3 className="mt-3 text-xl font-bold">All caught up!</h3>
        <p className="mt-1 text-gray-600">You’ve been through every current listing.</p>
      </div>
    );
  }

  // Transform for the top card
  const dx = exiting === "right" ? 600 : exiting === "left" ? -600 : drag.x;
  const rot = dx / 18;
  const likeOpacity = Math.min(Math.max(dx / THRESHOLD, 0), 1);
  const nopeOpacity = Math.min(Math.max(-dx / THRESHOLD, 0), 1);

  return (
    <div className="mx-auto max-w-sm">
      <div className="relative h-[420px] select-none">
        {/* Peek of next card for depth */}
        {jobs[index + 1] && (
          <div className="absolute inset-0 top-3 scale-95">
            <Card job={jobs[index + 1]} muted />
          </div>
        )}

        {/* Active card */}
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
          <Card job={current}>
            <Badge label="APPLY" color="green" opacity={likeOpacity} rotate={-15} side="left" />
            <Badge label="SKIP" color="red" opacity={nopeOpacity} rotate={15} side="right" />
          </Card>
        </div>
      </div>

      {/* Floating action buttons */}
      <div className="mt-6 flex items-center justify-center gap-6">
        <button
          onClick={() => decide(false)}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-red-500 shadow-xl transition-transform hover:scale-110 active:scale-95"
          aria-label="Skip"
        >
          <X className="h-7 w-7" />
        </button>
        <button
          onClick={() => decide(true)}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-xl transition-transform hover:scale-110 active:scale-95"
          aria-label="Interested"
        >
          <Heart className="h-7 w-7" />
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        Swipe or drag · ← skip · → interested
      </p>
    </div>
  );
}

function Card({
  job,
  muted,
  children,
}: {
  job: JobListing;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`glass-strong relative flex h-[420px] flex-col overflow-hidden rounded-3xl p-6 ${
        muted ? "opacity-60" : ""
      }`}
    >
      {children}
      <div className="mt-2">
        {job.sector && (
          <span className="rounded-full bg-violet-100/70 px-2.5 py-1 text-xs font-medium text-violet-700">
            {job.sector}
          </span>
        )}
      </div>
      <h3 className="mt-4 text-2xl font-extrabold leading-tight">{job.title}</h3>
      <p className="mt-2 flex items-center gap-1.5 text-gray-600">
        <Building2 className="h-4 w-4" /> {job.company}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-gray-500">
        <MapPin className="h-4 w-4" /> {job.location}
        {job.jobType && <span className="ml-1 text-gray-400">· {job.jobType}</span>}
      </p>
      {job.description && (
        <p className="mt-4 line-clamp-5 text-sm text-gray-600">{job.description}</p>
      )}
      {job.expiryDate && (
        <p className="mt-auto text-xs text-amber-700">Closes {job.expiryDate}</p>
      )}
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
      className={`pointer-events-none absolute top-8 ${
        side === "left" ? "left-6" : "right-6"
      } rounded-lg border-4 px-3 py-1 text-xl font-extrabold ${
        color === "green" ? "border-green-500 text-green-500" : "border-red-500 text-red-500"
      }`}
      style={{ opacity, transform: `rotate(${rotate}deg)` }}
    >
      {label}
    </div>
  );
}
