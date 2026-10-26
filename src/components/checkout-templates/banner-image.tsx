"use client";

import { useState, type ReactNode } from "react";

/**
 * BannerImage — renderiza o banner do topo do checkout com fallback gracioso.
 *
 * Se a imagem falhar ao carregar (ex: blob store antigo bloqueado após a
 * migração de conta → 403 "Your store is blocked"), em vez de mostrar a caixa
 * quebrada gigante (ícone "?" do navegador), renderiza o `fallback` (ou NADA,
 * por padrão). No checkout público: esconde. No builder: mostra um aviso de
 * "reenvie o banner". Banners novos (store atual) carregam normalmente.
 */
export function BannerImage({
  src,
  href,
  fallback = null,
}: {
  src: string;
  href?: string | null;
  /** Renderizado se a imagem falhar. Default null (esconde). */
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (!src) return null;
  if (failed) return <>{fallback}</>;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Banner"
      className="block w-full h-auto"
      loading="eager"
      onError={() => setFailed(true)}
    />
  );

  if (href) {
    const safe = /^https?:\/\//i.test(href) ? href : "#";
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full"
      >
        {img}
      </a>
    );
  }
  return img;
}
