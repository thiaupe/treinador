// Service worker do app Treinador: recebe as mensagens e guarda o histórico.
const CACHE = 'treinador-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // rede primeiro, cache se estiver offline
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('treinador', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('msgs', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function save(msg) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction('msgs', 'readwrite');
      tx.objectStore('msgs').put(msg);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch (_) {}
}

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data ? e.data.text() : '' }; }
  // guarda todos os campos (treino, texto, lesoes, semana e o que vier depois)
  const msg = Object.assign({}, data, {
    id: data.id || String(Date.now()),
    ts: data.ts || new Date().toISOString(),
    title: data.title || 'Treinador',
    body: data.body || '',
    kind: data.kind || 'msg',
  });
  e.waitUntil((async () => {
    await save(msg);
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach((c) => c.postMessage({ type: 'nova-mensagem' }));
    await self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: './icons/icon-192.png',
      badge: './icons/badge-96.png',
      tag: data.tag || msg.id,
      data: { url: './' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  })());
});
