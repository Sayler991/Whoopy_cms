const {launch,vp,sleep}=require('./lib');
(async()=>{const b=await launch();
 for(const k of ['desk','mob']){
  const pg=await b.newPage();await pg.setViewport(vp[k]);
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});pg.on('requestfailed',r=>errs.push('RF '+r.url()));
  await pg.goto('http://127.0.0.1:8780/',{waitUntil:'networkidle0'});await sleep(1500);
  for(const [id,name] of [['carte','carte'],['infos','horaires']]){
    await pg.evaluate(id=>{const e=document.getElementById(id);window.scrollTo(0,e.getBoundingClientRect().top+scrollY-70)},id);await sleep(2200);
    await pg.screenshot({path:`/tmp/shots/site_after_${k}_${name}.png`});
  }
  // onglet 2 : photos + burger ajouté
  await pg.evaluate(()=>{window.scrollTo(0,document.getElementById('carte').getBoundingClientRect().top+scrollY+450)});await sleep(2000);
  await pg.screenshot({path:`/tmp/shots/site_after_${k}_carte2.png`});
  const info=await pg.evaluate(()=>({ocean:[...document.querySelectorAll('#pn-b .mi')].map(e=>e.querySelector('h3').textContent+' '+e.querySelector('.price').textContent),
    ven:document.querySelectorAll('.hours li')[4].textContent,tab:document.querySelector('#tab-b').textContent,status:document.querySelector('.status span').textContent,
    photo:document.querySelector('.pp-a img').currentSrc.split('/').pop()}));
  console.log(k,JSON.stringify(info),errs);
  await pg.close();}
 await b.close()})();
