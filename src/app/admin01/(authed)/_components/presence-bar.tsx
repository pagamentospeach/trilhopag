"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Lock, Radio } from "lucide-react";
import { takeoverAdminTab } from "../../actions";

type Peer = {
  adminId: string;
  name: string;
  email: string;
  path: string;
  label: string;
  claimedAt: string;
  self: boolean;
};

type State = {
  peers: Peer[];
  lockedBy: { adminId: string; name: string } | null;
  canEdit: boolean;
};

const HEARTBEAT_MS = 10_000;

/** Cor estável por pessoa — mesma inicial, mesma cor, em qualquer sessão. */
const DOT_COLORS = [
  "bg-emerald-400",
  "bg-sky-400",
  "bg-fuchsia-400",
  "bg-amber-400",
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DOT_COLORS[h % DOT_COLORS.length];
}

/**
 * Barra de presença ao vivo + trava de edição.
 *
 * 08/08/2026 (davi): "cria algo mostrando quem esta ao vivo mexendo no admin
 * e em que aba a pessoa esta AO VIVO, de um jeito que evite 100% um de mexer
 * em algo que outro ja esta mexendo".
 *
 * Manda heartbeat a cada 10s com a rota atual. Quem entrou primeiro numa aba
 * fica com o controle; os outros veem a aba em modo leitura (o conteúdo fica
 * `inert`, então nem clique nem foco nem atalho passam) com um botão de
 * "assumir controle".
 *
 * Isto é coordenação entre sócios, não segurança — a Server Action confere o
 * mesmo lock no servidor (`requireAdminWrite`), então burlar o overlay não
 * adianta.
 */
export function PresenceBar({
  labels,
  onLockChange,
}: {
  /** href → nome bonito da aba, pra mostrar "Lucas · Saques". */
  labels: Record<string, string>;
  onLockChange: (locked: boolean) => void;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<State | null>(null);
  const [taking, setTaking] = useState(false);
  // Mantém o valor mais recente sem re-armar o intervalo a cada navegação.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  const ping = useCallback(async () => {
    try {
      const path = pathRef.current || "/admin01";
      const res = await fetch("/api/admin/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathname: path,
          label: labelsRef.current[path] ?? "",
        }),
        cache: "no-store",
      });
      if (!res.ok) return;
      setState((await res.json()) as State);
    } catch {
      // rede caiu — mantém o último estado e tenta de novo no próximo tick
    }
  }, []);

  useEffect(() => {
    void ping();
    const id = setInterval(ping, HEARTBEAT_MS);
    // Voltou pra aba do navegador: atualiza na hora, sem esperar o tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Fechou/recarregou: some da lista imediatamente. keepalive porque o
    // fetch normal é cancelado no unload.
    const onLeave = () => {
      navigator.sendBeacon?.("/api/admin/presence/leave");
    };
    window.addEventListener("pagehide", onLeave);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [ping]);

  // Trocou de aba → reivindica a nova imediatamente.
  useEffect(() => {
    void ping();
  }, [pathname, ping]);

  const locked = !!state && !state.canEdit;
  useEffect(() => {
    onLockChange(locked);
  }, [locked, onLockChange]);

  async function takeover() {
    setTaking(true);
    try {
      const r = await takeoverAdminTab(pathname || "/admin01");
      if (r.ok) setState(r.state as State);
    } finally {
      setTaking(false);
    }
  }

  const peers = state?.peers ?? [];
  const others = peers.filter((p) => !p.self);

  return (
    <>
      <div className="sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/[0.06] bg-zinc-950/90 px-4 py-2 backdrop-blur">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          <Radio className="size-3 text-emerald-400" />
          Ao vivo
        </span>

        {peers.length === 0 && (
          <span className="text-[11px] text-zinc-600">conectando…</span>
        )}

        {peers.map((p) => (
          <span
            key={p.adminId}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
              p.self
                ? "border-white/10 bg-white/[0.04] text-zinc-300"
                : "border-white/[0.06] bg-white/[0.02] text-zinc-400"
            }`}
            title={p.email}
          >
            <span
              className={`size-1.5 rounded-full ${colorFor(p.adminId)} ${
                p.self ? "" : "animate-pulse"
              }`}
            />
            <strong className="font-semibold text-zinc-200">
              {p.name}
              {p.self && " (você)"}
            </strong>
            {p.label && (
              <span className="text-zinc-500">· {p.label}</span>
            )}
          </span>
        ))}

        {others.length === 0 && peers.length > 0 && (
          <span className="text-[11px] text-zinc-600">
            só você no painel agora
          </span>
        )}
      </div>

      {locked && state?.lockedBy && (
        <div className="sticky top-[37px] z-40 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5">
          <p className="inline-flex items-center gap-2 text-[12px] text-amber-200">
            <Lock className="size-3.5 shrink-0" />
            <span>
              <strong className="font-bold">{state.lockedBy.name}</strong> está
              mexendo nesta aba. Você está em <strong>modo leitura</strong> pra
              não desfazer o que ele está fazendo.
            </span>
          </p>
          <button
            type="button"
            onClick={takeover}
            disabled={taking}
            className="shrink-0 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-black transition hover:bg-amber-300 disabled:opacity-60"
          >
            {taking ? "Assumindo…" : "Assumir controle"}
          </button>
        </div>
      )}
    </>
  );
}
