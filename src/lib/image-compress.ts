/**
 * Compressao de imagem NO NAVEGADOR (downscale + reencode) pra caber no limite
 * de corpo da funcao serverless da Vercel.
 *
 * Vive fora do componente porque dois fluxos precisam dela: o FileUpload do
 * dashboard e o passo de documentos do cadastro.
 */

/** Limite REAL do que vai pro servidor: a funcao serverless da Vercel aceita
 *  ~4.5MB de corpo. Mantemos margem (4.3MB) p/ overhead do multipart. */
export const SERVER_LIMIT_BYTES = 4_300_000;

/** Formatos com canal alpha — transparencia precisa sobreviver ao upload. */
const ALPHA_TYPES = /^image\/(png|webp|avif)$/i;

/**
 * PDF/video (ou imagem que o canvas nao decodifica — ex: HEIC problematico)
 * passam direto. Nunca quebra: qualquer erro retorna o arquivo original.
 *
 * 30/07/2026 (davi, repassando o seller: "adiciona opcao de conseguir por
 * imagem sem fundo, ate da pra por, mas quando adiciona a propria plataforma
 * adiciona um fundo").
 *
 * CAUSA RAIZ: TODA imagem passava por aqui e saia reencodada como JPEG. E
 * JPEG nao tem canal alpha. O canvas comeca preenchido com rgba(0,0,0,0), e
 * ao exportar pra JPEG o alpha e descartado — sobra o RGB, que e 0,0,0. Ou
 * seja: todo pixel transparente do PNG virava PRETO SOLIDO.
 *
 * Agora:
 *  - PNG/WEBP/AVIF que ja cabem no limite sobem INTACTOS (nem tocam no canvas)
 *  - se precisarem encolher, saem em WEBP, que preserva alpha
 *  - GIF nunca passa pelo canvas (createImageBitmap pega so o 1o frame, entao
 *    reencodar mataria a animacao)
 *  - SVG idem (e vetor, virava bitmap)
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  // Vetor e animacao: reencodar destroi. Sobem como estao.
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  const keepsAlpha = ALPHA_TYPES.test(file.type);

  // Ja cabe no limite? Nao mexe. Preserva transparencia 1:1 e evita perda de
  // qualidade a toa.
  if (keepsAlpha && file.size <= SERVER_LIMIT_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 2000;
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    // WEBP guarda alpha; JPEG nao. Se o navegador nao souber encodar WEBP, o
    // toBlob cai em PNG por spec — que tambem guarda alpha, entao segue certo.
    const outType = keepsAlpha ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), outType, keepsAlpha ? 0.9 : 0.82),
    );
    if (!blob || blob.size >= file.size) return file; // nao piorou → mantem

    // Extensao vem do que o navegador REALMENTE gerou (blob.type), nao do que
    // pedimos — senao um fallback pra PNG salvaria com nome .webp.
    const realType = blob.type || outType;
    const ext =
      realType === "image/webp"
        ? "webp"
        : realType === "image/png"
          ? "png"
          : "jpg";
    const base = file.name.replace(/\.[a-z0-9]+$/i, "") || "imagem";
    return new File([blob], `${base}.${ext}`, { type: realType });
  } catch {
    return file; // canvas nao decodificou (HEIC, etc) — sobe o original
  }
}
