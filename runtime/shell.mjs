import createModule from './th19.mjs';
import {scanCodes} from './keyboard.mjs';
const game='th19',protocol='eagler-touhou/1',query=new URLSearchParams(location.search),canvas=document.querySelector('canvas'),$=s=>document.querySelector(s);
// WebGL2 环境守卫：探针用一次性 canvas，不能碰游戏画布（SDL3 先拿上下文会触发
// MSAA 黑屏）。headless/无 GPU 环境下 createModule 会永久挂起，这里先诊断。
try{
 const probe=document.createElement('canvas');
 const context=probe.getContext('webgl2',{antialias:false,depth:false,stencil:false});
 if(!context)throw Error('WebGL2 不可用（环境限制）');
 // Safari may keep an otherwise unreachable probe alive until its next GC.
 context.getExtension('WEBGL_lose_context')?.loseContext();
}catch(e){const box=$('#error');if(box)box.textContent=e.message;throw e;}
// Variant identity is stamped by the builder.
const runtimeVariant=document.querySelector('meta[name="eagler-runtime-variant"]')?.content;
if(runtimeVariant!=='normal')throw Error('Invalid TH19 Runtime variant');
const saveRoot='/savesth19';
const epoch=Number(query.get('runtimeEpoch')),validEpoch=Number.isSafeInteger(epoch)&&epoch>0;
let core,launched=false,first=false,options={},music=true,chain=Promise.resolve(),queue=Promise.resolve(),revision=0,stopping=false,touchUnlimited=false,touchGain=1;
const touchKeys=new Set(),touchPointers=new Map(),touchOrigins=new Map(),touchLast=new Map(),joystickKeys=new Set();let touchBombSerial=0,touchEscapeSerial=0;const pulseTimers=new Map();
const emit=(event,fields={})=>parent.postMessage({protocol,game,epoch,event,...fields},location.origin);
const values=(fn,n)=>{const p=fn()/4;return Array.from(core.HEAP32.subarray(p,p+n));};
const status=()=>({title:values(core._th19_title_status,8)});
const err=()=>{const a=core.HEAPU8.subarray(core._th19_error());return new TextDecoder().decode(a.subarray(0,a.indexOf(0)));};
function runtimeKeyboardCode(message){
 const code=String(message.code||'');if(code&&code!=='Unidentified')return code;
 const key=String(message.key||'').toLowerCase(),location=Number(message.location)||0;
 const byKey={z:'KeyZ',x:'KeyX',shift:location===2?'ShiftRight':'ShiftLeft',escape:'Escape',esc:'Escape',arrowup:'ArrowUp',arrowdown:'ArrowDown',arrowleft:'ArrowLeft',arrowright:'ArrowRight',control:location===2?'ControlRight':'ControlLeft',enter:location===3?'NumpadEnter':'Enter',tab:'Tab',backspace:'Backspace',' ':'Space'};
 if(byKey[key])return byKey[key];const keyCode=Number(message.keyCode)||0,byCode={8:'Backspace',9:'Tab',13:location===3?'NumpadEnter':'Enter',16:location===2?'ShiftRight':'ShiftLeft',17:location===2?'ControlRight':'ControlLeft',27:'Escape',32:'Space',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',88:'KeyX',90:'KeyZ'};
 return byCode[keyCode]||'';
}
function setTouchKey(code,down){if(!scanCodes[code]||!core)return;if(down){if(touchKeys.has(code))return;touchKeys.add(code);}else touchKeys.delete(code);core._th19_key(scanCodes[code],down?1:0);}
function pulseKey(code){if(!scanCodes[code]||!core)return;const old=pulseTimers.get(code);if(old)clearTimeout(old);core._th19_key(scanCodes[code],1);pulseTimers.set(code,setTimeout(()=>{pulseTimers.delete(code);core?._th19_key(scanCodes[code],0);},90));}
function clearTouchKeys(){for(const code of touchKeys)setTouchKey(code,false);for(const timer of pulseTimers.values())clearTimeout(timer);pulseTimers.clear();touchPointers.clear();touchOrigins.clear();touchLast.clear();}
function applyJoystick(x,y){
 const next=new Set();if(x<-.22)next.add('ArrowLeft');else if(x>.22)next.add('ArrowRight');
 if(y<-.22)next.add('ArrowUp');else if(y>.22)next.add('ArrowDown');
 for(const code of joystickKeys)if(!next.has(code))setTouchKey(code,false);
 for(const code of next)if(!joystickKeys.has(code))setTouchKey(code,true);
 joystickKeys.clear();for(const code of next)joystickKeys.add(code);
}
function applyTouchPoint(id,type,x,y){
 const old=touchPointers.get(id);if(type===2){const origin=touchOrigins.get(id)||[x,y],dx=x-origin[0],dy=y-origin[1],tap=Math.abs(dx)<.035&&Math.abs(dy)<.035;touchPointers.delete(id);touchOrigins.delete(id);touchLast.delete(id);if(old)for(const code of old)setTouchKey(code,false);if(tap)pulseKey('KeyZ');else {if(Math.abs(dx)>=.035)pulseKey(dx<0?'ArrowLeft':'ArrowRight');if(Math.abs(dy)>=.035)pulseKey(dy<0?'ArrowUp':'ArrowDown');}return;}
 if(type===0){touchOrigins.set(id,[x,y]);touchLast.set(id,[x,y]);touchPointers.set(id,new Set());return;}
 const origin=touchOrigins.get(id)||[x,y],last=touchLast.get(id)||origin,dx=x-origin[0],dy=y-origin[1],stepX=x-last[0],stepY=y-last[1],next=new Set(),threshold=.025;touchLast.set(id,[x,y]);
 // TH19 field coordinates are smaller than the launcher viewport by roughly
 // one order of magnitude; compensate so unlimited touch is 1:1 with the
 // finger's drag distance instead of moving only about a tenth as far.
 if(touchUnlimited&&core?._th19_touch_motion)core._th19_touch_motion(stepX*7400*touchGain,stepY*5800*touchGain,1);
 // Relative drag input works across the entire screen.  The initial contact
 // position is irrelevant; any upward/downward/sideways swipe moves the ship.
 if(Math.abs(dx)>=threshold)next.add(dx<0?'ArrowLeft':'ArrowRight');
 if(Math.abs(dy)>=threshold)next.add(dy<0?'ArrowUp':'ArrowDown');
 // Menus sample short directional presses; pulse alongside the held state so
 // a swipe always advances a selection even when the Runtime frame is sparse.
 // Menu navigation still needs a short directional edge when unlimited
 // movement is selected. In gameplay the native loop ignores injected arrow
 // keys while it consumes the direct motion export, so emitting these pulses
 // is safe in both states.
 for(const code of next)pulseKey(code);
 if(old)for(const code of old)if(!next.has(code))setTouchKey(code,false);
 for(const code of next)if(!old?.has(code))setTouchKey(code,true);
 touchPointers.set(id,next);
}
const fatal=e=>{const message=e?.message||String(e);$('#error').textContent=message;core?._th19_loop_pause(1);emit('error',{error:message});};
const sync=(populate=false)=>{const current=chain.then(()=>new Promise((r,j)=>core.FS.syncfs(populate,e=>e?j(e):r())));chain=current.catch(()=>{});return current;};
function path(value){let name=String(value).replaceAll('\\','/').toLowerCase().replace(new RegExp('^'+saveRoot+'/'),'').replace(/^\//,'');if(!/^(?:scoreth19\.dat|th19\.cfg|replay\/th19_(?:\d{2}|ud[a-z0-9]{4})\.rpy)$/.test(name))throw Error('存档路径无效');return name;}
async function resource(r){if(!/^\/(?:music)\/[a-z0-9_.-]+$/.test(r.path))throw Error('资源路径无效');const u=new URL(r.url,location.href);if(u.origin!==location.origin)throw Error('资源来源无效');const response=await fetch(u);if(!response.ok)throw Error('资源读取失败');const bytes=new Uint8Array(await response.arrayBuffer());core.FS.mkdirTree(r.path.slice(0,r.path.lastIndexOf('/'))||'/');core.FS.writeFile(r.path,bytes,{canOwn:true});emit('transfer',{mode:r.path.startsWith('/music/')?'ogg':'runtime',loaded:bytes.length,total:bytes.length,path:r.path});}
async function save(){if(launched&&!core._th19_save_snapshot())throw Error('保存失败');await sync();}
async function stop(){if(stopping)return;stopping=true;try{core._th19_loop_stop();await save();core._th19_game_close();launched=false;delete window.__th19Runtime;emit('exit',{code:0,status:'success'});}finally{stopping=false;}}
async function command(m){switch(m.command){
case 'configure':options=m.options||{};music=m.music==='ogg';touchUnlimited=options.touchMovementMode==='touch-unlimited';touchGain=Math.max(1,Math.min(3,Number(options.touchSensitivity)||100))/100;if(core?._th19_touch_motion)core._th19_touch_motion(0,0,touchUnlimited?1:0);for(const r of [...(m.sharedResources||[]),...(m.runtimeResources||[]),...(m.resources||[])])await resource(r);core._th19_music_enabled(+music);return {};
case 'resources':for(const r of m.resources||[])await resource(r);return {};
case 'keyboard':{const code=runtimeKeyboardCode(m);if(scanCodes[code])core._th19_key(scanCodes[code],+!!m.down);return {};}
case 'keyboard-clear':core._th19_keys_clear();return {};
case 'touch-cancel':core._th19_keys_clear();clearTouchKeys();applyJoystick(0,0);if(core?._th19_touch_motion)core._th19_touch_motion(0,0,0);return {};
case 'direct-touch':{const b=canvas.getBoundingClientRect();applyTouchPoint(Number(m.id)||0,{down:0,move:1,up:2,cancel:2}[m.type]??2,(Number(m.x)*innerWidth-b.left)/b.width,(Number(m.y)*innerHeight-b.top)/b.height);return {};}
case 'touch-controls':{const t=m.controls||m;if(typeof t.touchMovementMode==='string')touchUnlimited=t.touchMovementMode==='touch-unlimited';if(Number.isFinite(Number(t.touchSensitivity)))touchGain=Math.max(1,Math.min(3,Number(t.touchSensitivity)||100))/100;setTouchKey('KeyZ',!!t.fireEnabled);setTouchKey('ShiftLeft',!!t.focusEnabled);applyJoystick(Number(t.joystickX)||0,Number(t.joystickY)||0);const bomb=Number(t.bombSerial)||0;if(bomb!==touchBombSerial){touchBombSerial=bomb;pulseKey('KeyC');}const esc=Number(t.escapeSerial)||0;if(esc!==touchEscapeSerial){touchEscapeSerial=esc;pulseKey('Escape');}return {};}
case 'launch':if(!launched){if(!core._th19_game_open(Date.now()&65535))throw Error(err());launched=true;core._th19_loop_start();first=false;$('#loading').textContent='';window.__th19Runtime={core,status,save,command};emit('runtime-info',{renderer:'SDL3 / WebGL2 / C++',architecture:protocol,version:'2026.10.13-early'});}return {};
case 'sync':await save();return {};
case 'list':{const files=[];for(const dir of ['', '/replay'])for(const name of core.FS.readdir(saveRoot+dir)){const n=(dir+'/'+name).replace(/^\//,'');try{path(n);}catch{continue;}const full=saveRoot+'/'+n,s=core.FS.stat(full);if(core.FS.isFile(s.mode))files.push({path:n,size:s.size});}return {files};}
case 'read':return {bytes:Array.from(core.FS.readFile(saveRoot+'/'+path(m.path)))};
case 'write':{
 if(!Array.isArray(m.bytes)||m.bytes.length>16*1024*1024||m.bytes.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error('存档数据无效');
 if(launched)throw Error('请先退出游戏再导入');
 const name=path(m.path),bytes=Uint8Array.from(m.bytes),target=saveRoot+'/'+name;
 const changes=new Map([[target,bytes]]);
 if(name==='scoreth19.dat'){
  core.FS.writeFile('/score-import.dat',bytes);
  try{if(!core._th19_validate_score_import())throw Error('不是有效的兽王园原版存档，或文件已损坏；原有进度未更改');}
  finally{core.FS.unlink('/score-import.dat');}
  let fingerprint=2166136261;for(const byte of bytes)fingerprint=Math.imul(fingerprint^byte,16777619)>>>0;
  const id=fingerprint.toString(16).padStart(8,'0');
  // Explicit re-import restores exactly the selected native save, not later web clears.
  changes.set(saveRoot+'/th19-progress-'+id+'.bin',null);
  changes.set(saveRoot+'/th19-notices-'+id+'.bin',null);
  if(core.FS.analyzePath(target).exists)changes.set(saveRoot+'/scoreth19bak.dat',core.FS.readFile(target).slice());
 }
 const previous=new Map();for(const [file] of changes)previous.set(file,core.FS.analyzePath(file).exists?core.FS.readFile(file).slice():null);
 const apply=entries=>{for(const [file,data] of entries){if(data!==null)core.FS.writeFile(file,data);else if(core.FS.analyzePath(file).exists)core.FS.unlink(file);}};
 try{apply(changes);await sync();}
 catch(error){apply(previous);try{await sync();}catch{}throw error;}
 return {};
}
case 'remove':if(launched)throw Error('请先退出游戏');core.FS.unlink(saveRoot+'/'+path(m.path));await sync();return {};
default:throw Error('不支持的操作');}}
window.addEventListener('message',e=>{const m=e.data;if(!validEpoch||e.source!==parent||e.origin!==location.origin||m?.protocol!==protocol||m.game!==game||m.epoch!==epoch||typeof m.command!=='string')return;queue=queue.then(async()=>{await initialized;try{const result=await command(m);if(typeof m.request==='string')parent.postMessage({protocol,game,epoch,request:m.request,ok:true,...result},location.origin);}catch(e){if(typeof m.request==='string')parent.postMessage({protocol,game,epoch,request:m.request,ok:false,error:String(e),errno:e?.errno},location.origin);else fatal(e);}}).catch(fatal);});
// Audio resume needs a user gesture; capture-phase listeners fire before the
// launcher's own handling.
for(const event of ['pointerdown','keydown'])window.addEventListener(event,()=>core?.SDL3?.audioContext?.resume().catch(()=>{}),{capture:true});
// Forward iframe-local keys into the injected table (merged with SDL state).
for(const [event,down] of [['keydown',1],['keyup',0]])window.addEventListener(event,e=>{
 if(!launched||!core)return;
 const code=runtimeKeyboardCode({code:e.code,key:e.key,keyCode:e.keyCode,location:e.location});
 if(scanCodes[code])core._th19_key(scanCodes[code],down);
},{capture:true});
document.addEventListener('visibilitychange',()=>{if(launched){core._th19_keys_clear();core._th19_loop_pause(+(document.hidden));if(document.hidden)void save().catch(fatal);}});
window.addEventListener('blur',()=>{core?._th19_keys_clear();clearTouchKeys();applyJoystick(0,0);});
// Android can deliver touch directly to the runtime iframe.  Host launchers
// use the same normalized direct-touch protocol, so both paths share mapping.
for(const [name,type] of [['pointerdown',0],['pointermove',1],['pointerup',2],['pointercancel',2]])document.body.addEventListener(name,e=>{
 if(!launched||e.pointerType==='mouse'||e.target.closest('button,input,dialog'))return;
 e.preventDefault();if(type===0)document.body.setPointerCapture?.(e.pointerId);const b=canvas.getBoundingClientRect();
 applyTouchPoint(e.pointerId,type,(e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height);
},{passive:false});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fatal(Error('图形环境失效，请退出后重新开始。'));});window.addEventListener('pagehide',()=>{if(launched){core._th19_loop_pause(1);void save();}});
const initialized=(async()=>{
 let last=performance.now(),lastFrames=0;
 core=await createModule({canvas,printErr:console.error,onGameFrame(ok,ms){if(!ok){fatal(Error(err()));return;}if(!first){first=true;emit('first-frame');}const current=core._th19_storage_revision();if(current!==revision){revision=current;void sync().catch(fatal);}const now=performance.now();if(now-last>=1000){const frames=values(core._th19_title_status,8)[0];emit('frame-health',{fps:(frames-lastFrames)*1000/(now-last),maxGapMs:ms});emit('audio-health',{backend:'script',robust:core.SDL3?.audioContext?.state==='running'});last=now;lastFrames=frames;}}});
 window.Module=core;window.FS=core.FS;core.SDL3=core.SDL3||{};if(parent!==window&&parent.__touhouAudioContext)core.SDL3.audioContext=parent.__touhouAudioContext;
 core.FS.mkdirTree(saveRoot);core.FS.mount(core.FS.filesystems.IDBFS,{},saveRoot);await sync(true);core.FS.mkdirTree(saveRoot+'/replay');core.FS.symlink(saveRoot,'/save');
 if(query.get('managedData')!=='1'||parent===window||typeof parent.__eaglerPrepareManagedRuntimeDataV1!=='function')throw Error('请从 eagler-touhou 启动兽王园');
 const buffer=(await parent.__eaglerPrepareManagedRuntimeDataV1({game,generation:query.get('gameGeneration'),epoch})).buffer;
 if(Object.prototype.toString.call(buffer)!=='[object ArrayBuffer]'||buffer.byteLength<1000000)throw Error('兽王园资源无效');
 // MEMFS can own immutable retail bytes; avoid a second 110 MiB archive copy.
 core.FS.writeFile('/th19.dat',new Uint8Array(buffer),{canOwn:true});
 emit('ready');if(query.get('standalone')==='1')await command({command:'launch'});
})().catch(e=>{fatal(e);throw e;});
