"use client";

import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";

/**
 * Guia de como conectar um domínio próprio. Colapsado por padrão.
 *
 * 08/08/2026 (davi): "existem textos ilegíveis e alguns erros, verifique e
 * também tente melhorar um pouco visualmente ela (deixe mais simplificado,
 * fácil do cliente entender, porém sem tirar o essencial do tutorial)".
 *
 * A ilegibilidade era de tema (ver lib themes.css, tier -100 no claro) e foi
 * resolvida lá, pra toda tela de uma vez. Aqui ficou a parte de conteúdo.
 *
 * O QUE MUDOU E POR QUÊ:
 *
 * 1. RAIZ E SUBDOMÍNIO VIRARAM UM SELETOR, não dois parágrafos empilhados.
 *    Era a raiz do problema real: cada bloco de registro explicava OS DOIS
 *    casos ao mesmo tempo ("Raiz: host @. Subdomínio: host _trilhopag-verify.
 *    checkout"), então quem tem só um domínio lia o dobro do que precisava e
 *    ainda tinha que descobrir qual metade era a sua. Agora escolhe uma vez
 *    no topo e vê só os seus dois registros.
 *
 * 2. Os registros viraram TABELA (Tipo / Host / Valor). É a forma do
 *    formulário que a pessoa vai preencher no painel do provedor — ler em
 *    prosa e traduzir pra campos era trabalho que a gente estava passando
 *    pra ela.
 *
 * 3. Saiu a explicação de por que a Hostinger recusa "dois hosts iguais".
 *    Estava correta e era a frase mais longa do guia; virou uma linha curta
 *    só onde importa (no host do TXT de subdomínio), porque o cliente não
 *    precisa entender a regra do CNAME pra executar o passo.
 *
 * 4. Sem emoji (📚 💡 ⚠️ ✅) e sem travessão. Regra do davi.
 */

type Escopo = "raiz" | "sub";

