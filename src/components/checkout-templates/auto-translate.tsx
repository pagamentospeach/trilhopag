"use client";

import { useEffect, useRef } from "react";

/**
 * Traducao automatica do checkout pro idioma do navegador do cliente.
 *
 * Como funciona:
 *  1. Detecta `navigator.language` no mount (ex: "en-US" → "en").
 *  2. Se nao for PT, varre o DOM e traduz cada nodo de texto in-place
 *     usando o dicionario estatico abaixo (case-sensitive, lookup direto).
 *  3. Reage a mudancas dinamicas via MutationObserver — quando o React
 *     re-renderiza (ex: troca de step, copy do PIX), retraduz.
 *  4. Tambem seta <html lang="pt-BR"> pra o Chrome/Edge oferecer
 *     traducao da pagina inteira (cobre strings nao mapeadas como
 *     descricao de produto, testimonials etc).
 *
 * Cobertura:
 *  - en/es/fr/it/de — top 5 idiomas relevantes pra trafego pago BR-out.
 *  - Strings nao mapeadas: ficam em PT (cliente ainda ve o checkout
 *    funcional + Chrome pode oferecer traduzir o resto).
 *
 * Trade-off: dicionario estatico. Pra ampliar, adicione entradas no
 * objeto DICT abaixo. Strings com placeholders (ex: "Valido por 15 min")
 * usam normalizacao simples (remove digitos).
 */

