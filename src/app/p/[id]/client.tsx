"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ShieldCheck, Clock3, XCircle } from "lucide-react";

/**
 * A tela que o PAGADOR vê. Não é o painel — é a página que o seller manda no
 * WhatsApp.
 *
 * Por isso ela não usa nada do vocabulário do dashboard: sem sidebar, sem
 * tema do seller, sem jargão. Uma coisa só na tela: quanto pagar e como.
 */

type Estado = "aberto" | "pago" | "expirado";

export function PagamentoCliente({
  id,
  amountCents,
  estado: estadoInicial,
  copiaECola,
  qrCode,
  expiraEm,
}: {
  id: string;
  amountCents: number;
  estado: Estado;
  copiaECola: string;
  qrCode: string | null;
  expiraEm: string | null;
}) {
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const [copiado, setCopiado] = useState(false);

  /**
   * Confirma o pagamento sozinho.
   *
   * Sem isto o pagador paga no app do banco, volta pra esta aba e continua
   * vendo "aguardando" — e aí manda mensagem pro seller perguntando se caiu.
   * Usa o endpoint de status que JÁ existe (`/api/transactions/[id]/status`),
   * que devolve o mínimo e tem rate limit próprio de 120/min por IP.
   *
   * 4s: rápido o bastante pra parecer instantâneo depois do PIX, devagar o
   * bastante pra caber folgado no limite.
   */
  useEffect(() => {
    if (estado !== "aberto") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/transactions/${id}/status`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const d = (await r.json()) as { status?: string };
        if (d.status === "PAID") setEstado("pago");
        else if (d.status === "EXPIRED") setEstado("expirado");
      } catch {
        // Rede caiu no meio: manter o estado e tentar de novo no próximo
        // tick. Mostrar erro aqui assustaria quem acabou de pagar.
      }
    }, 4000);
    return () => clearInterval(t);
  }, [id, estado]);

  const valor = (amountCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(7,26,51,0.35)]">
        {estado === "pago" ? (
          <Final
            Icon={ShieldCheck}
            cor="text-emerald-600"
            fundo="bg-emerald-50"
            titulo="Pagamento confirmado"
            texto="Pode fechar esta página. O comprovante fica com quem te cobrou."
          />
        ) : estado === "expirado" ? (
          <Final
            Icon={XCircle}
            cor="text-slate-500"
            fundo="bg-slate-100"
            titulo="Esta cobrança expirou"
            texto="Peça um link novo para quem te enviou este."
          />
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Pague com PIX
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-[#071a33]">
              {valor}
            </p>
            {expiraEm && <Contagem ate={expiraEm} />}

            {qrCode && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code do PIX"
                className="mx-auto mt-5 size-56 rounded-xl border border-slate-200 bg-white object-contain p-2"
              />
            )}

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(copiaECola);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2500);
              }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#071a33] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0d2547] active:scale-[0.99]"
            >
              {copiado ? (
                <>
                  <Check className="size-4" /> Código copiado
                </>
              ) : (
                <>
                  <Copy className="size-4" /> Copiar código PIX
                </>
              )}
            </button>

            <p className="mt-3 text-center text-[12px] leading-relaxed text-slate-500">
              Abra o app do seu banco, escolha PIX{" "}
              <span className="whitespace-nowrap">Copia e Cola</span> e cole o
              código. A confirmação aparece aqui sozinha.
            </p>
          </>
        )}
      </div>

      <p className="mt-5 text-center text-[11px] text-slate-400">
        Pagamento processado pela Trilho
      </p>
    </main>
  );
}

function Final({
  Icon,
  cor,
  fundo,
  titulo,
  texto,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  cor: string;
  fundo: string;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="py-6 text-center">
      <span
        className={`inline-flex size-16 items-center justify-center rounded-2xl ${fundo} ${cor}`}
      >
        <Icon className="size-8" />
      </span>
      <h1 className="mt-4 text-lg font-bold text-[#071a33]">{titulo}</h1>
      <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-slate-500">
        {texto}
      </p>
    </div>
  );
}

/** Contagem regressiva até a expiração do PIX. */
function Contagem({ ate }: { ate: string }) {
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    // Calculado no EFEITO e não no render: o servidor e o navegador do
    // pagador têm relógios diferentes, e renderizar "faltam 59:58" no HTML
    // do servidor pra depois corrigir no cliente dá erro de hidratação.
    function tick() {
      setRestante(Math.max(0, new Date(ate).getTime() - Date.now()));
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [ate]);

  if (restante === null) return null;
  const min = Math.floor(restante / 60000);
  const seg = Math.floor((restante % 60000) / 1000);

  return (
    <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-slate-500">
      <Clock3 className="size-3.5" />
      {restante > 0
        ? `Expira em ${min}:${String(seg).padStart(2, "0")}`
        : "Expirado"}
    </p>
  );
}
