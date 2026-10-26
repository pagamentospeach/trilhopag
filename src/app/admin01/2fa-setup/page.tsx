import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getCurrentAdminSession } from "@/lib/admin-auth";
import { startTotpSetup } from "../actions";
import { Setup2faClient } from "./client";

/**
 * Primeiro login de cada sócio: configurar o Google Authenticator.
 *
 * 08/08/2026 — BUG CORRIGIDO: quando a conta JÁ tinha um secret gravado, o
 * QR era montado com o valor do banco direto. Só que o secret é guardado
 * CIFRADO (`encryptString`), então o QR entregava o blob cifrado em vez do
 * Base32 — o app gerava códigos que nunca batiam e a conta ficava trancada
 * pra sempre. Agora decifra antes de montar a URL.
 */
export default async function Setup2faPage() {
  const r = await getCurrentAdminSession();
  if (!r) redirect("/admin01/login");
  if (r.admin.totpSecret && r.session.mfaPassed) {
    redirect("/admin01/dashboard");
  }

  let base32: string;
  let otpauthUrl: string;

  if (!r.admin.totpSecret) {
    const res = await startTotpSetup();
    if (!res.ok) {
      return <div className="p-12 text-center text-red-300">{res.error}</div>;
    }
    base32 = res.base32;
    otpauthUrl = res.otpauthUrl;
  } else {
    // Secret já existe (recarregou a página no meio do setup): mostra o
    // MESMO de novo em vez de gerar outro, senão o QR que ele acabou de
    // escanear deixaria de valer.
    const { decryptString } = await import("@/lib/crypto");
    try {
      base32 = decryptString(r.admin.totpSecret);
    } catch {
      // Valor legacy salvo sem cifra, de antes da migração.
      base32 = r.admin.totpSecret;
    }
    const issuer = encodeURIComponent("Trilho");
    const label = encodeURIComponent(`Trilho:${r.admin.email}`);
    otpauthUrl = `otpauth://totp/${label}?secret=${base32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  }

  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    width: 280,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return <Setup2faClient qrDataUrl={qrDataUrl} secret={base32} />;
}
