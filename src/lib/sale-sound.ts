/**
 * SOM DE VENDA — 06/08/2026 (davi mandou o arquivo: "Troca o som das
 * notificacoes para esse som dinheiro").
 *
 * Antes existiam DOIS sons diferentes, e nenhum tocava o arquivo dele:
 *
 *  1. <SalesToastFeed> sintetizava um "ka-ching" no WebAudio (ruído branco por
 *     bandpass + parciais inarmônicas de sino). Soava bem, mas era sintetizado.
 *  2. <LiveFeed> tinha um `<audio>` apontando pra um data-URI base64 de WAV
 *     que era o stub clássico de SILÊNCIO — declarava um chunk `data` gigante
 *     e trazia 3 bytes de zero. Ou seja: o botão de mudo do "Vendas ao vivo"
 *     existia na tela mas nunca houve som nenhum pra mudar.
 *
 * Agora os dois tocam o mesmo arquivo, por aqui.
 *
 * ⚠️ O ARQUIVO FOI CORTADO. O original tinha 5,25s, dos quais os primeiros
 * 2,727s eram silêncio digital puro (amostras exatamente zero). Publicado como
 * veio, toda venda ia aparecer na tela e o som só sairia quase 3 SEGUNDOS
 * depois — um delay bem pior que o do botão do olho. Cortei no limite dos
 * frames MP3 (não recodifiquei: o pico continua 0.324, idêntico ao original),
 * sobrou 2,64s começando com 0,13s de silêncio — que ficam de propósito, pra
 * dar tempo do decoder encher o bit reservoir e o ataque sair inteiro.
 *
 * Por que WebAudio e não `new Audio()`:
 *  - o arquivo é decodificado UMA vez e fica em memória, então o disparo é
 *    imediato — `<audio>.play()` numa venda pode engasgar buscando/decodificando;
 *  - dá pra AMPLIFICAR. O arquivo tem pico em -9.8 dBFS (0.324), baixo pra
 *    notificação; `.volume` de elemento `<audio>` só sabe abaixar, nunca subir.
 *  - um AudioContext só pro app inteiro (o browser limita ~6) e um único
 *    download de 46KB, mesmo com LiveFeed e SalesToastFeed montados juntos.
 */

const SRC = "/sounds/dinheiro.mp3";

/** Pico do arquivo é 0.324; 1.8x leva pra ~0.58 — audível sem chegar perto de clipar. */
const GAIN = 1.8;

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<void> | null = null;

function load(audioCtx: AudioContext): Promise<void> {
  if (loading) return loading;
  loading = fetch(SRC)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("404"))))
    .then((ab) => audioCtx.decodeAudioData(ab))
    .then((decoded) => {
      buffer = decoded;
    })
    .catch(() => {
      // Sem som é chato, mas não pode derrubar o feed de vendas. Deixa `loading`
      // preenchido pra não ficar re-tentando a cada venda.
    });
  return loading;
}

/**
 * Cria o AudioContext e já começa a baixar/decodificar o arquivo.
 *
 * TEM que ser chamado de dentro de um gesto do usuário (click/keydown/touch):
 * a política de autoplay do Chrome/Safari só destrava áudio assim. Chamar de
 * novo depois é inofensivo.
 *
 * @returns true se o áudio está destravado.
 */
export function unlockSaleSound(): boolean {
  if (ctx) return true;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    void load(ctx);
    return true;
  } catch {
    return false;
  }
}

/**
 * Toca o som. Silencioso (sem erro) se ainda não foi destravado ou se o arquivo
 * não terminou de carregar — venda não pode quebrar por causa de som.
 */
export function playSaleSound(): void {
  const audioCtx = ctx;
  if (!audioCtx) return;

  // Safari/Chrome suspendem o contexto quando a aba fica em background. Sem
  // isso, a primeira venda depois de voltar pra aba sairia muda.
  if (audioCtx.state === "suspended") void audioCtx.resume();

  if (!buffer) {
    // Ainda decodificando (só acontece nos primeiros instantes): toca assim que
    // ficar pronto, em vez de engolir a venda.
    void load(audioCtx).then(() => {
      if (buffer) start(audioCtx, buffer);
    });
    return;
  }
  start(audioCtx, buffer);
}

function start(audioCtx: AudioContext, buf: AudioBuffer) {
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(GAIN, audioCtx.currentTime);
  src.connect(gain).connect(audioCtx.destination);
  src.start();
}