/** Strings PT-BR comuns nos templates → traducoes. */
const DICT: Record<string, Record<string, string>> = {
  en: {
    // Pedido
    "Seu pedido": "Your order",
    "Seu carrinho": "Your cart",
    "Você está adquirindo:": "You are purchasing:",
    "Dados cadastrais": "Your details",
    "Dados de pagamento": "Payment details",
    "Identificação": "Identification",
    "Identificacao": "Identification",
    "Entrega": "Delivery",
    "Pagamento": "Payment",
    "Pagamento via Pix": "Pay with Pix",
    "Pagamento via PIX": "Pay with PIX",
    "Aprovação imediata.": "Instant approval.",
    "Aprovacao imediata.": "Instant approval.",
    "Aprovação imediata": "Instant approval",
    // Form labels
    "E-mail": "Email",
    "Email": "Email",
    "Nome completo": "Full name",
    "Nome": "Name",
    "Telefone": "Phone",
    "Telefone / WhatsApp": "Phone / WhatsApp",
    "WhatsApp": "WhatsApp",
    CPF: "Tax ID",
    "CPF / CNPJ": "Tax ID",
    CEP: "ZIP Code",
    Endereço: "Address",
    Endereco: "Address",
    Número: "Number",
    Numero: "Number",
    Complemento: "Complement",
    Bairro: "Neighborhood",
    Cidade: "City",
    Estado: "State",
    País: "Country",
    Pais: "Country",
    Quantidade: "Quantity",
    "Seu nome": "Your name",
    "seu@email.com": "your@email.com",
    "Digite seu nome": "Enter your name",
    "Digite seu e-mail": "Enter your email",
    "Digite seu CPF": "Enter your tax ID",
    "Digite seu telefone": "Enter your phone",
    // CTAs
    "GERAR PIX": "GENERATE PIX",
    "PAGAR AGORA": "PAY NOW",
    "PAGAR COM PIX": "PAY WITH PIX",
    "FINALIZAR COMPRA": "COMPLETE PURCHASE",
    "Comprar agora": "Buy now",
    "Continuar": "Continue",
    "Próximo": "Next",
    Proximo: "Next",
    Voltar: "Back",
    // PIX result
    "Como pagar?": "How to pay?",
    "Escaneie o QR Code ou copie o código abaixo":
      "Scan the QR Code or copy the code below",
    "Abra o app do seu banco": "Open your bank app",
    "Escaneie o QR Code ou cole o código":
      "Scan the QR Code or paste the code",
    "Confirme o pagamento": "Confirm the payment",
    "Valor total:": "Total amount:",
    "Valor:": "Amount:",
    "Válido até:": "Valid until:",
    "COPIAR CÓDIGO PIX": "COPY PIX CODE",
    "Copiar código PIX": "Copy PIX code",
    "Copiar código": "Copy code",
    Copiado: "Copied",
    "Copiado!": "Copied!",
    Copiar: "Copy",
    // Order bump
    "Sim, adicionar à compra": "Yes, add to my order",
    "Sim, adicionar": "Yes, add",
    "OFERTA ESPECIAL": "SPECIAL OFFER",
    "Adicionar à compra": "Add to my order",
    // Safety / generic
    "Pagamento 100% Seguro": "100% Secure Payment",
    "Pagamento 100% seguro via PIX": "100% secure payment via PIX",
    "PAGAMENTO 100% SEGURO": "100% SECURE PAYMENT",
    "Compra Segura": "Secure Purchase",
    "Pagamento Criptografado": "Encrypted Payment",
    "Garantia 7 dias": "7-day Guarantee",
    "Reembolso integral.": "Full refund.",
    "Reembolso integral": "Full refund",
    "Dados protegidos.": "Data protected.",
    "Site protegido por SSL.": "Site protected by SSL.",
    "Compra 100% segura. Reembolso garantido em 7 dias.":
      "100% secure purchase. 7-day refund guarantee.",
    "Oferta termina em": "Offer ends in",
    "Cupom aplicado": "Coupon applied",
    "Aplicar cupom": "Apply coupon",
    "Adicionar cupom de desconto": "Add discount coupon",
    Cupom: "Coupon",
    Desconto: "Discount",
    Frete: "Shipping",
    Subtotal: "Subtotal",
    Total: "Total",
    // Loading / errors
    "Gerando seu Pix...": "Generating your Pix...",
    "Gerando seu Pix…": "Generating your Pix…",
    "Só um instante.": "Just a moment.",
    "So um instante.": "Just a moment.",
    "Tentar de novo": "Try again",
    "Erro ao gerar Pix.": "Error generating Pix.",
    "Erro de rede.": "Network error.",
    "Erro desconhecido": "Unknown error",
    "Falha ao iniciar pagamento.": "Failed to start payment.",
    Carregando: "Loading",
    "Carregando…": "Loading…",
  },
  es: {
    "Seu pedido": "Tu pedido",
    "Seu carrinho": "Tu carrito",
    "Você está adquirindo:": "Estás comprando:",
    "Dados cadastrais": "Tus datos",
    "Dados de pagamento": "Datos de pago",
    Identificação: "Identificación",
    Identificacao: "Identificación",
    Entrega: "Entrega",
    Pagamento: "Pago",
    "Pagamento via Pix": "Pagar con Pix",
    "Pagamento via PIX": "Pagar con PIX",
    "Aprovação imediata.": "Aprobación inmediata.",
    "Aprovacao imediata.": "Aprobación inmediata.",
    "E-mail": "Correo",
    Email: "Correo",
    "Nome completo": "Nombre completo",
    Nome: "Nombre",
    Telefone: "Teléfono",
    "Telefone / WhatsApp": "Teléfono / WhatsApp",
    CPF: "ID fiscal",
    "CPF / CNPJ": "ID fiscal",
    CEP: "Código Postal",
    Endereço: "Dirección",
    Endereco: "Dirección",
    Número: "Número",
    Numero: "Número",
    Complemento: "Complemento",
    Bairro: "Barrio",
    Cidade: "Ciudad",
    Estado: "Estado",
    País: "País",
    Pais: "País",
    Quantidade: "Cantidad",
    "Seu nome": "Tu nombre",
    "seu@email.com": "tu@correo.com",
    "Digite seu nome": "Ingresa tu nombre",
    "Digite seu e-mail": "Ingresa tu correo",
    "GERAR PIX": "GENERAR PIX",
    "PAGAR AGORA": "PAGAR AHORA",
    "PAGAR COM PIX": "PAGAR CON PIX",
    "FINALIZAR COMPRA": "FINALIZAR COMPRA",
    "Comprar agora": "Comprar ahora",
    Continuar: "Continuar",
    Próximo: "Siguiente",
    Voltar: "Volver",
    "Como pagar?": "¿Cómo pagar?",
    "Abra o app do seu banco": "Abre la app de tu banco",
    "Confirme o pagamento": "Confirma el pago",
    "Valor total:": "Total:",
    "Valor:": "Importe:",
    "Válido até:": "Válido hasta:",
    "COPIAR CÓDIGO PIX": "COPIAR CÓDIGO PIX",
    "Copiar código PIX": "Copiar código PIX",
    "Copiar código": "Copiar código",
    Copiado: "Copiado",
    "Copiado!": "¡Copiado!",
    Copiar: "Copiar",
    "Sim, adicionar à compra": "Sí, agregar al pedido",
    "Sim, adicionar": "Sí, agregar",
    "OFERTA ESPECIAL": "OFERTA ESPECIAL",
    "Pagamento 100% Seguro": "Pago 100% Seguro",
    "Pagamento 100% seguro via PIX": "Pago 100% seguro vía PIX",
    "PAGAMENTO 100% SEGURO": "PAGO 100% SEGURO",
    "Compra Segura": "Compra Segura",
    "Pagamento Criptografado": "Pago Cifrado",
    "Garantia 7 dias": "Garantía 7 días",
    "Reembolso integral.": "Reembolso total.",
    "Compra 100% segura. Reembolso garantido em 7 dias.":
      "Compra 100% segura. Reembolso garantizado en 7 días.",
    "Oferta termina em": "La oferta termina en",
    Cupom: "Cupón",
    Desconto: "Descuento",
    Frete: "Envío",
    Subtotal: "Subtotal",
    Total: "Total",
    "Gerando seu Pix...": "Generando tu Pix...",
    "Gerando seu Pix…": "Generando tu Pix…",
    "Só um instante.": "Solo un momento.",
    "Tentar de novo": "Intentar de nuevo",
    Carregando: "Cargando",
    "Carregando…": "Cargando…",
  },
  fr: {
    "Seu pedido": "Votre commande",
    "Seu carrinho": "Votre panier",
    "Você está adquirindo:": "Vous achetez :",
    "Dados cadastrais": "Vos informations",
    "Dados de pagamento": "Informations de paiement",
    Identificação: "Identification",
    Entrega: "Livraison",
    Pagamento: "Paiement",
    "Pagamento via Pix": "Payer avec Pix",
    Email: "Email",
    "E-mail": "Email",
    Nome: "Nom",
    "Nome completo": "Nom complet",
    Telefone: "Téléphone",
    "GERAR PIX": "GÉNÉRER PIX",
    "PAGAR AGORA": "PAYER MAINTENANT",
    "Comprar agora": "Acheter maintenant",
    Continuar: "Continuer",
    Voltar: "Retour",
    "Valor total:": "Total :",
    "Valor:": "Montant :",
    Copiado: "Copié",
    "Copiado!": "Copié !",
    Copiar: "Copier",
    "Sim, adicionar à compra": "Oui, ajouter à la commande",
    "Pagamento 100% Seguro": "Paiement 100% Sécurisé",
    "Compra Segura": "Achat Sécurisé",
    Cupom: "Coupon",
    Desconto: "Remise",
    Frete: "Livraison",
    Subtotal: "Sous-total",
    Total: "Total",
  },
  it: {
    "Seu pedido": "Il tuo ordine",
    "Seu carrinho": "Il tuo carrello",
    "Você está adquirindo:": "Stai acquistando:",
    "Dados cadastrais": "I tuoi dati",
    "Dados de pagamento": "Dati di pagamento",
    Identificação: "Identificazione",
    Entrega: "Consegna",
    Pagamento: "Pagamento",
    Email: "Email",
    "E-mail": "Email",
    Nome: "Nome",
    "Nome completo": "Nome completo",
    Telefone: "Telefono",
    "GERAR PIX": "GENERA PIX",
    "PAGAR AGORA": "PAGA ORA",
    "Comprar agora": "Acquista ora",
    Continuar: "Continua",
    Voltar: "Indietro",
    "Valor total:": "Totale:",
    "Valor:": "Importo:",
    Copiado: "Copiato",
    "Copiado!": "Copiato!",
    Copiar: "Copia",
    "Pagamento 100% Seguro": "Pagamento 100% Sicuro",
    Cupom: "Coupon",
    Desconto: "Sconto",
    Frete: "Spedizione",
    Subtotal: "Subtotale",
    Total: "Totale",
  },
  de: {
    "Seu pedido": "Deine Bestellung",
    "Seu carrinho": "Dein Warenkorb",
    "Você está adquirindo:": "Du kaufst:",
    "Dados cadastrais": "Deine Daten",
    "Dados de pagamento": "Zahlungsdaten",
    Identificação: "Identifikation",
    Entrega: "Lieferung",
    Pagamento: "Zahlung",
    Email: "E-Mail",
    "E-mail": "E-Mail",
    Nome: "Name",
    "Nome completo": "Vollständiger Name",
    Telefone: "Telefon",
    "GERAR PIX": "PIX ERSTELLEN",
    "PAGAR AGORA": "JETZT BEZAHLEN",
    "Comprar agora": "Jetzt kaufen",
    Continuar: "Weiter",
    Voltar: "Zurück",
    "Valor total:": "Gesamtbetrag:",
    "Valor:": "Betrag:",
    Copiado: "Kopiert",
    "Copiado!": "Kopiert!",
    Copiar: "Kopieren",
    "Pagamento 100% Seguro": "100% Sichere Zahlung",
    Cupom: "Gutschein",
    Desconto: "Rabatt",
    Frete: "Versand",
    Subtotal: "Zwischensumme",
    Total: "Gesamt",
  },
};

