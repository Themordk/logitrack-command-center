/* global self, caches, URLPattern */
// Importado pelo service worker gerado pelo Workbox (vite.config.ts › workbox.importScripts).
//
// 1. Static Routing API: chamadas ao Supabase vão direto para a rede, sem acordar o
//    service worker. Sem isso, com o SW parado (o navegador o encerra após ~30 s
//    ocioso), a primeira consulta de cada clique esperava ele subir.
//    Navegadores sem a API ignoram o bloco: como não há rota do Workbox para o
//    Supabase, o SW só repassa a requisição sem cachear.
// 2. Remove o cache "supabase-api" da versão anterior, que guardava respostas da API
//    (dados de negócio) por até 1 h no navegador.
self.addEventListener("install", (event) => {
  if (typeof event.addRoutes !== "function" || typeof URLPattern === "undefined") return;
  event.waitUntil(
    Promise.resolve(
      event.addRoutes([
        {
          condition: { urlPattern: new URLPattern({ protocol: "https", hostname: "*.supabase.co" }) },
          source: "network",
        },
      ]),
    ).catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("supabase-api").catch(() => false));
});
