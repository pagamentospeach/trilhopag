import { redirect } from "next/navigation";

// A antiga aba "Metadados" virou a aba "Vídeo" dentro de Camuflagens
// (/dashboard/cloaker). Mantém o redirect pra não quebrar links antigos.
export default function VideoCamuflagemRedirect() {
  redirect("/dashboard/cloaker?tab=video");
}
