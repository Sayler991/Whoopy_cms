const {launch,vp,sleep}=require('./lib');
(async()=>{const b=await launch();const ctx=await b.createBrowserContext();const pg=await ctx.newPage();await pg.setViewport(vp.mob);
await pg.goto('http://127.0.0.1:8780/admin/',{waitUntil:'networkidle0'});await pg.type('#login-pw','Whoopy2026!');await pg.keyboard.press('Enter');await pg.waitForSelector('#main .card');await sleep(500);
console.log(await pg.evaluate(()=>{const W=document.documentElement.clientWidth;const r=[];document.querySelectorAll('#app *').forEach(e=>{const b=e.getBoundingClientRect();if(b.right>W+1&&b.width>0)r.push(e.tagName+'.'+e.className+' '+Math.round(b.right)+' w'+Math.round(b.width))});return {W,iw:innerWidth,r:r.slice(0,15)}}));
await b.close()})();
