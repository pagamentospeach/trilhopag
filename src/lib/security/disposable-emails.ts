/**
 * Lista curada de domínios de EMAIL TEMPORÁRIO / DISPOSABLE.
 *
 * Contexto (16/07/2026): pentester usou `pentest-1@exemplo.com`,
 * `pentest-2@exemplo.com`, `pentest-3@exemplo.com` pra criar contas
 * de teste. Vamos bloquear na porta.
 *
 * O que ENTRA nessa lista:
 *   - Serviços de email temporário PÚBLICO onde qualquer um lê a inbox
 *     sem autenticar (Mailinator, YopMail, GuerrillaMail, 10minutemail).
 *   - Serviços de email "só recebe, expira em X minutos" (Temp-Mail,
 *     TempMailAddress, EmailOnDeck).
 *   - Aliases conhecidos desses serviços (sharklasers.com = GuerrillaMail).
 *   - "Piadas brasileiras" tipo tuamaeaquelaursa/piadas.com.
 *   - Domínios óbvios de teste: fake.com, test.com, example.com.
 *
 * O que NÃO ENTRA (importante — sellers legítimos usam):
 *   - ProtonMail / Proton.me → privacidade REAL, muito comum no BR
 *   - Tutanota / Tuta.io    → idem
 *   - Firemail / SimpleLogin → aliases sérios pra privacidade
 *   - Hotmail / Outlook / iCloud / Gmail / Yahoo → mainstream
 *   - Webmails BR (uol, bol, terra, ig, r7)
 *
 * Manutenção: adicionar novos conforme descobrir abuso. Se um seller
 * legítimo cair, remover E investigar caso a caso.
 */

const DISPOSABLE_DOMAINS = new Set<string>([
  // Mailinator + clones
  "mailinator.com",
  "mailinator.net",
  "mailinator.org",
  "mailinater.com",
  "notmailinator.com",
  "reallymymail.com",
  "spamgourmet.com",

  // GuerrillaMail (várias aliases)
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamail.biz",
  "guerrillamail.de",
  "guerrillamail.net",
  "guerrillamail.org",
  "sharklasers.com",
  "grr.la",
  "spam4.me",
  "pokemail.net",

  // 10 Minute Mail + clones
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "30minutemail.com",
  "10minemail.com",
  "10minutesmail.com",
  "10minutmail.xyz",

  // Temp-Mail + variações
  "temp-mail.org",
  "temp-mail.io",
  "temp-mail.ru",
  "tempmail.com",
  "tempmail.email",
  "tempmail.plus",
  "tempmail.ninja",
  "tempmail.us.com",
  "tempmailaddress.com",
  "tempmailer.com",
  "tempinbox.com",
  "tempinbox.co.uk",
  "tempinbox.xyz",
  "tempmailo.com",
  "temporary-mail.net",

  // YopMail + aliases
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "cool.fr.nf",
  "jetable.fr.nf",
  "nospam.ze.tc",
  "nomail.xl.cx",
  "mega.zik.dj",
  "speed.1s.fr",

  // Trashmail / Nada / clones
  "trashmail.com",
  "trashmail.de",
  "trashmail.io",
  "trashmail.net",
  "trashmail.ws",
  "getnada.com",
  "nadamail.com",
  "dispostable.com",
  "fakeinbox.com",
  "mailnesia.com",
  "mailnull.com",
  "mytrashmail.com",
  "throwawaymail.com",
  "throwaway.email",
  "burnermail.io",
  "burnermail.com",

  // Maildrop / Discard
  "maildrop.cc",
  "discard.email",
  "discardmail.com",
  "discardmail.de",

  // EmailOnDeck / GetAirMail
  "emailondeck.com",
  "getairmail.com",
  "airmail.cc",

  // Moakt + variações
  "moakt.com",
  "moakt.cc",
  "moakt.ws",

  // Spambog / SpamHole
  "spambog.com",
  "spambog.de",
  "spambog.ru",
  "spam.la",
  "spamhole.com",
  "spamex.com",

  // Inbox / MailBox variantes descartáveis
  "inboxbear.com",
  "inboxkitten.com",
  "inboxalias.com",
  "mailbox.org.uk",
  "mailboxr.com",

  // Fake / Test / Example (proibidos por padrão — nunca vão pra prod)
  "fake.com",
  "fakemail.com",
  "fakemailgenerator.com",
  "test.com",
  "test.test",
  "testing.com",
  "example.com",
  "example.org",
  "example.net",
  "email.com", // muito abusado tb
  "hacker.test",

  // "Piadas" BR
  "tuamaeaquelaursa.com",
  "tuamaeaquelaursa.net",
  "meumail.com", // se aparecer legítimo, tirar
  "piada.com",
  "cuvox.de",
  "einrot.com",
  "fleckens.hu",
  "gustr.com",
  "jourrapide.com",
  "rhyta.com",
  "superrito.com",
  "teleworm.us",

  // Outros comumente abusados por bots
  "mailcatch.com",
  "harakirimail.com",
  "spambox.us",
  "gettempmail.com",
  "linshiyou.com",
  "chacuo.net",
  "mail1a.de",
  "mail.tm",
  "mvrht.com",
  "mvrht.net",
  "smtptest.com",
  "wegwerfemail.de",
  "wegwerfmail.de",
  "wegwerfmail.net",
  "wegwerfmail.org",
  "byom.de",
  "eyepaste.com",
  "mailexpire.com",
  "objectmail.com",
  "proxymail.eu",
  "rcpt.at",
  "safe-mail.net",
  "sogetthis.com",
  "spamavert.com",
  "spamfree24.com",
  "spamfree24.de",
  "spamfree24.eu",
  "spamfree24.info",
  "spamfree24.net",
  "spamfree24.org",
  "spaml.de",
  "spamspot.com",
  "supergreatmail.com",
  "trbvm.com",
  "trbvn.com",
  "yuurok.com",
  "znoid.com",
  "veryrealemail.com",
  "20mail.eu",
  "20mail.it",
  "boxonline.info",
  "getmails.eu",
  "iheartspam.org",
  "loadby.us",
  "moonwake.com",
  "pjjkp.com",
  "poofy.org",
  "post-shift.ru",
  "put2.net",
  "sneakemail.com",
  "spamherelots.com",
  "supermailer.jp",
  "vpn.st",
  "wilemail.com",
]);

/**
 * Retorna true se o email termina em domain conhecido como temporário.
 * Case-insensitive. Aceita email completo ou só domain.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  const domain = lower.includes("@") ? lower.split("@")[1] ?? "" : lower;
  if (!domain) return false;
  // Match exato do domain
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // Match subdomain: `x.mailinator.com` → checa `mailinator.com`
  const parts = domain.split(".");
  for (let i = 1; i < parts.length; i++) {
    const parent = parts.slice(i).join(".");
    if (DISPOSABLE_DOMAINS.has(parent)) return true;
  }
  return false;
}

/**
 * Lista de todos os domains bloqueados (pra debug/admin panel).
 */
export function getDisposableDomains(): string[] {
  return [...DISPOSABLE_DOMAINS].sort();
}
