const C='lipeno-v1',FILES=['./','./index.html','./style.css','./app.js','./manifest.json','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png',
 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js','https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.allSettled(FILES.map(f=>c.add(f)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{if(n.ok){const cl=n.clone();caches.open(C).then(c=>c.put(e.request,cl))}return n}).catch(()=>caches.match('./index.html'))))});
