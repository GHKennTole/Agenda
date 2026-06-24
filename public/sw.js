const CACHE_NAME = 'mi-agenda-v1';
const ASSETS = [
  '/',
  '/login',
  '/manifest.json',
  '/favicon.ico'
];

// Instalar Service Worker y cachear recursos estáticos básicos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activar y limpiar cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar peticiones para servir desde cache de forma inteligente
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Evitar interceptar peticiones que no sean GET, ni llamadas a la base de datos o desarrollo local
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/_next/webpack-hmr') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Devolver recurso cacheado e intentar actualizar en segundo plano
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => {/* Silenciar errores de red en segundo plano */});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // Cachear recursos estáticos que se visiten
        if (networkResponse.status === 200 && event.request.destination !== '') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});

// Manejar Notificaciones Push
self.addEventListener('push', (event) => {
  let data = { title: 'Recordatorio', body: 'Tienes una tarea programada en tu agenda.' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Recordatorio', body: event.data.text() };
    }
  }
  
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Manejar clics en las notificaciones
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const url = event.notification.data?.url || '/';
      
      // Si ya hay una pestaña abierta con la app, enfocarla
      for (const client of clientList) {
        if (client.url.endsWith(url) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Si no, abrir una pestaña nueva
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