/** Atributo no nodo de texto pra nao retraduzir nem entrar em loop. */
const TRANSLATED_MARK = "__tp_translated_v1";

function translateText(raw: string, lang: string): string | null {
  const dict = DICT[lang];
  if (!dict) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Lookup direto pelo trim
  const direct = dict[trimmed];
  if (direct) {
    // Preserva whitespace original (leading/trailing)
    return raw.replace(trimmed, direct);
  }
  return null;
}

function walkAndTranslate(root: Node, lang: string) {
  // TreeWalker so de text nodes — performance bom.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodesToUpdate: Array<{ node: Text; newText: string }> = [];
  let n: Node | null = walker.currentNode === root ? walker.nextNode() : walker.currentNode;
  while (n) {
    const txt = n as Text;
    const parent = txt.parentElement;
    // Skip <script>, <style>, contenteditable, inputs (placeholders sao tratados separado)
    if (
      parent &&
      (parent.tagName === "SCRIPT" ||
        parent.tagName === "STYLE" ||
        parent.tagName === "TEXTAREA")
    ) {
      n = walker.nextNode();
      continue;
    }
    // Skip ja-traduzidos
    if (parent?.dataset?.[TRANSLATED_MARK]) {
      n = walker.nextNode();
      continue;
    }
    const translated = translateText(txt.data, lang);
    if (translated && translated !== txt.data) {
      nodesToUpdate.push({ node: txt, newText: translated });
    }
    n = walker.nextNode();
  }
  // Aplica todas as mudancas EM BATCH pra MutationObserver nao loopar
  // (vamos disconectar/reconectar no caller).
  for (const u of nodesToUpdate) {
    u.node.data = u.newText;
    if (u.node.parentElement) {
      u.node.parentElement.dataset[TRANSLATED_MARK] = "1";
    }
  }

  // Traduz placeholders e value de inputs/labels visiveis tambem
  if (root instanceof Element || root === document) {
    const rootEl = root === document ? document.documentElement : (root as Element);
    rootEl.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((el) => {
      const input = el as HTMLInputElement;
      const orig = input.getAttribute("placeholder") ?? "";
      const t = translateText(orig, lang);
      if (t && t !== orig) input.setAttribute("placeholder", t);
    });
    rootEl.querySelectorAll("[title]").forEach((el) => {
      const orig = el.getAttribute("title") ?? "";
      const t = translateText(orig, lang);
      if (t && t !== orig) el.setAttribute("title", t);
    });
    rootEl.querySelectorAll("[aria-label]").forEach((el) => {
      const orig = el.getAttribute("aria-label") ?? "";
      const t = translateText(orig, lang);
      if (t && t !== orig) el.setAttribute("aria-label", t);
    });
  }
}

