/* SeeAll — service worker da versão instalável (PWA), desde a 2.3.45.
   Guarda SÓ os arquivos do próprio app (a página, as bibliotecas de leitura e os ícones), para o app
   abrir rápido e continuar abrindo sem internet. NUNCA guarda dados do usuário: pedidos para outros
   endereços (Supabase, Google, fontes) passam direto, sem tocar no cache, e nada além de GET do
   próprio site é interceptado. Os dados financeiros continuam onde sempre estiveram (no aparelho e
   na conta), fora deste cache.
   Não é registrado dentro do app Android (Capacitor): lá os arquivos já vêm no próprio APK/AAB.

   A cada versão nova do app, troque VERSAO abaixo: é isso que faz o navegador baixar a versão nova
   e oferecer "Atualizar" (a página antiga continua funcionando até a pessoa aceitar). */
const VERSAO = '2.3.48';
const CACHE = 'seeall-app-' + VERSAO;
// o essencial para abrir o app; as bibliotecas grandes (pdf.js, OCR) entram no cache quando forem usadas
const ESSENCIAL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', evento=>{
  evento.waitUntil(caches.open(CACHE).then(c=> c.addAll(ESSENCIAL.map(u=> new Request(u, { cache:'reload' })))));
  // sem skipWaiting aqui: a versão nova só assume quando a pessoa tocar em "Atualizar" (nunca no meio de uma importação)
});

self.addEventListener('activate', evento=>{
  evento.waitUntil((async ()=>{
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n=> n.startsWith('seeall-app-') && n !== CACHE).map(n=> caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', evento=>{
  if(evento.data && evento.data.tipo === 'ATUALIZAR') self.skipWaiting();
});

function guardavel(resposta){
  return resposta && resposta.ok && resposta.type === 'basic';
}

self.addEventListener('fetch', evento=>{
  const pedido = evento.request;
  if(pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if(url.origin !== self.location.origin) return; // Supabase, Google etc.: o navegador resolve, sem cache daqui
  const escopo = new URL(self.registration.scope);
  if(!url.pathname.startsWith(escopo.pathname)) return;

  // a página: primeiro a rede (para sempre pegar a versão publicada); sem internet, a última guardada
  if(pedido.mode === 'navigate'){
    evento.respondWith((async ()=>{
      try{
        const resposta = await fetch(pedido);
        if(guardavel(resposta)){ const c = await caches.open(CACHE); c.put('index.html', resposta.clone()); }
        return resposta;
      }catch(e){
        const guardada = await caches.match('index.html', { cacheName:CACHE }) || await caches.match('./', { cacheName:CACHE });
        if(guardada) return guardada;
        throw e;
      }
    })());
    return;
  }

  // bibliotecas, ícones e o manifesto: arquivos estáticos que só mudam junto com a versão
  const relativo = url.pathname.slice(escopo.pathname.length);
  const estatico = relativo.startsWith('libs/') || relativo.startsWith('icons/') || relativo === 'manifest.webmanifest';
  if(!estatico || url.search) return;
  evento.respondWith((async ()=>{
    const c = await caches.open(CACHE);
    const guardada = await c.match(pedido);
    if(guardada) return guardada;
    const resposta = await fetch(pedido);
    if(guardavel(resposta)) c.put(pedido, resposta.clone());
    return resposta;
  })());
});
