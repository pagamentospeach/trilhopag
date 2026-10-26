import { createHash } from "node:crypto";
import { prisma } from "./prisma";

type Platform = "FACEBOOK" | "TIKTOK" | "KWAI" | "GOOGLE_ADS" | "GA4" | "TABOOLA";

export type PurchaseEvent = {
  transactionId: string;
  amountCents: number;
  netCents?: number;
  currency: string;
  productId?: string | null;
  email?: string | null;
  phone?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  gclid?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

function sha256(s: string) {
  return createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
}

export async function fireConversionEvents(userId: string, ev: PurchaseEvent) {
  // Fire pixels that are either:
  //  - account-wide (productId = null), OR
  //  - tied to this specific product
  const pixels = await prisma.trackingPixel.findMany({
    where: {
      userId,
      active: true,
      eventPurchase: true,
      OR: [
        { productId: null },
        ...(ev.productId ? [{ productId: ev.productId }] : []),
      ],
    },
  });

  // Each pixel honors its valueMode (gross or net)
  const results = await Promise.allSettled(
    pixels.map((p) => {
      const value =
        p.valueMode === "net" && ev.netCents != null ? ev.netCents : ev.amountCents;
      return fireOnePlatform(p.platform as Platform, p, { ...ev, amountCents: value });
    }),
  );
  return results.map((r, i) => ({
    platform: pixels[i].platform,
    pixelId: pixels[i].pixelId,
    ok: r.status === "fulfilled",
    error: r.status === "rejected" ? String(r.reason) : null,
  }));
}

async function fireOnePlatform(
  platform: Platform,
  pixel: { pixelId: string; capiToken: string | null; testEventCode: string | null },
  ev: PurchaseEvent,
) {
  switch (platform) {
    case "FACEBOOK":
      return facebookCAPI(pixel, ev);
    case "TIKTOK":
      return tiktokEvents(pixel, ev);
    case "KWAI":
      return kwaiEvents(pixel, ev);
    case "GOOGLE_ADS":
      return googleAdsConversion(pixel, ev);
    case "GA4":
      return ga4MeasurementProtocol(pixel, ev);
    default:
      return null;
  }
}

async function facebookCAPI(
  pixel: { pixelId: string; capiToken: string | null; testEventCode: string | null },
  ev: PurchaseEvent,
) {
  if (!pixel.capiToken) return null;
  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.transactionId,
        action_source: "website",
        user_data: {
          em: ev.email ? [sha256(ev.email)] : undefined,
          ph: ev.phone ? [sha256(ev.phone)] : undefined,
          fbc: ev.fbclid ? `fb.1.${Date.now()}.${ev.fbclid}` : undefined,
          client_ip_address: ev.ip ?? undefined,
          client_user_agent: ev.userAgent ?? undefined,
        },
        custom_data: {
          currency: ev.currency,
          value: ev.amountCents / 100,
          // UTM enrichment — Facebook usa esses campos pra atribuição mais
          // precisa de campanhas no Ads Manager (especialmente quando a
          // landing page é diferente do checkout)
          ...(ev.utmSource ? { utm_source: ev.utmSource } : {}),
          ...(ev.utmCampaign ? { utm_campaign: ev.utmCampaign } : {}),
          ...(ev.productId ? { content_ids: [ev.productId], content_type: "product" } : {}),
        },
      },
    ],
    ...(pixel.testEventCode ? { test_event_code: pixel.testEventCode } : {}),
  };
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pixel.pixelId}/events?access_token=${pixel.capiToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) throw new Error(`FB ${res.status}: ${await res.text()}`);
  return res.json();
}

async function tiktokEvents(
  pixel: { pixelId: string; capiToken: string | null; testEventCode: string | null },
  ev: PurchaseEvent,
) {
  if (!pixel.capiToken) return null;
  const body = {
    event_source: "web",
    event_source_id: pixel.pixelId,
    ...(pixel.testEventCode ? { test_event_code: pixel.testEventCode } : {}),
    data: [
      {
        event: "CompletePayment",
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.transactionId,
        user: {
          email: ev.email ? [sha256(ev.email)] : undefined,
          phone: ev.phone ? [sha256(ev.phone)] : undefined,
          ttclid: ev.ttclid ?? undefined,
          ip: ev.ip ?? undefined,
          user_agent: ev.userAgent ?? undefined,
        },
        properties: {
          currency: ev.currency,
          value: ev.amountCents / 100,
        },
      },
    ],
  };
  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: {
      "Access-Token": pixel.capiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`TikTok ${res.status}: ${await res.text()}`);
  return res.json();
}

async function kwaiEvents(
  pixel: { pixelId: string; capiToken: string | null },
  ev: PurchaseEvent,
) {
  if (!pixel.capiToken) return null;
  const body = {
    pixel_id: pixel.pixelId,
    event: "PURCHASE",
    event_time: Math.floor(Date.now() / 1000),
    event_id: ev.transactionId,
    properties: {
      currency: ev.currency,
      value: ev.amountCents / 100,
    },
    user: {
      email: ev.email ? sha256(ev.email) : undefined,
      phone: ev.phone ? sha256(ev.phone) : undefined,
      ip: ev.ip ?? undefined,
      user_agent: ev.userAgent ?? undefined,
    },
  };
  const res = await fetch("https://www.adsnebula.com/log/common/api", {
    method: "POST",
    headers: {
      "Access-Token": pixel.capiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Kwai ${res.status}: ${await res.text()}`);
  return res.json();
}

async function googleAdsConversion(
  pixel: { pixelId: string; capiToken: string | null },
  ev: PurchaseEvent,
) {
  if (!pixel.capiToken || !ev.gclid) return null;
  const body = {
    conversions: [
      {
        gclid: ev.gclid,
        conversion_action: `customers/${pixel.pixelId}/conversionActions/${pixel.capiToken.split(":")[1] ?? ""}`,
        conversion_date_time: new Date().toISOString().replace("T", " ").replace("Z", "+0000"),
        conversion_value: ev.amountCents / 100,
        currency_code: ev.currency,
      },
    ],
  };
  const res = await fetch(
    `https://googleads.googleapis.com/v17/customers/${pixel.pixelId}:uploadClickConversions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pixel.capiToken.split(":")[0]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) throw new Error(`Google Ads ${res.status}: ${await res.text()}`);
  return res.json();
}

async function ga4MeasurementProtocol(
  pixel: { pixelId: string; capiToken: string | null },
  ev: PurchaseEvent,
) {
  if (!pixel.capiToken) return null;
  const [measurementId, apiSecret] = [pixel.pixelId, pixel.capiToken];
  const body = {
    client_id: ev.transactionId,
    events: [
      {
        name: "purchase",
        params: {
          currency: ev.currency,
          value: ev.amountCents / 100,
          transaction_id: ev.transactionId,
        },
      },
    ],
  };
  const res = await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) throw new Error(`GA4 ${res.status}: ${await res.text()}`);
  return { ok: true };
}
