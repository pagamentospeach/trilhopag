/**
 * Confirma que um dominio realmente SERVE a Trilho — e nao a hospedagem
 * propria do seller (Vercel dele, VPS, etc).
 *
 * POR QUE EXISTE: a verificacao de DNS sozinha NAO basta. O A record da
 * Vercel (76.76.21.21) e o CNAME cname.vercel-dns.com sao GENERICOS — apontam
 * pra Vercel, mas qualquer projeto Vercel (inclusive o DO PROPRIO SELLER)
 * usa os mesmos. Resultado: o seller aponta o dominio pra Vercel DELE, a
 * verificacao por DNS passa, marcamos "verified", mas /cl/ e /c/ dao 404
 * porque a rota nao existe no projeto dele. (Foi o bug do pagamentoshop.sbs.)
 *
 * Este check faz um FETCH REAL no marcador /cl/__trilho_health. So o deploy
 * da Trilho responde { trilhopag_cloaker: true }. Se o dominio aponta pra
 * outro lugar, o marcador nao vem -> nao esta servindo a Trilho.
 */

import { safeFetch } from "./security/ssrf";

const HEALTH_PATH = "/cl/__trilho_health";

/** Limpa o dominio: tira protocolo, path, espacos. */
function cleanHost(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

/**
 * Retorna true se o dominio responde como Trilho no marcador de saude.
 * Faz ate `attempts` tentativas (SSL/propagacao pode demorar logo apos
 * adicionar o dominio na Vercel).
 */
export async function domainServesTrilho(
  domain: string,
  attempts = 2,
): Promise<boolean> {
  const host = cleanHost(domain);
  if (!host) return false;
  for (let i = 0; i < attempts; i++) {
    try {
      // safeFetch: anti-SSRF. O `host` vem do domínio do seller — sem isso, ele
      // podia apontar o DNS pra um IP interno (169.254.169.254 / 10.x / etc) e
      // o servidor faria fetch pra lá. safeFetch resolve o DNS, bloqueia IP
      // privado e usa redirect:"manual" (antes era follow → permitia bounce
      // pra IP interno).
      const res = await safeFetch(`https://${host}${HEALTH_PATH}`, {
        method: "GET",
        headers: { "user-agent": "Trilho-DomainHealth/1.0" },
        cache: "no-store",
        timeoutMs: 7000,
      });
      if (res.ok) {
        const j = (await res.json().catch(() => null)) as {
          trilhopag_cloaker?: boolean;
        } | null;
        if (j?.trilhopag_cloaker === true) return true;
      }
    } catch {
      // timeout / SSL ainda provisionando / rede — tenta de novo
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
