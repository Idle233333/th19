// Minimal local host for the game's existing eagler-touhou/1 adapter.
// Game source, data, music, saves and this entry point do not use launcher/.
const protocol='eagler-touhou/1',game='th19',epoch=Date.now(),base=new URL('.',import.meta.url);
const loading=document.querySelector('#loading'),errorBox=document.querySelector('#error');
let frame,config,data,serial=0,launched=false;const pending=new Map();
function fail(error){errorBox.textContent=error?.message||String(error);loading.textContent='';}
async function read(url){const response=await fetch(new URL(url,base));if(!response.ok)throw Error(`资源读取失败：${url} (${response.status})`);return response;}
window.__eaglerPrepareManagedRuntimeDataV1=async()=>{
 data??=read(config.gameData.source).then(r=>r.arrayBuffer());
 const buffer=await data;if(buffer.byteLength!==config.gameData.bytes)throw Error('原版 th19.dat 不完整；从仓库克隆后请运行 git lfs pull。');
 return {buffer};
};
function command(command,fields={}){
 const request=String(++serial);return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(request);reject(Error(`操作超时：${command}`));},120000);
  pending.set(request,{resolve,reject,timer});frame.contentWindow.postMessage({protocol,game,epoch,request,command,...fields},location.origin);
 });
}
window.addEventListener('message',async event=>{
 const m=event.data;if(event.source!==frame?.contentWindow||event.origin!==location.origin||m?.protocol!==protocol||m.game!==game||m.epoch!==epoch)return;
 if(typeof m.request==='string'&&pending.has(m.request)){const p=pending.get(m.request);pending.delete(m.request);clearTimeout(p.timer);m.ok?p.resolve(m):p.reject(Error(m.error));return;}
 try{
  if(m.event==='error'){fail(Error(m.error));return;}
  if(m.event==='transfer')loading.textContent='正在载入原版音乐……';
  if(m.event==='ready'){
   const resources=config.music.ogg.files.map((name,i)=>({path:'/music/'+name,url:new URL(config.music.ogg.base+name,base).href,bytes:config.music.ogg.sizes[i],sha256:config.music.ogg.sha256[i]}));
   const sharedResources=[{path:'/msgothic.ttc',url:new URL('content/msgothic.ttf',base).href}];
   await command('configure',{music:'ogg',resources,sharedResources,options:{touchEnabled:true,touchMovementMode:'touch',touchSensitivity:100,touchFocusMode:'hold-button'}});await command('launch');
  }
  if(m.event==='first-frame'){launched=true;loading.textContent='';frame.contentWindow.focus();}
  if(m.event==='exit'){launched=false;cancelInputs();loading.textContent='游戏已退出，刷新页面重新开始。';}
 }catch(error){fail(error);}
});
// The standalone host owns only its own buttons/keys; the iframe keeps native
// keyboard, gamepad and field-drag input. No launcher profile is shared.
function input(command,fields={}){
 if(!launched)return;
 const message={protocol,game,epoch,command,...fields};
 const bridge=frame.contentWindow.__eaglerDirectInputBridge;
 if(!bridge?.submit(message))frame.contentWindow.postMessage(message,location.origin);
}
function resumeAudio(){
 const context=frame?.contentWindow?.Module?.SDL3?.audioContext;
 if(context?.state==='suspended')void context.resume().catch(()=>{});
}
const buttons=document.querySelector('#touch-controls'),toggle=document.querySelector('#touch-toggle');
const coarse=matchMedia('(any-pointer: coarse)');
function showControls(value){buttons.hidden=!value;toggle.setAttribute('aria-pressed',String(value));}
showControls(coarse.matches);coarse.addEventListener('change',e=>showControls(e.matches));
toggle.addEventListener('click',()=>{cancelInputs();showControls(buttons.hidden);resumeAudio();});
const pointers=new Map(),owners=new Map(),releaseTimers=new Map();
function key(code,down){input('keyboard',{code,down,inputSource:'virtual'});}
function press(code,id){
 const timer=releaseTimers.get(code);if(timer){clearTimeout(timer);releaseTimers.delete(code);}
 let ids=owners.get(code);if(!ids){ids=new Set();owners.set(code,ids);key(code,true);}ids.add(id);
}
function release(code,id,immediate=false){
 const ids=owners.get(code);ids?.delete(id);if(ids?.size)return;
 const finish=()=>{releaseTimers.delete(code);if(!owners.get(code)?.size){owners.delete(code);key(code,false);}};
 const old=releaseTimers.get(code);if(old)clearTimeout(old);
 if(immediate)finish();else releaseTimers.set(code,setTimeout(finish,60));
}
function cancelInputs(){
 for(const timer of releaseTimers.values())clearTimeout(timer);releaseTimers.clear();
 for(const code of owners.keys())key(code,false);owners.clear();pointers.clear();
 for(const button of buttons.querySelectorAll('[data-key]'))button.classList.remove('held');
 input('keyboard-clear');input('touch-cancel');
}
for(const button of buttons.querySelectorAll('[data-key]')){
 button.addEventListener('pointerdown',e=>{
  e.preventDefault();if(!launched||pointers.has(e.pointerId))return;
  resumeAudio();button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,button);
  press(button.dataset.key,e.pointerId);button.classList.add('held');
 });
 for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{
  if(pointers.get(e.pointerId)!==button)return;e.preventDefault();pointers.delete(e.pointerId);
  release(button.dataset.key,e.pointerId,event!=='pointerup');
  if(![...pointers.values()].includes(button))button.classList.remove('held');
 });
 button.addEventListener('contextmenu',e=>e.preventDefault());
}
const hostKeys=new Set(['KeyZ','KeyX','KeyC','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape']);
for(const [event,down] of [['keydown',true],['keyup',false]])window.addEventListener(event,e=>{
 if(!launched||!hostKeys.has(e.code)||e.altKey||e.metaKey||e.target.closest?.('input,textarea,select'))return;
 e.preventDefault();if(down){resumeAudio();press(e.code,'keyboard:'+e.code);}else release(e.code,'keyboard:'+e.code,true);
});
window.addEventListener('blur',cancelInputs);window.addEventListener('pagehide',cancelInputs);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelInputs();});
try{
 config=await (await read('game-resources.json')).json();
 frame=document.createElement('iframe');frame.title='東方獣王園';frame.allow='autoplay; fullscreen';
 const url=new URL(config.runtime,base);url.searchParams.set('managedData','1');url.searchParams.set('runtimeEpoch',String(epoch));url.searchParams.set('gameGeneration','standalone');frame.src=url.href;document.body.prepend(frame);
}catch(error){fail(error);}
