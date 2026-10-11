const {launch,vp,sleep}=require('./lib');
(async()=>{const b=await launch();const ctx=await b.createBrowserContext();const pg=await ctx.newPage();await pg.setViewport(vp.desk);
await pg.goto('http://127.0.0.1:8780/admin/',{waitUntil:'networkidle0'});await pg.type('#login-pw','Whoopy2026!');await pg.keyboard.press('Enter');await pg.waitForSelector('#main .card');
await pg.click('#main .price-f input',{clickCount:3});await pg.keyboard.type('999');
console.log(await pg.$eval('.item-h b',e=>e.textContent), await pg.$eval('#status span',e=>e.textContent));await b.close()})();
