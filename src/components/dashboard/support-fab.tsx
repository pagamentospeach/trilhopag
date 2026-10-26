"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * BOTÃO FLUTUANTE DE SUPORTE (06/08/2026, davi).
 *
 * "Apaga esse iconezinho de suporte dai, vamos fazer um iconezinho fixo ali em
 *  baixo com a nossa logo e quando passa o mouse em cima acontece isso do print
 *  que eu te mandei (exemplo da pingu!)"
 *
 * Fechado é só a logo da Trilho num círculo. No hover ele cresce pra pill
 * "Suporte" com o selo do WhatsApp na logo — igual ao print da PinguPag, mas
 * com a estética da Trilho (ciano, borda branca 8%, fundo escuro translúcido).
 *
 * ⚠️ CANTO INFERIOR *DIREITO*. FIX 06/08/2026, davi: "Vc n fez o icone fixo de
 * suporte que eu pedi! (...) ali em baixo no canto inferior DIREITO (fixo)".
 * Ele tinha sido entregue em `bottom-5 left-5` e ficava INVISÍVEL: a sidebar é
 * `sticky h-screen z-[60]` e ocupa exatamente o canto inferior esquerdo, então
 * o botão (z-40) renderizava ATRÁS dela. Nunca dava pra ver nem clicar. À
 * direita não há nada fixo além do WithdrawNudge/LockedOverlay, que foram
 * subidos pra `bottom-28` pra não sentar em cima dele.
 *
 * DESTINO (06/08/2026, davi: "faz com que leve isso pra pagina de suporte"):
 * vai pra /dashboard/suporte, não mais direto pro wa.me. Por isso virou
 * <Link> (navegação client-side, sem recarregar o dashboard) e perdeu o
 * target="_blank". O selo do WhatsApp fica: a página de suporte é justamente
 * onde mora o contato do WhatsApp, então ele continua anunciando o que tem no
 * fim do caminho.
 *
 * Com isso caiu também o toque-duplo que existia no mobile. A justificativa
 * dele era "senão o seller sairia do gateway sem nunca ver o que o botão é" —
 * agora o clique NÃO sai do gateway, é uma rota interna e o voltar desfaz.
 * Manter dois toques só pra ler "Suporte" viraria atrito à toa.
 *
 * As props `email`/`name` sumiram junto: só serviam pra montar o texto
 * pré-preenchido da mensagem do WhatsApp. Quem precisa desses dados agora é a
 * própria página de suporte, que os busca no server.
 */

