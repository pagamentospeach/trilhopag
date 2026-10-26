import { ErrorScreen } from "@/components/error-screen";

/**
 * Tela 404 global do Trilho. Captura QUALQUER URL que não existir no app/.
 * Substitui a tela default do Next.js/Vercel.
 *
 * 08/08/2026 (davi): "deixe essa mesma tela de erro para qualquer slug que
 * nao exista no nosso dominio (mas claro, sem esse negocio dos 3 clicks né)".
 * Reusa o `ErrorScreen` com `gate=false` — o que faz /admin01 se passar por
 * rota inexistente é exatamente esta tela ser a mesma dos dois lados.
 */
export default function NotFound() {
  return <ErrorScreen />;
}
