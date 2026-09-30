const C='lipeno-v1',F=['./','index.html','style.css','app.js','manifest.json','icon.svg'];
self.oninstall=e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F).then(()=>c.add('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js').catch(()=>{}))));self.skipWaiting()};
self.onactivate=e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));
self.onfetch=e=>{if(e.request.method!=='GET')return;
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{const cl=n.clone();caches.open(C).then(c=>c.put(e.request,cl));return n})))};
