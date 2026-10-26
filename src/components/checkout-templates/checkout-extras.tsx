"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SEALS } from "./configs";
import type { SecuritySealKind, SecuritySealItem } from "./configs";
import {
  ShieldCheck,
  Award,
  Lock,
  Zap,
  Rocket,
  HeartHandshake,
  Clock,
} from "lucide-react";

/**
 * 30/07/2026 (davi 'algumas opcoes do checkout n estao funcionando, mesmo
 * ativando — contador, banner, selos').
 *
 * CAUSA RAIZ: banner de texto, contador de escassez, selos de segurança e o
 * botão flutuante de WhatsApp só existiam no renderer LEGADO de /c/[slug]
 * (o bloco gigante depois do "template dispatcher"). Esse renderer só roda
 * quando o checkout NÃO tem template — mas o default do builder é "extra",
 * ou seja: 100% dos checkouts reais caem no TemplateRenderer, que nunca
 * montava nenhum desses widgets.
 *
 * Resultado: o seller ligava o toggle, via funcionar no PREVIEW do builder
 * (que tem render próprio) e no checkout público não acontecia nada.
 *
 * Este arquivo centraliza os 4 widgets pra que o TemplateRenderer monte
 * todos, em QUALQUER template. Mesmo remédio que já tinha sido aplicado nos
 * Depoimentos (ver testimonials.tsx).
 *
 * Estilo: claro/neutro, porque os templates públicos são light-mode.
 */

/* ============================ Banner de texto ============================ */

export function TextBanner({
  text,
  bg,
  color,
}: {
  text: string;
  bg?: string;
  color?: string;
}) {
  if (!text?.trim()) return null;
  return (
    <div
      className="w-full px-4 py-2 text-center text-[13px] font-semibold leading-snug"
      style={{ background: bg || "#22d3ee", color: color || "#000000" }}
    >
      {text}
    </div>
  );
}

/* ========================= Contador de escassez ========================= */

/**
 * Contador regressivo. Persiste o deadline em sessionStorage por slug pra
 * não "resetar" quando o cliente troca de aba / volta do app do banco —
 * senão a escassez fica obviamente falsa e o cliente perde a urgência.
 */
