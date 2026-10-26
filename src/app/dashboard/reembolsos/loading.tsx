import {
  SkelHeader,
  SkelStats,
  SkelTable,
} from "@/components/dashboard/page-kit";

/**
 * Esqueleto de Reembolsos.
 *
 * A FORMA precisa bater com a da página de verdade — é o ponto todo. Um
 * esqueleto genérico volta a ser um spinner com outra cara: o conteúdo chega e
 * empurra tudo de lugar. Aqui a grade, o número de cartões e a altura das
 * linhas são os mesmos, então a troca é invisível.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SkelHeader />
      <SkelStats n={3} />
      <SkelTable linhas={6} />
    </div>
  );
}
