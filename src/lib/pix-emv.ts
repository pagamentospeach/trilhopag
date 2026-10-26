/**
 * Parser EMV BR Code (Pix copia-e-cola).
 *
 * Formato: TLV (Tag-Length-Value) com tags de 2 dígitos + length de 2 dígitos.
 * O nome do beneficiário fica na tag 59 ("Merchant Name", max 25 chars).
 *
 * Exemplo:
 *   ...5925CENTRAL DE TRANSACOES DIG...
 *   tag=59, length=25, value="CENTRAL DE TRANSACOES DIG"
 *
 * Usado pra DESCOBRIR a nominal real do beneficiário de cada adquirente
 * (que muda sem aviso) e atualizar a row da Acquirer.
 */

export function parseEmvMerchantName(emv: string): string | null {
  if (!emv || typeof emv !== "string") return null;

  let i = 0;
  while (i < emv.length - 4) {
    const tag = emv.substring(i, i + 2);
    const lenStr = emv.substring(i + 2, i + 4);
    const len = parseInt(lenStr, 10);
    if (!Number.isFinite(len) || len < 0) return null;

    const value = emv.substring(i + 4, i + 4 + len);

    if (tag === "59") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    i += 4 + len;
  }
  return null;
}

/**
 * Extrai a INSTITUIÇÃO/PSP do código PIX a partir do domínio do URL dinâmico
 * embutido na tag 26 (Merchant Account Information).
 *
 * No PIX dinâmico, a tag 26 é composta e carrega, num subcampo (geralmente o
 * 25), o URL da cobrança — ex.:
 *   pix.onlyup.com.br/qr/v3/at/cobv/...   → "onlyup"
 *   qrcode.owem.com.br/pix/...            → "owem"
 *   pix.basspago.com.br/qr/v3/at/...      → "basspago"
 *
 * A instituição é o rótulo do domínio LOGO ANTES do TLD (".com"): pegamos o
 * host (parte antes da primeira "/"), e o label imediatamente anterior a "com"
 * (ou o penúltimo label quando não há "com"). Ignora o subcampo 00 (GUI
 * "br.gov.bcb.pix"). Retorna null quando o PIX usa chave ESTÁTICA (sem URL).
 */
function brandFromHost(host: string): string | null {
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const comIdx = labels.indexOf("com");
  if (comIdx > 0) return labels[comIdx - 1];
  // Sem "com" (ex.: pix.example.io) → eSLD (penúltimo label).
  return labels[labels.length - 2] ?? null;
}

export function parseEmvInstitution(emv: string): string | null {
  if (!emv || typeof emv !== "string") return null;
  const info = parseEmvField(emv, "26");
  if (!info) return null;

  // Percorre os SUBCAMPOS da tag 26 (TLV aninhado) procurando um que pareça URL.
  let i = 0;
  while (i < info.length - 4) {
    const tag = info.substring(i, i + 2);
    const len = parseInt(info.substring(i + 2, i + 4), 10);
    if (!Number.isFinite(len) || len < 0) break;
    const value = info.substring(i + 4, i + 4 + len);
    // Subcampo 00 = GUI ("br.gov.bcb.pix") — nunca é a instituição.
    if (tag !== "00") {
      const host = value.split("/")[0].toLowerCase();
      if (
        /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) &&
        !host.startsWith("br.gov.bcb")
      ) {
        const brand = brandFromHost(host);
        if (brand) return brand;
      }
    }
    i += 4 + len;
  }
  return null;
}

/** Helper pra extrair qualquer tag, útil pra debug. */
export function parseEmvField(emv: string, targetTag: string): string | null {
  if (!emv || typeof emv !== "string") return null;
  let i = 0;
  while (i < emv.length - 4) {
    const tag = emv.substring(i, i + 2);
    const len = parseInt(emv.substring(i + 2, i + 4), 10);
    if (!Number.isFinite(len)) return null;
    const value = emv.substring(i + 4, i + 4 + len);
    if (tag === targetTag) return value;
    i += 4 + len;
  }
  return null;
}
