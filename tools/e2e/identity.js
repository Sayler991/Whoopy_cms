const {launch,vp,sleep,FREEZE}=require('./lib');
(async()=>{
 const b=await launch();
 for(const k of ['desk','mob']){
  for(const [name,url] of [['orig','http://127.0.0.1:8768/'],['cms','http://127.0.0.1:8780/']]){
   const pg=await b.newPage(); await pg.setViewport(vp[k]);
   await pg.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
   await pg.goto(url,{waitUntil:'networkidle0'}); await pg.addStyleTag({content:FREEZE}); await sleep(800);
   // forcer le chargement des images lazy
   await pg.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}window.scrollTo(0,0)});
   await sleep(800);
   // masquer l'heure courante (statut ouvert/fermé identique de toute façon)
   await pg.screenshot({path:`/tmp/shots/id_${k}_${name}.png`,fullPage:true});
   console.log(k,name,await pg.evaluate(()=>document.documentElement.scrollHeight));
   await pg.close();
  }
 }
 await b.close();
})();