function detectLang(): string {
  if (typeof navigator === "undefined") return "pt";
  const raw = (navigator.language || "pt").toLowerCase();
  const base = raw.split("-")[0];
  return base;
}

/**
 * Wrapper que ativa traducao automatica quando habilitado.
 * Quando OFF, retorna so {children}.
 */
export function AutoTranslate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const lang = detectLang();
    // Marca <html lang> pra Chrome/Edge oferecerem auto-translate completo
    // como fallback (cobre strings nao mapeadas tipo descricao do produto).
    try {
      document.documentElement.setAttribute("lang", "pt-BR");
      document.documentElement.setAttribute("translate", "yes");
    } catch {}

    // Se idioma do navegador eh PT, nao faz nada — checkout ja esta em PT.
    if (lang === "pt") return;
    // Se idioma nao tem dicionario, deixa o Chrome auto-translate cobrir.
    if (!DICT[lang]) return;

    // Roda primeira passada apos um microtick pra deixar o React montar tudo.
    const firstRun = window.setTimeout(() => {
      walkAndTranslate(document.body, lang);
      ranRef.current = true;
    }, 0);

    // Observa mudancas no DOM (re-renderizacoes, troca de step, etc).
    // Quando muda, retraduz o subtree afetado.
    const observer = new MutationObserver((mutations) => {
      // Throttle: agrega num rAF pra nao processar mutation-por-mutation.
      window.requestAnimationFrame(() => {
        for (const m of mutations) {
          if (m.type === "childList") {
            m.addedNodes.forEach((n) => {
              if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) {
                walkAndTranslate(n, lang);
              }
            });
          } else if (m.type === "characterData" && m.target.parentElement) {
            // Re-render mudou um text node ja traduzido — limpa marca e refaz
            delete m.target.parentElement.dataset[TRANSLATED_MARK];
            walkAndTranslate(m.target.parentElement, lang);
          }
        }
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      window.clearTimeout(firstRun);
      observer.disconnect();
    };
  }, [enabled]);

  return <>{children}</>;
}
