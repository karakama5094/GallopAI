const CACHE="gallopai-v3.4.1";
const CORE=["./","./index.html","./styles.css","./app.js","./parsers.js","./engine.js","./feature_dictionary.json","./analysis-engine.js","./analytics-engine-v34.js","./feature-store.js","./local-storage.js","./cloud.js","./firebase-config.js","./manifest.webmanifest","./icon-192.png","./icon-512.png","./pdf.min.js","./pdf.worker.min.js","./sample/arima-2025.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin||u.pathname.startsWith("/__"))return;
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;}).catch(()=>caches.match("./index.html"))));
});
