"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, User, Receipt, Loader2, CornerDownLeft } from "lucide-react";

type Result = {
  type: "user" | "tx";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K / Ctrl+K abre. Esc fecha.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQ("");
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // Busca com debounce.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/search?q=${encodeURIComponent(q.trim())}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as { results: Result[] };
        setResults(data.results ?? []);
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [q]);

  const go = useCallback(
    (r: Result) => {
      setOpen(false);
      router.push(r.href);
    },
    [router],
  );

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-sm pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-white/[0.1] bg-zinc-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/[0.08] px-4">
          <Search className="size-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Buscar seller (email/nome/CPF) ou ID de transação…"
            className="flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-zinc-600"
          />
          {loading && <Loader2 className="size-4 text-zinc-500 animate-spin" />}
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {q.trim().length >= 2 && !loading && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">
              Nada encontrado.
            </p>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}`}
              type="button"
              onClick={() => go(r)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                i === active ? "bg-white/[0.06]" : ""
              }`}
            >
              <span className="shrink-0 text-zinc-500">
                {r.type === "user" ? (
                  <User className="size-4" />
                ) : (
                  <Receipt className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white">
                  {r.title}
                </span>
                <span className="block truncate text-[11px] text-zinc-500">
                  {r.subtitle}
                </span>
              </span>
              {i === active && (
                <CornerDownLeft className="size-3.5 shrink-0 text-zinc-500" />
              )}
            </button>
          ))}
        </div>
        <div className="border-t border-white/[0.06] px-4 py-2 text-[10px] text-zinc-600 flex items-center gap-3">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>esc fechar</span>
          <span className="ml-auto">⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
