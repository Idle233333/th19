import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const option=(name,fallback)=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const output=resolve(option('output','artifacts/standalone'));mkdirSync(output,{recursive:true});
const modulePath=process.env.TH19_PUPPETEER_MODULE||resolve(import.meta.dirname,'../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js');
const {default:puppeteer}=await import(pathToFileURL(modulePath).href);
const report={passed:false,errors:[]};
const browser=await puppeteer.launch({executablePath:process.env.TH19_BROWSER,headless:true,timeout:60000,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let page;
try{
 page=await browser.newPage();await page.setViewport({width:960,height:600,isMobile:true,hasTouch:true,isLandscape:true});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(option('url','http://127.0.0.1:8130/'),{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.__th19Runtime?.status().title[0]>0&&document.querySelector('#loading').textContent==='',{timeout:180000});
 async function step(code,count=120){return page.evaluate(({code,count})=>{
  const w=document.querySelector('iframe').contentWindow,{core:c,status}=w.__th19Runtime;c._th19_loop_pause(1);
  if(code){w.dispatchEvent(new w.KeyboardEvent('keydown',{code,bubbles:true}));c._th19_test_ticks(1);w.dispatchEvent(new w.KeyboardEvent('keyup',{code,bubbles:true}));}
  c._th19_test_ticks(count);return status().title;
 },{code,count});}
 await step(null,600);assert.equal((await step('KeyZ'))[1],1);assert.equal((await step('KeyZ'))[1],9);assert.equal((await step('KeyZ'))[1],10);
 let battle;
 for(let i=0;i<12;i++){
  battle=await page.evaluate(()=>{const r=document.querySelector('iframe').contentWindow.__th19Runtime;r.core._th19_test_story_pump();return r.status().title;});
  if(battle[1]===11)break;
 }
 assert.equal(battle[1],11);await step(null,180);report.storyReachedBattle=true;
 assert.equal(await page.$eval('#touch-controls',e=>e.hidden),false);
 assert.match(await page.$eval('[data-key="KeyX"]',e=>e.textContent),/X.*蓄力/s);
 assert.match(await page.$eval('[data-key="KeyC"]',e=>e.textContent),/C.*Bomb/s);
 const client=await page.createCDPSession();
 async function down(code,id){
  const point=await page.$eval(`[data-key="${code}"]`,e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id}]});
  await page.waitForFunction(code=>document.querySelector(`[data-key="${code}"]`).classList.contains('held'),{},code);
 }
 async function up(code){await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(code=>!document.querySelector(`[data-key="${code}"]`).classList.contains('held'),{},code);await new Promise(r=>setTimeout(r,90));}
 async function state(ticks=0){return page.evaluate(ticks=>{
  const c=document.querySelector('iframe').contentWindow.__th19Runtime.core;c._th19_test_ticks(ticks);
  const p=c._th19_charge_attack_status()/4;
  return {charge:c.HEAP32[p+3],lastRelease:c.HEAP32[p+4],held:c.HEAP32[c._th19_network_info()/4+27],bombs:c.HEAP32[c._th19_card_status()/4+10]};
 },ticks);}
 await down('KeyX',1);report.hold=await state(90);assert.equal(report.hold.held,1);assert(report.hold.charge>0);
 report.audio=await page.evaluate(()=>document.querySelector('iframe').contentWindow.__th19Runtime.core.SDL3.audioContext.state);assert.equal(report.audio,'running');
 await page.screenshot({path:resolve(output,'charge-held.png')});
 await up('KeyX');report.release=await state(1);assert.equal(report.release.held,0);assert(report.release.lastRelease>=1);
 const before=await state();await down('KeyC',2);const after=await state(2);await up('KeyC');assert.equal(after.bombs,before.bombs-1);report.bomb={before:before.bombs,after:after.bombs};
 // A released charge attack temporarily blocks another charge in the game.
 await state(60);await down('KeyX',3);assert.equal((await state(2)).held,1);
 await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal((await state(1)).held,0);report.cancelReleased=true;
 await state(60);await down('KeyX',4);assert.equal((await state(2)).held,1);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await state(1)).held,0);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});report.blurReleased=true;
 await step('Escape',30);
 const paused=await page.evaluate(()=>{const c=document.querySelector('iframe').contentWindow.__th19Runtime.core;return c.HEAP32[c._th19_title_status()/4+13];});assert.equal(paused,1);report.pause=true;
 assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
}catch(error){report.failure=error.stack;if(page)report.screen=await page.evaluate(()=>document.body.innerText).catch(()=>null);throw error;}
finally{writeFileSync(resolve(output,'standalone-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
