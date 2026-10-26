/**
 * Lógica de decisão do Trilho Cloaker.
 * Para cada hit: decide se manda pra "money" (oferta) ou "white" (página segura).
 */

// Lista de user agents suspeitos (crawlers, scrapers, moderadores)
const BOT_UA_PATTERNS = [
  /facebookexternalhit/i,
  /facebot/i,
  /facebookcatalog/i,
  /facebookplatform/i,
  /meta-externalagent/i,
  /googlebot/i,
  /adsbot-google/i,
  /mediapartners-google/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /sogou/i,
  /exabot/i,
  /ia_archiver/i,
  /tiktokbot/i,
  /bytespider/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /slackbot/i,
  /discordbot/i,
  /pinterest/i,
  /vkshare/i,
  /pingdom/i,
  /uptimerobot/i,
  /sitespeedio/i,
  /lighthouse/i,
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /selenium/i,
  /chrome-lighthouse/i,
  /python-requests/i,
  /curl\//i,
  /wget\//i,
  /go-http-client/i,
  /node-fetch/i,
  /axios/i,
  /^java/i,
  /apache-httpclient/i,
  /scrapy/i,
  /httpx/i,
  /^bot/i,
  /spider/i,
  /crawler/i,
  /scanner/i,
];

// Faixas de IP de datacenters conhecidos (AWS, GCP, Azure, Hetzner, OVH, DigitalOcean)
// Aqui usamos só os primeiros octetos pra evitar lookup pesado.
// Em produção idealmente: ASN lookup via MaxMind ou IPInfo.
const DATACENTER_IP_PREFIXES = [
  // AWS
  "3.", "13.", "15.", "18.", "34.", "35.", "52.", "54.", "75.",
  // GCP
  "8.34.", "8.35.", "23.236.", "23.251.", "34.64.", "34.65.", "34.66.", "34.67.",
  "34.68.", "34.69.", "34.70.", "34.71.", "34.72.", "34.73.", "34.74.", "34.75.",
  "34.76.", "34.77.", "34.78.", "34.79.", "34.80.", "34.81.", "34.82.", "34.83.",
  "34.84.", "34.85.", "34.86.", "34.87.", "34.88.", "34.89.", "34.90.", "34.91.",
  "34.92.", "34.93.", "34.94.", "34.95.", "34.96.", "34.97.", "34.98.", "34.99.",
  "34.100.", "34.101.", "34.102.", "34.103.", "34.104.", "34.105.", "34.106.",
  // Azure
  "20.", "40.", "65.52.", "70.37.", "104.40.", "104.41.", "104.42.", "104.43.",
  "104.44.", "104.45.", "104.46.", "104.47.", "131.107.", "138.91.",
  // DigitalOcean
  "104.131.", "104.236.", "138.197.", "138.68.", "139.59.", "142.93.", "143.110.",
  "143.198.", "146.190.", "159.65.", "159.89.", "159.203.", "159.223.", "161.35.",
  "164.92.", "165.22.", "165.227.", "167.71.", "167.99.", "170.187.",
  // Hetzner
  "5.9.", "5.45.", "5.75.", "5.161.", "23.88.", "37.27.", "46.4.", "49.12.",
  "78.46.", "78.47.", "88.99.", "91.107.", "94.130.", "95.216.", "95.217.",
  "116.202.", "135.181.", "136.243.", "138.201.", "144.76.", "148.251.",
  "159.69.", "162.55.", "168.119.", "176.9.",
  // OVH
  "5.39.", "5.135.", "5.196.", "37.187.", "37.59.", "46.105.", "51.15.", "51.38.",
  "51.68.", "51.75.", "51.77.", "51.83.", "51.89.", "51.91.", "51.210.", "51.222.",
  "51.254.", "54.36.", "54.37.", "54.38.", "54.39.", "92.222.", "94.23.",
  "137.74.", "139.99.", "141.94.", "141.95.", "142.4.", "144.217.", "146.59.",
  "147.135.", "149.202.", "151.80.", "158.69.", "163.172.", "164.132.", "167.114.",
  "188.165.", "188.166.", "192.99.", "192.95.", "198.27.", "198.50.", "212.83.",
  // Vultr
  "45.32.", "45.63.", "45.76.", "45.77.", "45.79.", "66.42.", "108.61.", "144.202.",
  "149.28.", "155.138.", "207.246.", "208.85.", "216.155.",
  // Linode
  "45.33.", "45.56.", "45.79.", "50.116.", "63.209.", "66.175.", "66.228.",
  "69.164.", "72.14.", "74.207.", "96.126.", "97.107.", "104.200.", "139.144.",
  "172.104.", "172.105.", "173.230.", "173.255.", "176.58.", "178.79.", "192.46.",
  "192.81.", "198.58.", "198.74.",
];

