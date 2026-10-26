/**
 * Valida um destino de redirecionamento vindo da URL.
 *
 * ⚠️ OPEN REDIRECT — encontrado em 08/08/2026 na tela de login.
 *
 * O `?from=` da /login era lido do endereço e usado cru em `router.push()` e no
 * `callbackURL` do login social. Ou seja:
 *
 *     https://trilhopag.com/login?from=https://site-falso.com
 *
 * A vítima abre um link que é MESMO do trilhopag.com, vê o login legítimo, com
 * o domínio certo e o cadeado certo, digita e-mail e senha — e é despejada no
 * site do atacante logo depois. É o formato clássico de phishing de credencial,
 * e num gateway de pagamento a credencial dá acesso a saque.
 *
 * O `from` existe por um motivo bom (voltar pra página que a pessoa tentou
 * abrir, incluindo o `?highlight=` do push de venda), então a correção não é
 * apagar o parâmetro e sim exigir que ele seja um caminho INTERNO.
 *
 * O que é recusado, e por quê cada um:
 *
 *   - `https://evil.com`     absoluto, o ataque direto
 *   - `//evil.com`           relativo a protocolo: o navegador trata como host
 *   - `/\evil.com`           barra invertida, que vários parsers normalizam
 *                            pra barra comum
 *   - `javascript:...`       não é caminho, e vira execução em alguns contextos
 *   - qualquer coisa que não comece com `/`
 *
 * O que passa: `/dashboard`, `/dashboard/vendas?highlight=abc`, `/x#frag`.
 */
export function safeInternalPath(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw) return fallback;

  // Precisa começar com UMA barra. `//` e `/\` são as duas formas de escapar
  // pra outro host mantendo a aparência de caminho relativo.
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;

  // Barra invertida em qualquer posição sai fora: não existe caminho legítimo
  // nosso com `\`, e ela é o coringa das normalizações divergentes entre
  // navegador e servidor.
  if (raw.includes("\\")) return fallback;

  // Caractere de controle (inclui \n e \t) pode partir a URL em quem processa
  // depois. Nenhuma rota nossa tem isso.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(raw)) return fallback;

  return raw;
}
