const CACHE="gallopai-v3.6.0";
const CORE=["./","./index.html","./styles.css","./app.js","./prediction.js","./prediction-view.js","./parsers.js","./pdf-layout.js","./keibabook-pdf.js","./pdf-import.js","./engine.js","./feature_dictionary.json","./analysis-engine.js","./analytics-engine-v34.js","./research-dashboard.js","./feature-store.js","./local-storage.js","./cloud.js","./firebase-config.js","./manifest.webmanifest","./icon-192.png","./icon-512.png","./pdf.min.js","./pdf.worker.min.js","./sample/arima-2025.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gallopai-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin||u.pathname.startsWith("/__"))return;
  // Network first for the application, so updates do not keep serving the TXT UI.
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const bundled=/\/(?:cmaps\/|pdf(?:\.worker)?\.min\.js$|icon-\d+\.png$)/.test(u.pathname);
    if(bundled){const hit=await cache.match(e.request);if(hit)return hit;}
    try{
      const response=await fetch(e.request);
      if(response.ok)await cache.put(e.request,response.clone());
      return response;
    }catch{
      const hit=await cache.match(e.request);
      if(hit)return hit;
      if(e.request.mode==='navigate')return await cache.match('./index.html')||Response.error();
      return Response.error();
    }
  })());
});
