// Standalone TH19 builder. All source, headers, shell files and fonts are local
// to this repository; only the Emscripten toolchain is an external dependency.
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const portable=resolve(root,'portable/sdl');
const sdkCandidates=[process.env.TH19_EMSDK,process.env.EMSDK,resolve(root,'tools/emsdk')].filter(Boolean).map(p=>resolve(p));
let sdk,emcc;
for(const candidate of sdkCandidates){
 const compiler=['upstream/emscripten/emcc.py','install/emscripten/emcc.py','emscripten/emcc.py','emcc.py'].map(p=>resolve(candidate,p)).find(existsSync);
 if(compiler){sdk=candidate;emcc=compiler;break;}
}
if(!emcc)throw Error('Emscripten SDK not found. Set TH19_EMSDK (or activate emsdk_env to set EMSDK). See README.md.');
const compiled=resolve(process.env.TH19_BUILD_DIR || resolve(root,'work/build'));mkdirSync(compiled,{recursive:true});
const output=resolve(process.env.TH19_OUTPUT_DIR||resolve(root,'runtime'));mkdirSync(output,{recursive:true});
const env={...process.env,EMSDK:sdk,EMCC_CORES:process.env.EMCC_CORES||'4'};
const config=process.env.TH19_EM_CONFIG||process.env.EM_CONFIG||(existsSync(resolve(sdk,'.emscripten'))?resolve(sdk,'.emscripten'):null);
if(config)env.EM_CONFIG=config;
const python=process.env.TH19_PYTHON||process.env.EMSDK_PYTHON||(process.platform==='win32'?'python':'python3');
const sources=[];
for(const dir of ['cpp/game','cpp/sdl'])for(const n of readdirSync(resolve(root,dir)).filter(n=>n.endsWith('.cpp')).sort())sources.push(resolve(root,dir,n));
sources.push(resolve(portable,'Renderer.cpp'));
const loader=resolve(compiled,'th19.mjs');
const args=['-O2','-g0','-std=c++17','-fno-exceptions','-fno-rtti',
  '-I'+resolve(root,'cpp/game'),'-I'+resolve(root,'cpp/sdl'),
  '-I'+portable,
  '-DTH_NATIVE_PLATFORM=1','--use-port=sdl3',
  '--no-entry','-sDEFAULT_TO_CXX=1','-sMODULARIZE=1','-sEXPORT_ES6=1',
  '-sENVIRONMENT=web,worker','-sALLOW_MEMORY_GROWTH=1','-sSTACK_SIZE=1048576',
  '-sINITIAL_MEMORY=134217728','-sMAXIMUM_MEMORY=1073741824','-sFILESYSTEM=1',
  '-lidbfs.js','-sEXPORTED_RUNTIME_METHODS=FS,HEAPU8,HEAP32',
  '-sINVOKE_RUN=0','-sEXIT_RUNTIME=0','-sMIN_WEBGL_VERSION=2','-sMAX_WEBGL_VERSION=2',
  ...sources,
  // MS Gothic 子集字体嵌入 FS（成就/结局文字用 stb_truetype 渲染，必须随包提供）
  // 完整版 msgothic.ttf 提取后 upm=0 是损坏的，用 build-sdl 同款 lean 子集（覆盖全部结局+成就字符）
  '--embed-file',resolve(root,'fonts/msgothic.ttf')+'@/msgothic.ttf',
  '-o',loader];
await new Promise((acc,rej)=>{const c=spawn(python,[emcc,...args],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';for(const s of [c.stdout,c.stderr])s.on('data',b=>{log+=b;process.stdout.write(b);});c.on('error',rej);c.on('exit',code=>code?rej(Error('build failed '+code+'\n'+log)):acc());});
console.log('OK ->',loader);

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=[
  ['th19.html',resolve(root,'sdl-runtime/managed.html')],
  ['shell.mjs',resolve(root,'sdl-runtime/managed.mjs')],
  ['managed.css',resolve(root,'sdl-runtime/managed.css')],
  ['keyboard.mjs',resolve(root,'sdl-runtime/keyboard.mjs')],
  ['th19.mjs',resolve(compiled,'th19.mjs')],
  ['th19.wasm',resolve(compiled,'th19.wasm')],
];
for(const [,source] of inputs)if(!existsSync(source))throw Error(`Missing TH19 Runtime input: ${source}`);
for(const [name,source] of inputs)copyFileSync(source,resolve(output,name));
writeFileSync(resolve(output,'manifest.json'),JSON.stringify({
  game:'th19',protocol:'eagler-touhou/1',features:{thprac:false,languages:false,focusHitbox:false},
},null,2)+'\n');
const files=Object.fromEntries([...inputs.map(([name])=>name),'manifest.json'].map(name=>{
  const bytes=readFileSync(resolve(output,name));
  return [name,{bytes:bytes.length,sha256:sha256(bytes)}];
}));
writeFileSync(resolve(output,'runtime-files.json'),JSON.stringify({schema:'eagler-touhou/runtime-directory/1',files},null,2)+'\n');
console.log(JSON.stringify({output,files:Object.keys(files),wasm:files['th19.wasm'].sha256}));

