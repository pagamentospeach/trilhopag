import { listarApiLogs, RETENCAO_DIAS } from "@/lib/api-log";

/**
 * Últimas chamadas na API pública (seção 13: "Logs — requisição, resposta,
 * status, data, duração, endpoint").
 *
 * Antes disto não existia nada: falha de autenticação ia pro `console` do
 * servidor e o dev do outro lado não tinha como saber por que a chave dele
 * foi recusada. A resposta era abrir chamado no suporte.
 *
 * ⚠️ NÃO TEM "REQUISIÇÃO" NEM "RESPOSTA" — corpo não é gravado, de propósito.
 * O corpo destas rotas é dado de pagamento: nome, e-mail, CPF do comprador e
 * valor. Guardar isso por 30 dias numa tabela de log cria um segundo lugar de
 * onde esses dados vazam, pra resolver um problema que metadado já resolve. A
 * seção 29 é explícita sobre não expor dado sensível sem necessidade.
 *
 * O que substitui o corpo pra diagnóstico: o `errorCode`, que é o mesmo
 * código que a API devolveu (`unauthorized`, `rate_limited`,
 * `insufficient_scope`). É o campo que responde "por que minha chamada foi
 * recusada".
 */
export async function ApiLogs({ userId }: { userId: string }) {
  const logs = await listarApiLogs(userId);

  if (logs.length === 0) {
    return (
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-zinc-400">Nenhuma chamada ainda.</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] text-zinc-500">
          Assim que sua integração usar uma chave, as chamadas aparecem aqui
          com status e duração.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-medium text-white">Últimas chamadas</h2>
        <p className="text-[11px] text-zinc-500">
          Guardadas por {RETENCAO_DIAS} dias · sem corpo de requisição
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <div className="hidden grid-cols-12 gap-4 border-b border-white/[0.06] px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 md:grid">
          <span className="col-span-3">Quando</span>
          <span className="col-span-5">Endpoint</span>
          <span className="col-span-2 text-right">Duração</span>
          <span className="col-span-2 text-right">Status</span>
        </div>

        {logs.map((l) => {
          const ok = l.statusCode >= 200 && l.statusCode < 300;
          return (
            <div
              key={l.id}
              className="flex flex-col gap-1 border-b border-white/[0.04] px-4 py-2.5 text-sm last:border-b-0 md:grid md:grid-cols-12 md:items-center md:gap-4 md:px-5"
            >
              <span className="col-span-3 text-[11px] tabular-nums text-zinc-500">
                {l.createdAt.toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className="col-span-5 min-w-0 truncate font-mono text-[12px] text-zinc-300">
                <span className="text-zinc-500">{l.method}</span> {l.path}
              </span>
              <span className="col-span-2 text-[12px] tabular-nums text-zinc-400 md:text-right">
                {l.durationMs} ms
              </span>
              <span className="col-span-2 md:text-right">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] ${
                    ok
                      ? "bg-cyan-400/15 text-cyan-300"
                      : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {l.statusCode}
                </span>
                {l.errorCode && (
                  <span className="ml-1.5 font-mono text-[10px] text-zinc-500">
                    {l.errorCode}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