type DecisionInput = {
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  country: string | null;
  utmSource: string | null;
  campaign: {
    blockDatacenterIps: boolean;
    blockBotUA: boolean;
    blockNoReferer: boolean;
    blockCountries: string[];
    allowCountries: string[];
    blockProxy: boolean;
    blockOldBrowsers: boolean;
    requireReferer: string | null;
    blockedIps: string[];
    allowedIps: string[];
    blockedUAs: string[];
    requireUtmSources: string[];
  };
};

export type CloakerDecision = {
  decision: "money" | "white";
  reason: string | null;
};

export function decideCloaker(input: DecisionInput): CloakerDecision {
  const c = input.campaign;
  const ip = input.ip ?? "";
  const ua = input.userAgent ?? "";
  const ref = input.referer ?? "";
  const ctry = (input.country ?? "").toUpperCase();

  // 1) Whitelist de IPs sempre passa (override)
  if (c.allowedIps.includes(ip)) {
    return { decision: "money", reason: null };
  }

  // 2) Bloqueio explícito de IP
  if (c.blockedIps.includes(ip)) {
    return { decision: "white", reason: "blocked_ip" };
  }

  // 3) Bloqueio de UA explícito (substring)
  for (const blocked of c.blockedUAs) {
    if (blocked && ua.toLowerCase().includes(blocked.toLowerCase())) {
      return { decision: "white", reason: "blocked_ua_custom" };
    }
  }

  // 4) Bot UA (heurística)
  if (c.blockBotUA && ua) {
    for (const re of BOT_UA_PATTERNS) {
      if (re.test(ua)) {
        return { decision: "white", reason: "bot_ua" };
      }
    }
  }

  // 5) Datacenter IP
  if (c.blockDatacenterIps && ip) {
    for (const prefix of DATACENTER_IP_PREFIXES) {
      if (ip.startsWith(prefix)) {
        return { decision: "white", reason: "datacenter_ip" };
      }
    }
  }

  // 6) Sem referer
  if (c.blockNoReferer && !ref) {
    return { decision: "white", reason: "no_referer" };
  }

  // 7) Referer obrigatório (regex)
  if (c.requireReferer) {
    try {
      const re = new RegExp(c.requireReferer);
      if (!re.test(ref)) {
        return { decision: "white", reason: "referer_mismatch" };
      }
    } catch {
      /* regex inválido — ignora */
    }
  }

  // 8) País bloqueado / whitelist
  if (c.allowCountries.length > 0 && !c.allowCountries.includes(ctry)) {
    return { decision: "white", reason: "country_not_in_allowlist" };
  }
  if (c.blockCountries.length > 0 && c.blockCountries.includes(ctry)) {
    return { decision: "white", reason: "country_blocked" };
  }

  // 9) Proxy/VPN (placeholder — sem ASN lookup ainda)
  // TODO: integrar IPHub ou ProxyCheck. Por enquanto noop se blockProxy=true.

  // 10) Browser muito antigo (heurística simples)
  if (c.blockOldBrowsers && ua) {
    if (/MSIE \d|Trident/i.test(ua)) {
      return { decision: "white", reason: "old_browser" };
    }
  }

  // 11) UTM obrigatória
  if (c.requireUtmSources.length > 0) {
    const src = (input.utmSource ?? "").toLowerCase();
    if (!c.requireUtmSources.some((s) => s.toLowerCase() === src)) {
      return { decision: "white", reason: "utm_not_in_allowlist" };
    }
  }

  return { decision: "money", reason: null };
}