export function DomainGuide() {
  const [open, setOpen] = useState(false);
  const [escopo, setEscopo] = useState<Escopo>("sub");

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 transition hover:bg-white/[0.03]">
        <div className="flex items-center gap-3">
          <BookOpen className="size-5 shrink-0 text-cyan-400" />
          <div>
            <p className="text-sm font-semibold text-white">
              Como conectar seu domínio
            </p>
            <p className="text-[11px] text-zinc-400">
              Três passos, cerca de 5 minutos. Clica pra abrir.
            </p>
          </div>
        </div>
        <ChevronDown
          className={`size-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </summary>

      <div className="space-y-6 border-t border-white/[0.06] p-5">
        {/* O seletor vem ANTES do passo 1 de propósito: ele decide o conteúdo
            dos três passos, então perguntar depois seria pedir pra reler. */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            O que você vai conectar
          </p>
          <div className="grid grid-cols-2 gap-2">
            <EscopoBtn
              active={escopo === "sub"}
              onClick={() => setEscopo("sub")}
              titulo="Um subdomínio"
              exemplo="checkout.suamarca.com"
            />
            <EscopoBtn
              active={escopo === "raiz"}
              onClick={() => setEscopo("raiz")}
              titulo="O domínio inteiro"
              exemplo="suamarca.com"
            />
          </div>
        </div>

        <Passo n={1} titulo="Crie dois registros no seu provedor de DNS">
          <p className="text-zinc-300">
            No painel de quem vendeu o domínio (Hostinger, GoDaddy, Registro.br,
            Cloudflare). Os dois registros abaixo, exatamente assim:
          </p>

          <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08]">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Tipo</th>
                  <th className="px-3 py-2 font-semibold">Host</th>
                  <th className="px-3 py-2 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                <tr>
                  <td className="px-3 py-2.5 align-top">
                    <Tag>TXT</Tag>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Code>
                      {escopo === "raiz" ? "@" : "_trilhopag-verify.checkout"}
                    </Code>
                  </td>
                  <td className="px-3 py-2.5 align-top text-zinc-300">
                    <Code>trilhopag-verify=...</Code>
                    <span className="mt-1 block text-[11px] text-zinc-500">
                      Copia o valor exato no card do domínio, acima.
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2.5 align-top">
                    <Tag>{escopo === "raiz" ? "A" : "CNAME"}</Tag>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Code>{escopo === "raiz" ? "@" : "checkout"}</Code>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Code>
                      {escopo === "raiz" ? "76.76.21.21" : "cname.vercel-dns.com"}
                    </Code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {escopo === "sub" ? (
            <Nota>
              O host do TXT é <Code>_trilhopag-verify.checkout</Code> e não{" "}
              <Code>checkout</Code>. Precisa ser diferente do host do CNAME,
              senão o provedor recusa dizendo que já existe um registro nesse
              host.
            </Nota>
          ) : null}

          <Nota>
            Se o seu DNS é Cloudflare, a nuvem do registro precisa ficar{" "}
            <strong className="text-zinc-200">cinza</strong> (DNS only). Laranja
            não funciona.
          </Nota>
        </Passo>

        <Passo n={2} titulo="Espere o DNS propagar">
          <p className="text-zinc-300">
            Normalmente de 5 a 30 minutos. Dá pra acompanhar em{" "}
            <a
              href="https://dnschecker.org"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 underline underline-offset-2"
            >
              dnschecker.org
            </a>
            .
          </p>
        </Passo>

        <Passo n={3} titulo="Clique em Verificar agora">
          <p className="text-zinc-300">
            O domínio passa a mostrar{" "}
            <span className="rounded bg-cyan-400/15 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300">
              Verificado
            </span>{" "}
            e seus checkouts ficam ativos. Se você esquecer, a gente verifica
            sozinho a cada 5 minutos.
          </p>
        </Passo>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Não funcionou
          </p>
          <div className="space-y-1.5">
            <Problema titulo="Passou de 30 minutos e não verifica">
              Confere no painel de DNS se os dois registros foram salvos, com o
              host e o valor exatos da tabela acima. Um espaço a mais no valor
              do TXT já invalida.
            </Problema>
            <Problema titulo="Uso Cloudflare e não verifica">
              A nuvem do registro precisa estar cinza (DNS only), não laranja
              (proxied). Clica na nuvem pra trocar.
            </Problema>
            <Problema titulo="Já existe um registro nesse host">
              Substitui pelo novo. Não dá pra ter dois registros A no mesmo
              host, nem um CNAME dividindo host com outro registro.
            </Problema>
          </div>
        </div>
      </div>
    </details>
  );
}

/* ============ auxiliares ============ */

function EscopoBtn({
  active,
  onClick,
  titulo,
  exemplo,
}: {
  active: boolean;
  onClick: () => void;
  titulo: string;
  exemplo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // O anel duplo (`border` + `ring`) existe por causa do tema claro: lá
      // `bg-white/[0.02]` do inativo e `bg-cyan-400/[0.10]` do ativo viram dois
      // cinza-azulados parecidos, e o preenchimento sozinho não decide qual
      // está escolhido. A borda em opacidade cheia mais o anel resolvem sem
      // depender do fundo.
      className={`rounded-xl border px-3 py-2.5 text-left transition ${
        active
          ? "border-cyan-400 bg-cyan-400/[0.10] ring-1 ring-cyan-400/40"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]"
      }`}
    >
      <span
        className={`block text-[13px] font-semibold ${active ? "text-cyan-300" : "text-zinc-300"}`}
      >
        {titulo}
      </span>
      <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500">
        {exemplo}
      </span>
    </button>
  );
}

function Passo({
  n,
  titulo,
  children,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-[11px] font-bold text-black">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-sm font-semibold text-white">{titulo}</p>
        <div className="text-[12px] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded bg-white/[0.10] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="break-all rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
      {children}
    </code>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2.5 border-l-2 border-white/[0.12] pl-3 text-[11.5px] leading-relaxed text-zinc-400">
      {children}
    </p>
  );
}

function Problema({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <summary className="cursor-pointer p-2.5 text-[12px] font-medium text-zinc-200 transition hover:bg-white/[0.03]">
        {titulo}
      </summary>
      <p className="border-t border-white/[0.05] p-2.5 text-[11.5px] leading-relaxed text-zinc-400">
        {children}
      </p>
    </details>
  );
}
