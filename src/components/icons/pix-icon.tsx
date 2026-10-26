/**
 * ÍCONE DO PIX (06/08/2026, davi).
 *
 * "Troca esse icone pelo icone do PIX mesmo e nao esse flash! Mesma coisa na
 *  aba de adquirentes!"
 *
 * Antes era o `Zap` do lucide (o "flash"), que é ícone genérico de energia e
 * não diz nada pro seller. Este é o glifo oficial do Pix (o losango formado
 * por 4 setas do Banco Central).
 *
 * `fill="currentColor"` de propósito: assim ele herda a cor do container
 * (ciano no card de KPI, zinc no setor de adquirentes) e não força a marca
 * verde-água do BC num tema escuro onde ela some.
 *
 * A assinatura é `{ className?: string }` — a MESMA dos ícones do lucide —
 * porque ele é passado nos mesmos slots (`Icon: typeof Zap`, `CARDS[].icon`).
 */
export function PixIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M242.4 292.5c5.4-5.4 14.7-5.4 20.1 0l77 77c14.2 14.2 33.1 22 53.1 22h15.1l-97.1 97.1c-30.3 30.3-79.5 30.3-109.8 0l-97.5-97.5h9.3c20 0 38.9-7.8 53.1-22l76.7-76.6zm20.1-73.6c-5.6 5.4-14.6 5.6-20.1 0l-76.7-76.7c-14.2-15.1-33.1-22-53.1-22h-9.3l97.6-97.6c30.3-30.2 79.5-30.2 109.8 0l97.1 97.1h-15.2c-20 0-38.9 7.8-53.1 22l-77 77.2zM112.6 142.7c13.8 0 26.5 5.6 37.1 15.4l76.7 76.7c7.2 6.3 16.6 10.8 26.1 10.8s18.9-4.5 26.1-10.8l77-77c9.8-9.7 23.3-15.3 37.1-15.3h37.7l58.3 58.3c30.3 30.3 30.3 79.5 0 109.8l-58.3 58.3h-37.7c-13.8 0-27.3-5.6-37.1-15.4l-77-77c-13.9-13.9-38.2-13.9-52.1.1l-76.7 76.7c-10.6 9.7-23.3 15.3-37.1 15.3H80.8l-58.2-58.3c-30.2-30.3-30.2-79.5 0-109.8l58.2-58.2h31.8z" />
    </svg>
  );
}