export function ScarcityCountdown({
  minutes,
  label,
  primaryColor = "#16a34a",
  storageKey,
  bg,
  color,
}: {
  minutes: number;
  label: string;
  primaryColor?: string;
  storageKey?: string;
  /**
   * 30/07/2026 (davi 'o contador ta sem opcao de selecionar as cores'):
   * quando o seller escolhe cores no builder elas vêm por aqui. Sem escolha,
   * mantém o comportamento antigo — derivado do primaryColor do checkout.
   */
  bg?: string;
  color?: string;
}) {
  const total = Math.max(1, Math.min(1440, minutes || 15)) * 60;
  const [secondsLeft, setSecondsLeft] = useState(total);

  useEffect(() => {
    const key = `tp_cd_${storageKey || "default"}`;
    let deadline = 0;
    try {
      const raw = sessionStorage.getItem(key);
      const parsed = raw ? Number(raw) : 0;
      // Ignora deadline salvo já vencido ou incoerente (ex: seller mudou a
      // duração no builder) — recomeça do zero.
      if (parsed > Date.now() && parsed - Date.now() <= total * 1000) {
        deadline = parsed;
      }
    } catch {
      // sessionStorage bloqueado (modo privado/iframe) — segue sem persistir
    }
    if (!deadline) {
      deadline = Date.now() + total * 1000;
      try {
        sessionStorage.setItem(key, String(deadline));
      } catch {
        // ignora
      }
    }

    const tick = () =>
      setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [total, storageKey]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const done = secondsLeft <= 0;

  // Cores do seller têm prioridade. Sem escolha, cai no derivado do
  // primaryColor (fundo com 12% de opacidade + texto na cor cheia), que é
  // exatamente como o contador sempre se comportou.
  const activeBg = bg || `${primaryColor}1f`;
  const activeColor = color || primaryColor;
  // Estado "encerrado" segue vermelho SÓ quando o seller não escolheu cor —
  // aí o vermelho é convenção. Se ele escolheu, respeita a escolha dele em
  // vez de trocar a cor da barra na cara do cliente.
  const finalBg = done ? (bg ? bg : "#fef2f2") : activeBg;
  const finalColor = done ? (color ? color : "#b91c1c") : activeColor;

  return (
    <div
      className="flex w-full items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold"
      style={{ background: finalBg, color: finalColor }}
    >
      <Clock className="size-4 shrink-0" />
      <span>{done ? "Oferta encerrada" : label}</span>
      {!done && (
        <span className="rounded-md bg-black/10 px-2 py-0.5 font-mono text-[13px] tabular-nums">
          {mm}:{ss}
        </span>
      )}
    </div>
  );
}

/* ====================== Imagem de rodapé do checkout ====================== */

/**
 * 30/07/2026 (davi): "ele quer que tenha uma opcao tambem de botar uma imagem
 * logo abaixo ali da mensagem" — a mensagem sendo o texto de termos que fica
 * embaixo do botão de gerar PIX.
 *
 * Renderiza LOGO DEPOIS do card do checkout e ANTES dos selos/depoimentos,
 * que é exatamente o espaço marcado no print. Serve pra formas de pagamento,
 * selos de terceiro (Reclame Aqui, SSL), garantia, etc.
 *
 * Por padrão acompanha a largura do card do checkout (max-w-md, igual todos
 * os templates usam). `fullWidth` estica de ponta a ponta, igual o banner do
 * topo, pra quem enviar uma arte larga.
 *
 * Mesmo fallback do BannerImage: se a imagem falhar (blob antigo bloqueado),
 * some em vez de mostrar a caixa quebrada.
 */
export function FooterImage({
  src,
  href,
  fullWidth = false,
}: {
  src: string;
  href?: string | null;
  fullWidth?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src?.trim() || failed) return null;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="block h-auto w-full"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );

  const content =
    href && /^https?:\/\//i.test(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full"
      >
        {img}
      </a>
    ) : (
      img
    );

  if (fullWidth) return <div className="w-full">{content}</div>;
  return <div className="mx-auto w-full max-w-md px-4 pb-4 pt-1">{content}</div>;
}

/* ========================= Selos de segurança ========================= */

// Tipos e DEFAULT_SEALS vivem em ./configs (módulo neutro) — este arquivo é
// "use client" e o Server Component do checkout precisa ler o array de verdade.
// Re-exportados aqui só pra não quebrar quem já importava deste caminho.
// ⚠️ Quem importa do SERVER tem que importar de ./configs, não daqui: passando
// por um módulo "use client" o array volta a virar proxy de referência.
export type { SecuritySealKind, SecuritySealItem };
export { DEFAULT_SEALS };

const SEAL_ICONS = {
  shield: ShieldCheck,
  award: Award,
  lock: Lock,
  zap: Zap,
  rocket: Rocket,
  handshake: HeartHandshake,
} as const;

export function SecuritySeals({
  items,
  primaryColor = "#16a34a",
}: {
  items: SecuritySealItem[];
  primaryColor?: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <section className="border-t border-zinc-200 bg-zinc-50 px-4 py-6">
      <div className="mx-auto grid max-w-md gap-2 sm:grid-cols-3">
        {items.map((s, i) => {
          const Icon = SEAL_ICONS[s.icon] || ShieldCheck;
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-100"
            >
              <Icon
                className="size-5 shrink-0"
                style={{ color: primaryColor }}
              />
              <div className="min-w-0">
                <p className="truncate text-[12px] font-bold text-zinc-800">
                  {s.title}
                </p>
                {s.text && (
                  <p className="truncate text-[10px] text-zinc-500">{s.text}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ======================= Botão flutuante WhatsApp ======================= */

export function WhatsAppFloat({
  number,
  text,
}: {
  number: string;
  text?: string;
}) {
  const digits = (number || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const href = `https://wa.me/${digits}${
    text ? `?text=${encodeURIComponent(text)}` : ""
  }`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-[60] inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
    >
      <svg viewBox="0 0 24 24" className="size-5 fill-current">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
      Suporte
    </a>
  );
}
