import { NextResponse } from "next/server";
import { submitOnboarding } from "@/app/onboarding/documentos/actions";

export const dynamic = "force-dynamic";

/**
 * Espelho HTTP do `submitOnboarding`.
 *
 * 08/08/2026 (davi): "Ta dando esse erro quando eu tento criar a conta".
 * O erro era "An unexpected response was received from the server." — o
 * cadastro chamava a Server Action direto do client. O ID de uma Server
 * Action é gerado por DEPLOY: se a pessoa abriu o /signup, ficou preenchendo,
 * e nesse meio-tempo saiu um deploy novo, o ID que o browser tem deixa de
 * existir no servidor e o POST morre com essa mensagem genérica. Como o
 * cadastro é longo (dados + endereço + documentos), a janela pra isso
 * acontecer é enorme.
 *
 * Uma rota normal tem URL fixa, então sobrevive a deploy. A regra de negócio
 * continua UMA só, na action — aqui é só o transporte.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Dados inválidos. Recarregue a página." },
      { status: 422 },
    );
  }

  try {
    // O cast é seguro: a action revalida tudo com Zod antes de encostar no
    // banco, então o que chega aqui é entrada não confiável de qualquer jeito.
    const result = await submitOnboarding(
      body as Parameters<typeof submitOnboarding>[0],
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (e) {
    // `requireUserId()` faz redirect() quando não há sessão — dentro de uma
    // rota isso vira um throw. Traduz pra algo que o cadastro saiba mostrar.
    const digest = (e as { digest?: string } | null)?.digest ?? "";
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return NextResponse.json(
        { ok: false, error: "Sua sessão expirou. Faça login e reenvie os documentos." },
        { status: 401 },
      );
    }
    console.error("[signup onboarding] falhou:", e);
    return NextResponse.json(
      { ok: false, error: "Não foi possível enviar os documentos. Tente de novo." },
      { status: 500 },
    );
  }
}
