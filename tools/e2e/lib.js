const path='/workspace/terrasse/whoopy_site/work/node_modules/puppeteer-core';
const p=require(path);
exports.launch=()=>p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'],headless:'new'});
exports.vp={desk:{width:1280,height:800},mob:{width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2}};
exports.sleep=ms=>new Promise(r=>setTimeout(r,ms));
exports.FREEZE='video{visibility:hidden!important} *,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important} [data-r]{opacity:1!important;transform:none!important} .js .ch{opacity:1!important;transform:none!important}';
