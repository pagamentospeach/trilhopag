/**
 * Trilho Service Worker — Web Push handler.
 *
 * Mantém propositadamente simples: nada de cache aggressive (gateway é
 * dynamic), foco 100% em receber push e mostrar notificação amigável.
 *
 * Eventos:
 *  - install/activate: assume controle imediato (skipWaiting + claim)
 *  - push: renderiza notificação com title/body/icon/url do payload
 *  - notificationclick: foca tab existente ou abre nova
 */

self.addEventListener("install", (event) => {
  // Ativa o novo SW assim que possível
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Trilho",
    body: "Você tem uma nova notificação.",
    url: "/dashboard",
    icon: "/trilhopag-logo2.png",
    badge: "/trilhopag-logo2.png",
    tag: "trilhopag-default",
  };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = { ...payload, ...json };
    } catch (_e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    tag: payload.tag,
    // renotify garante que o usuário veja se o mesmo tag chegar de novo
    renotify: payload.tag !== "trilhopag-default",
    vibrate: [180, 80, 180],
    requireInteraction: false,
    data: {
      url: payload.url,
      kind: payload.kind || "generic",
    },
    actions: payload.actions || [
      { action: "open", title: "Abrir" },
    ],
  };

  // Robustez cross-device: alguns navegadores (Safari/iOS, versões antigas)
  // REJEITAM showNotification quando recebem opções que não suportam
  // (actions/vibrate/renotify). Se a chamada cheia falhar, refaz com o
  // conjunto MÍNIMO garantido — assim a notificação SEMPRE aparece, em vez de
  // sumir em silêncio só em alguns aparelhos.
  event.waitUntil(
    self.registration.showNotification(payload.title, options).catch(() => {
      return self.registration
        .showNotification(payload.title, {
          body: payload.body,
          icon: payload.icon,
          tag: payload.tag,
          data: options.data,
        })
        .catch(() => {});
    }),
  );
});

/**
 * pushsubscriptionchange — o navegador/push-service ROTACIONA ou EXPIRA a
 * subscription periodicamente (comum em Android/FCM e após updates). Sem
 * tratar este evento, o endpoint salvo no servidor vira lixo, os envios
 * falham em silêncio e "param de chegar em alguns aparelhos". Aqui a gente
 * re-inscreve com a VAPID key e re-registra a nova sub no servidor.
 *
 * Não dispara quando o USER desinscreve (só em rotação automática), então
 * re-inscrever aqui é correto — não desfaz um "desativar" manual.
 */
function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/push/vapid");
        const data = await res.json().catch(() => null);
        if (!data || !data.publicKey) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(data.publicKey),
        });
        const body = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: body.endpoint, keys: body.keys }),
        });
      } catch (_e) {
        // best-effort — sem client aberto pode faltar cookie de sessão
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  // Resolve para URL absoluta dentro do scope
  const targetUrl = new URL(target, self.location.origin).toString();

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Tenta focar uma janela já aberta no domínio
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin) {
            if ("focus" in client) {
              await client.focus();
              if ("navigate" in client && client.url !== targetUrl) {
                await client.navigate(targetUrl).catch(() => {});
              }
              return;
            }
          }
        } catch (_e) {
          // ignora URLs inválidas
        }
      }

      // Senão, abre nova
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
