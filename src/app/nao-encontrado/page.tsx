import { headers } from "next/headers";
import { ErrorScreen } from "@/components/error-screen";

/**
 * Alvo do rewrite do `proxy.ts` pra /admin01 sem a porta aberta. Também
 * funciona como página de erro direta.
 *
 * Precisa ser uma rota de verdade porque `not-found.tsx` não é destino
 * válido de rewrite — e é justamente por servir a MESMA tela que o /admin01
 * fica indistinguível de qualquer slug inexistente.
 *
 * SEM `export const metadata` de propósito: title e robots próprios apareciam
 * no <head> e entregavam a diferença entre esta página e o 404 comum. Herdando
 * do layout raiz, o cabeçalho dos dois fica igual.
 */
export default async function NaoEncontradoPage() {
  // Dá pra forjar este header — e tudo bem. As 3 batidas são teatro contra
  // scanner automático, não autorização: abrir a porta só te leva pra tela
  // de login, que continua exigindo senha + TOTP.
  const gate = (await headers()).get("x-tp-gate") === "1";
  return <ErrorScreen gate={gate} />;
}
