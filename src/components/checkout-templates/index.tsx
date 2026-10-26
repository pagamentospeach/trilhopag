"use client";

import type { TemplateProps } from "./types";
import { AutoTemplate } from "./auto";
import { ExtraTemplate } from "./extra";
import { SimpleTemplate } from "./simple";
import { DropTemplate } from "./drop";
import { DropV2Template } from "./dropv2";
import { FastTemplate } from "./fast";
import { GringaTemplate } from "./gringa";
import { GringaDropTemplate } from "./gringa-drop";
import { TiktokShopTemplate } from "./tiktok_shop";
import { MercadoLivreTemplate } from "./mercado_livre";
import { AmazonTemplate } from "./amazon";
import { ShopeeTemplate } from "./shopee";
import { AutoTranslate } from "./auto-translate";

export function CheckoutTemplate({
  template,
  ...props
}: TemplateProps & { template: string }) {
  const inner = (() => {
    switch (template) {
      case "auto":
        return <AutoTemplate {...props} />;
      case "extra":
        return <ExtraTemplate {...props} />;
      case "simple":
        return <SimpleTemplate {...props} />;
      case "drop":
        return <DropTemplate {...props} />;
      case "dropv2":
        return <DropV2Template {...props} />;
      case "fast":
        return <FastTemplate {...props} />;
      case "gringa":
        return <GringaTemplate {...props} />;
      case "gringa-drop":
      case "gringa-drop-v1":
        return <GringaDropTemplate {...props} />;
      case "tiktok_shop":
        return <TiktokShopTemplate {...props} />;
      case "mercado_livre":
        return <MercadoLivreTemplate {...props} />;
      case "amazon":
        return <AmazonTemplate {...props} />;
      case "shopee":
        return <ShopeeTemplate {...props} />;
      default:
        // "custom" cai aqui — também usa "extra" como default seguro.
        // O caller pode escolher renderizar o builder custom em outro caminho.
        return <ExtraTemplate {...props} />;
    }
  })();
  // Wrapper de traducao automatica. Quando autoTranslate=true e o cliente
  // nao eh PT, ativa o MutationObserver + dictionary lookup. No-op quando
  // OFF ou quando o cliente eh PT.
  return <AutoTranslate enabled={!!props.autoTranslate}>{inner}</AutoTranslate>;
}

export type { TemplateProps } from "./types";
