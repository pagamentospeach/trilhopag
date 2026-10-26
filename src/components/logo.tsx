import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logo component — usa as imagens em /public/:
 *   - trilhopag-logo.png  (retangular, com texto)  → headers grandes
 *   - trilhopag-logo2.png (circular, só símbolo)   → ícones pequenos
 *
 * Default: `variant="wordmark"`. Pra contextos colapsados, `variant="icon"`.
 *
 * textClassName mantido por compat — ignorado agora (logo é imagem).
 */
export function Logo({
  className,
  href = "/",
  variant = "wordmark",
  size = 40,
}: {
  className?: string;
  href?: string;
  variant?: "wordmark" | "icon";
  size?: number;
  textClassName?: string;
}) {
  const src =
    variant === "wordmark" ? "/trilhopag-logo.png" : "/trilhopag-logo2.png";

  if (variant === "icon") {
    return (
      <Link
        href={href}
        className={cn("inline-flex items-center", className)}
        aria-label="Trilho"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Trilho"
          width={size}
          height={size}
          className="rounded-full object-contain shrink-0"
          style={{ width: size, height: size }}
        />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn("inline-flex items-center", className)}
      aria-label="Trilho"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Trilho"
        className="block object-contain"
        style={{ height: size }}
      />
    </Link>
  );
}
