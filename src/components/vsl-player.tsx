"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";

const PROGRESS_TICKS = [0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

export function VslPlayer({
  src,
  poster,
  sessionId,
  checkoutId,
  headline,
}: {
  src: string;
  poster?: string;
  sessionId: string;
  checkoutId?: string;
  headline?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const sentTicksRef = useRef<Set<number>>(new Set());

  function send(type: string, position: number, metadata?: Record<string, unknown>) {
    const body = JSON.stringify({
      session_id: sessionId,
      checkout_id: checkoutId,
      type,
      position: Math.floor(position),
      duration: Math.floor(duration),
      metadata,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/track/video",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      fetch("/api/track/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    function onLoaded() {
      setDuration(v!.duration || 0);
    }
    function onTime() {
      const cur = v!.currentTime;
      const dur = v!.duration || 0;
      setProgress(cur);
      if (dur > 0) {
        for (const t of PROGRESS_TICKS) {
          if (!sentTicksRef.current.has(t) && cur / dur >= t) {
            sentTicksRef.current.add(t);
            send("progress", cur, { ratio: t });
          }
        }
      }
    }
    function onEnded() {
      send("ended", v!.currentTime);
    }
    function onPlay() {
      send("play", v!.currentTime);
    }
    function onPause() {
      if (v!.currentTime > 0 && !v!.ended)
        send("pause", v!.currentTime);
    }
    function onSeeked() {
      send("seeked", v!.currentTime);
    }
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnded);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black">
      {headline && (
        <div className="border-b border-white/[0.06] px-5 py-3">
          <p className="text-sm font-medium text-white">{headline}</p>
        </div>
      )}
      <div className="relative aspect-video bg-black group">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          muted={muted}
          playsInline
          className="size-full"
          onClick={togglePlay}
        />
        {!playing && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/50 transition hover:bg-black/30"
            aria-label="Play"
          >
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-cyan-400 text-black">
              <Play className="size-7" />
            </span>
          </button>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition">
          <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-cyan-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-white">
            <button
              type="button"
              onClick={togglePlay}
              className="rounded p-1.5 hover:bg-white/10"
            >
              <Play className="size-4" />
            </button>
            <span className="font-mono">
              {formatTime(progress)} / {formatTime(duration)}
            </span>
            <button
              type="button"
              onClick={toggleMute}
              className="rounded p-1.5 hover:bg-white/10"
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
