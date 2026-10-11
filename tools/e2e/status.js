const {launch,sleep}=require('./lib'); const fs=require('fs');
const cases=[['default','2026-10-11T17:00:00Z','Dimanche 18h00','Ouvert maintenant · jusqu’à minuit'],
['default','2026-10-16T14:00:00Z','Vendredi 15h00','Fermé · ouvre à 18h00'],
['default','2026-10-16T18:00:00Z','Vendredi 19h00','Ouvert maintenant · jusqu’à minuit'],
['default','2026-10-17T02:00:00Z','Samedi 03h00','Fermé · ouvre à 11h30'],
['B','2026-10-17T22:30:00Z','Samedi 23h30 (dim. fermé)','Fermé · ouvre lundi à 11h30'],
['C','2026-10-12T14:00:00Z','Lundi 15h00 (2 plages)','Fermé · ouvre à 18h00'],
['C','2026-10-12T22:00:00Z','Lundi 23h00','Ouvert maintenant · jusqu’à 01h00'],
['C','2026-10-12T23:30:00Z','Mardi 00h30 (après minuit)','Ouvert maintenant · jusqu’à 01h00'],
['C','2026-10-13T00:30:00Z','Mardi 01h30','Fermé · ouvre à 11h30']];
(async()=>{const b=await launch();let bad=0;
 for(const [v,t,l,exp] of cases){
  const pg=await b.newPage();await pg.setRequestInterception(true);
  pg.on('request',r=>{ if(r.url().startsWith('http://127.0.0.1:8780/?t=')||r.url()==='http://127.0.0.1:8780/index.html?v=1')r.respond({status:200,contentType:'text/html; charset=utf-8',body:fs.readFileSync(`/tmp/variants/${v}.html`)});else r.continue()});
  await pg.evaluateOnNewDocument(t=>{const F=new Date(t).getTime(),D=Date;Date=class extends D{constructor(...a){if(a.length)super(...a);else super(F)}static now(){return F}}},t);
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('http://127.0.0.1:8780/?t='+v,{waitUntil:'load'});await sleep(400);
  const got=await pg.evaluate(()=>[document.querySelector('.status span').textContent,(document.querySelector('.hours li.today span')||{}).textContent]);
  const ok=got[0]===exp; if(!ok)bad++;
  console.log(ok?'OK ':'KO ',l,'→',got[0],'| jour surligné:',got[1],errs.length?errs:'');await pg.close();}
 await b.close();process.exit(bad?1:0)})();
