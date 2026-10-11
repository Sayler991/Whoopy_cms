const {launch,vp,sleep,FREEZE}=require('./lib');
const B='http://127.0.0.1:8780';
const out=(n)=>`/tmp/shots/${n}.png`;
const clickText=async(pg,sel,txt)=>{const ok=await pg.evaluate((sel,txt)=>{const e=[...document.querySelectorAll(sel)].find(x=>x.textContent.includes(txt));if(e){e.scrollIntoView({block:'center'});e.click();return true}return false},sel,txt);if(!ok)throw new Error('introuvable: '+txt)};
const setVal=(pg,sel,idx,val)=>pg.evaluate((sel,idx,val)=>{const e=document.querySelectorAll(sel)[idx];e.focus();e.value=val;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))},sel,idx,val);
(async()=>{
 const b=await launch(); const log=[];
 for(const k of ['desk','mob']){
  const ctx=await b.createBrowserContext(); const pg=await ctx.newPage(); await pg.setViewport(vp[k]);
  pg.on('pageerror',e=>log.push(k+' PE '+e.message)); pg.on('console',m=>{if(m.type()==='error')log.push(k+' CE '+m.text())});
  pg.on('dialog',d=>d.accept());
  await pg.goto(B+'/admin/',{waitUntil:'networkidle0'});
  await sleep(500); await pg.screenshot({path:out(`admin_${k}_01_login`)});
  // mauvais mot de passe
  await pg.type('#login-pw','mauvais'); await pg.keyboard.press('Enter'); await pg.waitForSelector('#login-err:not([hidden])'); 
  log.push(k+' erreur login: '+await pg.$eval('#login-err',e=>e.textContent));
  await pg.$eval('#login-pw',e=>e.value=''); await pg.type('#login-pw','Whoopy2026!'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#main .card'); await sleep(900);
  await pg.screenshot({path:out(`admin_${k}_02_carte`)});
  if(k==='desk'){
   // modifier un prix (Ocean 250 -> 275)
   await setVal(pg,'#main section.card:nth-of-type(1) .price-f input',0,'275');
   // ajouter un burger
   await clickText(pg,'button','Ajouter un burger'); await sleep(500);
   const n=await pg.$$eval('#main section.card:nth-of-type(1) .item',e=>e.length);
   await setVal(pg,'#main section.card:nth-of-type(1) .item:last-of-type input[type=text]',0,'Smash Test');
   await setVal(pg,'#main section.card:nth-of-type(1) .item:last-of-type input[type=number]',0,'420');
   await setVal(pg,'#main section.card:nth-of-type(1) .item:last-of-type textarea',0,'Double steak smashé, cheddar, sauce maison.');
   await setVal(pg,'#main section.card:nth-of-type(1) .item:last-of-type input[type=text]',1,'Veau');
   await pg.screenshot({path:out('admin_desk_03_carte_ajout')});
   // horaires
   await clickText(pg,'.side button','Horaires'); await sleep(400);
   await pg.screenshot({path:out('admin_desk_04_horaires')});
   // vendredi : 18:00 -> 17:00 (index 4 -> inputs time 8)
   await setVal(pg,'.day select',16,'17');
   // dimanche : 2e plage
   await pg.screenshot({path:out('admin_desk_04b_horaires')});
   // photo
   await clickText(pg,'.side button','Photos'); await sleep(500);
   await pg.screenshot({path:out('admin_desk_05_photos')});
   const idx=await pg.evaluate(()=>[...document.querySelectorAll('.ph')].findIndex(e=>e.textContent.includes('Burger & frites')));
   const inputs=await pg.$$('.ph input[type=file]'); await inputs[idx].uploadFile('/tmp/photo_test.jpg');
   await pg.waitForSelector('.modal'); await sleep(700);
   await pg.screenshot({path:out('admin_desk_06_recadrage')});
   await clickText(pg,'.modal button','Valider'); await pg.waitForFunction(()=>!document.querySelector('.modal'),{timeout:20000}); await sleep(600);
   await pg.evaluate(()=>{const t=[...document.querySelectorAll('.ph textarea')]; });
   await setVal(pg,'.ph:nth-child('+(idx+1)+') textarea',0,'Un burger et des frites, photo du restaurant.');
   await pg.screenshot({path:out('admin_desk_07_photo_ok')});
   // aperçu
   await clickText(pg,'.side button','Aperçu'); await sleep(3500);
   await pg.screenshot({path:out('admin_desk_08_apercu')});
   // enregistrer
   await clickText(pg,'button[data-save]','Enregistrer'); await pg.waitForSelector('.toast.ok',{timeout:10000}); await sleep(300);
   log.push('toast: '+await pg.$eval('.toast',e=>e.textContent));
   await pg.screenshot({path:out('admin_desk_09_enregistre')});
   await clickText(pg,'.side button','Réglages'); await sleep(900);
   await pg.screenshot({path:out('admin_desk_10_reglages')});
   await clickText(pg,'.side button','Textes'); await sleep(500); await pg.screenshot({path:out('admin_desk_11_textes')});
   await clickText(pg,'.side button','Avis'); await sleep(500); await pg.screenshot({path:out('admin_desk_12_avis')});
   await clickText(pg,'.side button','Contact'); await sleep(500); await pg.screenshot({path:out('admin_desk_13_contact')});
  } else {
   await clickText(pg,'.side button','Horaires'); await sleep(500); await pg.screenshot({path:out('admin_mob_03_horaires')});
   await clickText(pg,'.side button','Photos'); await sleep(700); await pg.screenshot({path:out('admin_mob_04_photos')});
   await clickText(pg,'.side button','Aperçu'); await sleep(3500); await pg.screenshot({path:out('admin_mob_05_apercu')});
   await clickText(pg,'.side button','Textes'); await sleep(600); await pg.screenshot({path:out('admin_mob_06_textes')});
   await clickText(pg,'.side button','Avis'); await sleep(600); await pg.screenshot({path:out('admin_mob_07_avis')});
   await clickText(pg,'.side button','Réglages'); await sleep(900); await pg.screenshot({path:out('admin_mob_08_reglages')});
   const ov=await pg.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   log.push('mob débordement horizontal: '+ov);
  }
  await pg.close(); await ctx.close();
 }
 console.log(log.join('\n')); await b.close();
})().catch(e=>{console.error('ERREUR',e);process.exit(1)});
