import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/mamin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{const page=await browser.newPage({viewport:{width:1000,height:900}});const origin=`http://127.0.0.1:${server.address().port}`;
await page.goto(origin+'/capture.html?sample=settings');await page.waitForFunction(()=>window.rendererReady);await page.locator('#settings-panel.open').waitFor();await page.screenshot({path:root+'/assets/settings-appearance.jpg'});
await page.getByRole('button',{name:'Shortcuts',exact:true}).click();await page.screenshot({path:root+'/assets/settings-shortcuts.jpg'});
await page.getByRole('button',{name:'Editor',exact:true}).click();await page.screenshot({path:root+'/assets/settings-fonts.jpg'});
for(const mode of ['table','code','math','image']){await page.goto(origin+'/capture.html?sample='+mode);await page.waitForFunction(()=>window.rendererReady);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.src).map(i=>i.decode()));});
if(mode==='image'){await page.locator('#editor img[src="assets/document-image.png"]').click();await page.getByRole('button',{name:'Scale image',exact:true}).click();}
await page.screenshot({path:root+'/assets/'+(mode==='image'?'image-toolbar':mode)+'.png',...(mode==='image'?{clip:{x:0,y:30,width:520,height:660}}:{})});}
}finally{await browser.close();server.close();}