export function SupportFab() {
  const [open, setOpen] = useState(false);

  return (
    <Link
      href="/dashboard/suporte"
      aria-label="Abrir a página de suporte"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      // z-40: abaixo do WithdrawNudge (z-50) e do LockedOverlay, que são
      // avisos que precisam ganhar do botão quando aparecem.
      // 06/08/2026 (davi): "Aumenta esse icone no canto inferior fixo e tira
      // essa animacao piscando dela!" — h-14 (56px) virou h-16 (64px) e o
      // halo `animate-ping` foi embora. Mais tarde no mesmo dia ("Aumenta o
      // tamanho desse icone fixo de suporte"): h-16 → h-20 (80px).
      //
      // O `gap-3` também saiu: com o rótulo colapsado em 0fr o gap continuava
      // valendo, então o botão fechado era um oval em vez de um círculo. O
      // respiro do texto agora mora DENTRO da área recortada (pr-3 no span
      // interno), então só existe com a pill aberta.
      //
      // ⚠️ A conta do círculo fechado tem que fechar na mão: pl(0.5rem=8) +
      // logo(size-16=64) + pr-2(8) = 80 = h-20. Mexeu na altura, mexe no
      // size- da logo junto, senão volta a sair oval.
      //
      // ⚠️ SEM `overflow-hidden` aqui. 08/08/2026 (davi): "Esse icone do zap ta
      // cortado ali em baixo, era pra ele estar sobreposto sobre a moldura
      // dele". O selo mora no canto inferior direito da logo, que é justamente
      // onde a curva do `rounded-full` entra — com overflow escondido a pill
      // comia um pedaço dele. O recorte do rótulo não depende disso: quem
      // corta é o `overflow-hidden` do span interno, logo abaixo.
      // 08/08/2026: `bottom-24` no celular. A barra de abas do painel mora em
      // baixo agora (64px + safe area), e em `bottom-5` o botao sentava em
      // cima dela — cobrindo justamente o slot de "Produtos". Em `md` a barra
      // nao existe e ele volta pro canto de sempre.
      className="group fixed bottom-24 right-5 z-40 flex h-20 items-center rounded-full border border-white/[0.08] bg-black/70 pr-2 shadow-2xl backdrop-blur transition-all duration-300 ease-out hover:border-cyan-400/30 hover:shadow-cyan-400/10 md:bottom-6 md:right-6"
      // Ancorado à DIREITA: a borda direita fica parada e a pill cresce pra
      // esquerda, então é o padding ESQUERDO que anima (o inverso do que seria
      // se ele morasse na outra ponta).
      style={{ paddingLeft: open ? "1.5rem" : "0.5rem" }}
    >
      {/* Rótulo ANTES da logo: assim a logo fica grudada no canto e o texto
          desenrola pra dentro da tela. Colapsa a largura pra 0 quando fechado,
          então o botão vira um círculo limpo sem desmontar nada (transição
          suave nos dois sentidos). */}
      <span
        className="grid transition-[grid-template-columns] duration-300 ease-out"
        style={{ gridTemplateColumns: open ? "1fr" : "0fr" }}
      >
        <span className="overflow-hidden">
          <span className="block whitespace-nowrap pr-3.5 text-base font-medium text-white">
            Suporte
          </span>
        </span>
      </span>

      {/* Logo + selo do WhatsApp. `size-16` casa com a conta do h-20 lá em
          cima. `width/height` do Image ficam em 2x do render (96 pra 48px de
          tela) — é o que o next/image usa pra escolher a fonte, e no retina
          sem isso a logo sai borrada. */}
      <span className="relative inline-flex size-16 shrink-0 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-inset ring-white/10">
        <Image
          src="/trilhopag-icon-192.png"
          alt="Trilho"
          width={96}
          height={96}
          className="relative size-12 rounded-full object-contain"
        />
        {/* Selo do WhatsApp, POR CIMA da moldura da logo (`-bottom-1 -right-1`
            + z-10): é assim que ele lê como selo e não como um terceiro
            elemento espremido lá dentro.
            `text-[#ffffff]` em vez de `text-white`: no modo claro o themes.css
            inverte a primitiva (`--color-white: #09090b`), então `text-white`
            virava um glifo QUASE PRETO em cima do verde. 08/08/2026 (davi):
            "era pra ser branco e nao PRETO (so se for no modo black)". Hex
            arbitrário não passa pela variável, fica branco em todo tema.
            O anel continua em `black/70` de propósito — esse SIM segue o tema,
            porque ele imita o fundo da pill (`bg-black/70`) e precisa
            acompanhar quando ela fica branca. */}
        <span
          className="absolute -bottom-1 -right-1 z-10 inline-flex size-6 items-center justify-center rounded-full bg-[#25D366] ring-2 ring-black/70 transition-transform duration-300"
          style={{ transform: open ? "scale(1)" : "scale(0.88)" }}
        >
          <WhatsAppGlyph className="size-3.5 text-[#ffffff]" />
        </span>
      </span>
    </Link>
  );
}

/** Glifo do WhatsApp — o lucide não tem, e é o ícone do print. */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.470 0 1.45 1.06 2.86 1.21 3.06.15.2 2.09 3.2 5.07 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.16 8.16 0 0 1-1.25-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.26 8.23Z" />
    </svg>
  );
}
