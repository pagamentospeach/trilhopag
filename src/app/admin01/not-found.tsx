import { ErrorScreen } from "@/components/error-screen";

/**
 * Rota inexistente DENTRO do /admin01. Mostra a mesma tela de 404 do resto
 * do domínio de propósito: nem quem já passou da porta consegue mapear o
 * painel por tentativa e erro de URL — todo palpite errado responde igual.
 */
export default function AdminNotFound() {
  return <ErrorScreen />;
}
