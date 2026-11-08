const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");
const code=document.getElementById("code");
const output=document.getElementById("console");

const codeArea=document.getElementById("code-area");
const previewArea=document.getElementById("preview-area");
const previewImage=document.getElementById("preview-image");
const previewInfo=document.getElementById("preview-info");

const projectNameInput=document.getElementById("projectNameInput");

let running=false;
let animation=null;
let frameRunner=null;
let activeFile="main.lua";
let activeAsset=null;
let projectName="MiJuego";
let lastFrameTime=null;
let previewURL=null;

let projectFiles={
 "main.lua":`-- POU GAME STUDIO 1.0
`
};

let projectAssets={};
let imageCache={};

const fileList=document.getElementById("fileList");
const assetList=document.getElementById("assetList");

if(projectNameInput){
 projectNameInput.value=projectName;

 projectNameInput.addEventListener("input",()=>{
  projectName=projectNameInput.value.trim()||"MiJuego";
  refreshExplorer();
 });
}

function log(message,type="normal"){
 const div=document.createElement("div");
 if(type==="error")div.className="error";
 if(type==="info")div.className="info";
 div.textContent="> "+String(message);
 output.appendChild(div);
 output.scrollTop=output.scrollHeight;
}

function isImage(path){
 return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(path);
}

function isEditableText(path){
 return /\.(lua|txt|json|xml|html?|css|js|mjs|md|csv|ya?ml|toml|ini|pc|log|glsl|vert|frag|shader|cfg|conf|bat|py|c|cpp|h|java|sql)$/i.test(path);
}

function saveActiveFile(){
 if(activeFile && Object.hasOwn(projectFiles,activeFile)){
  projectFiles[activeFile]=code.value;
 }
}

function showCodeEditor(){
 codeArea.style.display="block";
 previewArea.style.display="none";

 if(previewURL){
  URL.revokeObjectURL(previewURL);
  previewURL=null;
 }

 document.getElementById("saveButton").disabled=false;
}

function showImagePreview(path){
 saveActiveFile();
 activeFile=null;
 activeAsset=path;

 codeArea.style.display="none";
 previewArea.style.display="flex";

 if(previewURL){
  URL.revokeObjectURL(previewURL);
  previewURL=null;
 }

 const asset=projectAssets[path];

 if(asset && isImage(path)){
  previewURL=URL.createObjectURL(asset);
  previewImage.src=previewURL;
  previewImage.style.display="block";
  previewInfo.textContent=path+" · "+(asset.size||0)+" bytes";
 }else{
  previewImage.removeAttribute("src");
  previewImage.style.display="none";
  previewInfo.textContent=path+" · Asset no compatible con vista previa";
 }

 document.getElementById("saveButton").disabled=true;
 document.getElementById("fileStatus").textContent=path+" · Solo vista previa";

 refreshExplorer();
}

function refreshExplorer(){
 fileList.innerHTML="";

 Object.keys(projectFiles).forEach(path=>{
  const button=document.createElement("button");
  button.className="file-item"+(path===activeFile?" active":"");
  button.textContent="📄 "+path;
  button.onclick=()=>selectFile(path);
  fileList.appendChild(button);
 });

 assetList.innerHTML="";

 Object.keys(projectAssets).forEach(path=>{
  const button=document.createElement("button");
  button.className="asset-item"+(path===activeAsset?" active":"");
  button.textContent=(isImage(path)?"🖼️ ":"📦 ")+path.replace(/^assets\//i,"");
  button.onclick=()=>showImagePreview(path);
  assetList.appendChild(button);
 });

 const display=document.getElementById("projectNameDisplay");
 if(display)display.textContent=projectName;

 if(projectNameInput && projectNameInput.value!==projectName){
  projectNameInput.value=projectName;
 }
}

function selectFile(path){
 saveActiveFile();
 if(!Object.hasOwn(projectFiles,path))return;

 activeFile=path;
 activeAsset=null;
 showCodeEditor();
 code.value=projectFiles[path];

 document.getElementById("fileStatus").textContent=path;
 refreshExplorer();
}

function newLua(){
 const name=prompt("Nombre del archivo Lua:","nuevo.lua");
 if(!name)return;

 let filename=name.trim().replace(/\\/g,"/");

 if(!filename.toLowerCase().endsWith(".lua")){
  filename+=".lua";
 }

 if(Object.hasOwn(projectFiles,filename) || Object.hasOwn(projectAssets,filename)){
  alert("Ese archivo ya existe.");
  return;
 }

 if(filename.startsWith("/") || filename.split("/").includes("..")){
  alert("Nombre de archivo no válido.");
  return;
 }

 if(filename.includes("/")){
  const folders=filename.split("/");
  if(folders.some(part=>!part || part.includes(":"))){
   alert("Ruta no válida.");
   return;
  }
 }

 projectFiles[filename]="-- "+filename+"\n\n";
 selectFile(filename);
 log("Archivo creado: "+filename,"info");
}

// IMPORTAR ASSETS
function importAssets(){
 document.getElementById("assetInput").click();
}

document.getElementById("assetInput").addEventListener("change",async e=>{
 const files=Array.from(e.target.files);

 for(const file of files){
  if(file.name.includes("/") || file.name.includes("\\")){
   log("Nombre de asset no válido: "+file.name,"error");
   continue;
  }

  const path="assets/"+file.name;
  projectAssets[path]=file;
  removeImageFromCache(path);
  log("Asset importado: "+file.name,"info");
 }

 refreshExplorer();
 e.target.value="";
});

// IMPORTAR ARCHIVOS DE TEXTO
function importTextFiles(){
 document.getElementById("textInput").click();
}

document.getElementById("textInput").addEventListener("change",async e=>{
 const files=Array.from(e.target.files);

 for(const file of files){
  if(file.name.includes("/") || file.name.includes("\\")){
   log("Nombre de archivo no válido: "+file.name,"error");
   continue;
  }

  if(isImage(file.name)){
   log("Las imágenes se importan como assets, no como archivos editables: "+file.name,"error");
   continue;
  }

  if(!isEditableText(file.name)){
   log("Formato no compatible con el editor de texto: "+file.name,"error");
   continue;
  }

  try{
   const content=await file.text();
   projectFiles[file.name]=content;
   log("Archivo importado: "+file.name,"info");
  }catch(err){
   log("No se pudo leer "+file.name+": "+err.message,"error");
  }
 }

 refreshExplorer();
 e.target.value="";
});

// TAGS Y COLISIONES
let taggedObjects=[];
let previousTaggedObjects=[];

function tagsAreTouching(tag1,tag2){
 const aList=previousTaggedObjects.filter(o=>o.tag===String(tag1));
 const bList=previousTaggedObjects.filter(o=>o.tag===String(tag2));

 for(const a of aList)for(const b of bList){
  if(a===b)continue;

  if(a.x<b.x+b.width &&
     a.x+a.width>b.x &&
     a.y<b.y+b.height &&
     a.y+a.height>b.y){
   return true;
  }
 }

 return false;
}

// COORDENADAS NORMALIZADAS
function px(x){
 return (x+1)*canvas.width/2;
}

function py(y){
 return (1-y)*canvas.height/2;
}

function parseColor(c){
 if(c===undefined || c===null)c="FFFFFF";

 c=String(c).replace("#","");

 if(!/^[0-9a-fA-F]{6}$/.test(c)){
  throw new Error("Color hexadecimal inválido: "+c);
 }

 return "#"+c;
}

function checkNumbers(values){
 if(!values.every(v=>
  typeof v==="number" && Number.isFinite(v)
  )){
  throw new Error("Las coordenadas y medidas deben ser números.");
 }
}

function registerTag(tag,x,y,width,height,shape="rect",radius=0){
 if(tag===undefined||tag===null||String(tag)==="")return;

 taggedObjects.push({
  tag:String(tag),
  x:Math.min(x,x+width),
  y:Math.min(y,y+height),
  width:Math.abs(width),
  height:Math.abs(height),
  shape,
  radius:Math.abs(radius)
 });
}

function drawLine(x1,y1,x2,y2,color,tag){
 checkNumbers([x1,y1,x2,y2]);

 ctx.save();
 ctx.strokeStyle=parseColor(color);
 ctx.lineWidth=3;
 ctx.beginPath();
 ctx.moveTo(px(x1),py(y1));
 ctx.lineTo(px(x2),py(y2));
 ctx.stroke();
 ctx.restore();

 const ax=px(x1),ay=py(y1),bx=px(x2),by=py(y2);

 registerTag(
  tag,
  Math.min(ax,bx)-2,
  Math.min(ay,by)-2,
  Math.abs(bx-ax)+4,
  Math.abs(by-ay)+4
 );
}

function isFilled(fill){
 return fill===true ||
  String(fill).toLowerCase()==="fill" ||
  String(fill).toLowerCase()==="filled";
}

function drawRectangle(x,y,width,height,fill,color,tag){
 checkNumbers([x,y,width,height]);

 const finalColor=parseColor(color);
 const centerX=px(x);
 const centerY=py(y);

 const pixelWidth=width*canvas.width/2;
 const pixelHeight=height*canvas.height/2;

 const left=centerX-pixelWidth/2;
 const top=centerY-pixelHeight/2;

 ctx.save();

 if(isFilled(fill)){
  ctx.fillStyle=finalColor;
  ctx.fillRect(left,top,pixelWidth,pixelHeight);
 }else{
  ctx.strokeStyle=finalColor;
  ctx.lineWidth=3;
  ctx.strokeRect(left,top,pixelWidth,pixelHeight);
 }

 ctx.restore();

 registerTag(tag,left,top,pixelWidth,pixelHeight);
}

function drawCircle(x,y,radius,fill,color,tag){
 checkNumbers([x,y,radius]);

 if(radius<0)throw new Error("El radio no puede ser negativo.");

 const finalColor=parseColor(color);
 const centerX=px(x),centerY=py(y);
 const pixelRadius=radius*Math.min(canvas.width,canvas.height)/2;

 ctx.save();
 ctx.beginPath();
 ctx.arc(centerX,centerY,pixelRadius,0,Math.PI*2);

 if(isFilled(fill)){
  ctx.fillStyle=finalColor;
  ctx.fill();
 }else{
  ctx.strokeStyle=finalColor;
  ctx.lineWidth=3;
  ctx.stroke();
 }

 ctx.restore();

 registerTag(
  tag,
  centerX-pixelRadius,
  centerY-pixelRadius,
  pixelRadius*2,
  pixelRadius*2,
  "circle",
  pixelRadius
 );
}

function drawText(text,x,y,color,tag){
 checkNumbers([x,y]);

 const value=String(text);

 ctx.save();
 ctx.fillStyle=parseColor(color);
 ctx.font="24px Arial";
 ctx.textAlign="center";
 ctx.textBaseline="middle";
 ctx.fillText(value,px(x),py(y));

 const width=ctx.measureText(value).width;
 ctx.restore();

 registerTag(tag,px(x)-width/2,py(y)-14,width,28);
}

function findAsset(path){
 path=String(path).replace(/\\/g,"/").replace(/^assets\//i,"");

 const exact="assets/"+path;

 if(projectAssets[exact])return exact;

 return Object.keys(projectAssets).find(
  key=>key.replace(/^assets\//i,"").toLowerCase()===path.toLowerCase()
 )||null;
}

function removeImageFromCache(path){
 const cached=imageCache[path];

 if(cached && cached.url){
  URL.revokeObjectURL(cached.url);
 }

 delete imageCache[path];
}

function clearImageCache(){
 for(const path of Object.keys(imageCache)){
  removeImageFromCache(path);
 }
}

function getProjectImage(path){
 const assetPath=findAsset(path);

 if(!assetPath){
  if(!imageCache["missing:"+path]){
   imageCache["missing:"+path]={missing:true};
   log("No se encontró la imagen: "+path,"error");
  }

  return null;
 }

 if(imageCache[assetPath]){
  return imageCache[assetPath];
 }

 const asset=projectAssets[assetPath];
 const url=URL.createObjectURL(asset);
 const img=new Image();

 const entry={
  image:img,
  url:url,
  loaded:false,
  error:false
 };

 imageCache[assetPath]=entry;

 img.onload=()=>{
  entry.loaded=true;
 };

 img.onerror=()=>{
  entry.error=true;
  log("No se pudo cargar la imagen: "+assetPath,"error");
 };

 img.src=url;

 return entry;
}

function drawImage(x,y,height,width,path,tag){
 checkNumbers([x,y,height,width]);

 if(height<0 || width<0){
  throw new Error("El alto y ancho de la imagen no pueden ser negativos.");
 }

 const entry=getProjectImage(path);

 if(!entry || !entry.loaded || entry.error)return;

 const centerX=px(x);
 const centerY=py(y);

 const pixelWidth=width*canvas.width/2;
 const pixelHeight=height*canvas.height/2;

 ctx.save();

 ctx.drawImage(
  entry.image,
  centerX-pixelWidth/2,
  centerY-pixelHeight/2,
  pixelWidth,
  pixelHeight
 );

 ctx.restore();

 registerTag(
  tag,
  centerX-pixelWidth/2,
  centerY-pixelHeight/2,
  pixelWidth,
  pixelHeight
 );
}

function clearScreen(){
 ctx.save();
 ctx.fillStyle="#090B10";
 ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.restore();
}

// TECLADO
const keysDown=new Set();
const keyOrder=[];

function normalizeKey(key){
 return String(key).toLowerCase();
}

function isEditableTarget(target){
 return target && (
  target.tagName==="TEXTAREA" ||
  target.tagName==="INPUT" ||
  target.tagName==="SELECT" ||
  target.isContentEditable
 );
}

window.addEventListener("keydown",e=>{
 if(!running || isEditableTarget(e.target))return;

 const key=normalizeKey(e.key);

 if(!keysDown.has(key)){
  keysDown.add(key);
  keyOrder.push(key);
 }

 if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(key)){
  e.preventDefault();
 }
});

window.addEventListener("keyup",e=>{
 const key=normalizeKey(e.key);
 keysDown.delete(key);

 const index=keyOrder.indexOf(key);

 if(index!==-1){
  keyOrder.splice(index,1);
 }
});

window.addEventListener("blur",()=>{
 keysDown.clear();
 keyOrder.length=0;
});

canvas.addEventListener("click",()=>{
 canvas.focus();
});

function checkKey(key){
 if(key===undefined || key===null || key===""){
  for(let i=keyOrder.length-1;i>=0;i--){
   if(keysDown.has(keyOrder[i])){
    return keyOrder[i];
   }
  }

  return null;
 }

 return keysDown.has(normalizeKey(key));
}

// PUENTES JAVASCRIPT PARA LUA
window.__pg_line=(x1,y1,x2,y2,color,tag)=>drawLine(x1,y1,x2,y2,color,tag);
window.__pg_rectangle=(x,y,w,h,fill,color,tag)=>drawRectangle(x,y,w,h,fill,color,tag);
window.__pg_circle=(x,y,radius,fill,color,tag)=>drawCircle(x,y,radius,fill,color,tag);
window.__pg_text=(text,x,y,color,tag)=>drawText(text,x,y,color,tag);
window.__pg_image=(x,y,height,width,path,tag)=>drawImage(x,y,height,width,path,tag);

window.__pg_clear=()=>{
 clearScreen();
};

window.__pg_is_down=(key)=>{
 return checkKey(key);
};

window.__pg_log=(message)=>{
 log(message);
};

window.__pg_set_res=(width,height)=>{
 width=Number(width);
 height=Number(height);

 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0){
  throw new Error("La resolución debe usar números enteros positivos.");
 }

 if(width>8192||height>8192){
  throw new Error("La resolución máxima es 8192 × 8192.");
 }

 canvas.width=width;
 canvas.height=height;

 log("Resolución del escenario: "+width+" × "+height,"info");
};

window.__pg_get_stage_width=()=>canvas.width;
window.__pg_get_stage_height=()=>canvas.height;
window.__pg_tag_touching=(a,b)=>tagsAreTouching(a,b);

let sleepUntil=0;

window.__pg_sleep=(milliseconds)=>{
 const ms=Number(milliseconds);

 if(!Number.isFinite(ms)||ms<0){
  throw new Error("sleep requiere milisegundos no negativos.");
 }

 sleepUntil=Math.max(sleepUntil,performance.now()+ms);
};

// PREPARAR LUA
function createLuaPrefix(){
 return `
local js = require("js")

local jsLine = js.global.__pg_line
local jsRectangle = js.global.__pg_rectangle
local jsCircle = js.global.__pg_circle
local jsText = js.global.__pg_text
local jsImage = js.global.__pg_image
local jsClear = js.global.__pg_clear
local jsIsDown = js.global.__pg_is_down
local jsLog = js.global.__pg_log
local jsTagTouching = js.global.__pg_tag_touching
local jsSleep = js.global.__pg_sleep
local jsSetRes = js.global.__pg_set_res
local jsGetWidth = js.global.__pg_get_stage_width
local jsGetHeight = js.global.__pg_get_stage_height

pougame = {
    draw = {},
    keyboard = {},
    sys = {},
    tag = {}
}

pougame.draw.line = function(x1,y1,x2,y2,color,tag)
 jsLine(nil,x1,y1,x2,y2,color,tag)
end

pougame.draw.rectangle = function(x,y,ancho,alto,fill,color,tag)
 jsRectangle(nil,x,y,ancho,alto,fill,color,tag)
end

pougame.draw.circle = function(x,y,radio,fill,color,tag)
 jsCircle(nil,x,y,radio,fill,color,tag)
end

pougame.draw.text = function(texto,x,y,color,tag)
 jsText(nil,tostring(texto),x,y,color,tag)
end

pougame.draw.image = function(x,y,alto,ancho,imagen,tag)
 jsImage(nil,x,y,alto,ancho,tostring(imagen),tag)
end

pougame.draw.clear = function()
    jsClear(nil)
end

pougame.keyboard.isDown = function(key)
    if key == nil then
        return jsIsDown(nil)
    end

    return jsIsDown(nil,tostring(key))
end

pougame.log = function(message)
    jsLog(nil,tostring(message))
end

pougame.tag.tagIsTouching = function(tag1,tag2)
 return jsTagTouching(nil,tostring(tag1),tostring(tag2))
end

pougame.sys.setRes = function(ancho,alto)
 jsSetRes(nil,ancho,alto)
end

pougame.sys.getStageWidth = function()
 return jsGetWidth()
end

pougame.sys.getStageHeight = function()
 return jsGetHeight()
end

pougame.sys.sleep = function(milliseconds)
 jsSleep(nil,milliseconds)
end

print = function(...)
    local values = {}

    for i,v in ipairs({...}) do
        values[i] = tostring(v)
    end

    jsLog(nil,table.concat(values," "))
end
`;
}

function luaString(value){
 return '"'+value
  .replace(/\\/g,"\\\\")
  .replace(/"/g,'\\"')
  .replace(/\n/g,"\\n")+'"';
}

function moduleName(path){
 return path
  .replace(/\.lua$/i,"")
  .replace(/\//g,".");
}

function createModules(){
 let result="";

 for(const [path,source] of Object.entries(projectFiles)){
  if(path==="main.lua" || !path.toLowerCase().endsWith(".lua")){
   continue;
  }

  const name=moduleName(path);
  const names=[name];

  if(name.includes(".")){
   names.push(name.split(".").pop());
  }

  for(const alias of new Set(names)){
   result+=`
package.preload[${luaString(alias)}] = function(...)
${source}
end
`;
  }
 }

 return result;
}

// DETENER
function stopGame(){
 running=false;

 if(animation!==null){
  cancelAnimationFrame(animation);
  animation=null;
 }

 frameRunner=null;
 lastFrameTime=null;
 sleepUntil=0;

 taggedObjects=[];
 previousTaggedObjects=[];

 keysDown.clear();
 keyOrder.length=0;

 document.getElementById("gameStatus").textContent="Detenido";
}

// EJECUTAR JUEGO
function runGame(){
 saveActiveFile();
 stopGame();

 output.innerHTML="";
 clearScreen();

 if(!window.fengari){
  log("No se pudo cargar Fengari.","error");
  return;
 }

 try{
  if(!projectFiles["main.lua"]){
   throw new Error("No existe main.lua");
  }

  const source=
   createLuaPrefix()+
   createModules()+
   "\n"+projectFiles["main.lua"];

  const program=fengari.load(source,"main.lua");
  program();

  fengari.load(`
   if onLoad then
    onLoad()
   end
  `,"onLoad")();

  frameRunner=fengari.load(`
   local js = require("js")
   local dt = js.global.__pg_dt

   if onUpdate then
    onUpdate(dt)
   end

   if onDraw then
    onDraw()
   end
  `,"gameLoop");

  running=true;

  document.getElementById("gameStatus").textContent="● Ejecutando";
  canvas.focus();

  log("Proyecto ejecutado correctamente","info");

  animation=requestAnimationFrame(gameLoop);

 }catch(e){
  running=false;
  document.getElementById("gameStatus").textContent="Error";
  log(e.message||String(e),"error");
 }
}

function gameLoop(timestamp){
 if(!running)return;

 try{
  let dt=0;

  if(lastFrameTime!==null){
   dt=Math.min((timestamp-lastFrameTime)/1000,0.1);
  }

  lastFrameTime=timestamp;
  window.__pg_dt=dt;

  if(performance.now()<sleepUntil){
   animation=requestAnimationFrame(gameLoop);
   return;
  }

  sleepUntil=0;

  previousTaggedObjects=taggedObjects;
  taggedObjects=[];

  clearScreen();
  frameRunner();

 }catch(e){
  running=false;
  document.getElementById("gameStatus").textContent="Error";
  log(e.message||String(e),"error");
  return;
 }

 animation=requestAnimationFrame(gameLoop);
}

// GUARDAR ARCHIVO INDIVIDUAL
function saveCurrentFile(){
 if(!activeFile || !Object.hasOwn(projectFiles,activeFile)){
  return;
 }

 saveActiveFile();

 const blob=new Blob([projectFiles[activeFile]],{
  type:"text/plain;charset=utf-8"
 });

 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");

 a.href=url;
 a.download=activeFile.split("/").pop();
 a.click();

 setTimeout(()=>URL.revokeObjectURL(url),1000);

 log("Archivo guardado: "+activeFile,"info");
}

// EXPORTAR PROYECTO
async function exportPou(){
 saveActiveFile();

 if(!window.JSZip){
  log("JSZip no está disponible.","error");
  return;
 }

 try{
  projectName=projectNameInput?.value.trim()||projectName||"MiJuego";

  const zip=new JSZip();

  for(const [path,source] of Object.entries(projectFiles)){
   zip.file(path,source);
  }

  for(const [path,file] of Object.entries(projectAssets)){
   zip.file(path,file);
  }

  const metadata={
   format:"PouGame Project",
   formatVersion:1,
   name:projectName,
   engine:"PouGame Studio",
   engineVersion:"1.0",
   entryPoint:"main.lua",
   scripts:Object.keys(projectFiles).filter(p=>p.toLowerCase().endsWith(".lua")),
   files:Object.keys(projectFiles),
   assets:Object.keys(projectAssets)
  };

  zip.file("project.json",JSON.stringify(metadata,null,2));

  const blob=await zip.generateAsync({
   type:"blob",
   compression:"DEFLATE"
  });

  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");

  a.href=url;
  a.download=projectName+".pou";
  a.click();

  setTimeout(()=>URL.revokeObjectURL(url),1000);

  log("Proyecto exportado: "+projectName+".pou","info");

 }catch(e){
  log("Error exportando: "+e.message,"error");
 }
}

// ABRIR PROYECTO
function openPou(){
 document.getElementById("projectInput").click();
}

document.getElementById("projectInput").addEventListener("change",async e=>{
 const file=e.target.files[0];
 if(!file)return;

 try{
  if(!window.JSZip){
   throw new Error("JSZip no está disponible");
  }

  const zip=await JSZip.loadAsync(file);

  if(!zip.file("main.lua")){
   throw new Error("Falta main.lua");
  }

  const newFiles={};
  const newAssets={};

  for(const [path,entry] of Object.entries(zip.files)){
   if(entry.dir || path==="project.json")continue;

   if(path.startsWith("assets/")){
    newAssets[path]=await entry.async("blob");
   }else if(isEditableText(path)){
    newFiles[path]=await entry.async("string");
   }
  }

  if(!newFiles["main.lua"]){
   throw new Error("No se encontró main.lua");
  }

  let metadata={};

  if(zip.file("project.json")){
   metadata=JSON.parse(
    await zip.file("project.json").async("string")
   );
  }

  stopGame();
  clearImageCache();

  projectFiles=newFiles;
  projectAssets=newAssets;

  if(previewURL){
   URL.revokeObjectURL(previewURL);
   previewURL=null;
  }

  activeAsset=null;
  projectName=metadata.name || file.name.replace(/\.pou$/i,"");

  activeFile="main.lua";
  code.value=projectFiles[activeFile];

  if(projectNameInput){
   projectNameInput.value=projectName;
  }

  showCodeEditor();
  refreshExplorer();

  document.getElementById("fileStatus").textContent="main.lua";

  log("Proyecto completo abierto correctamente","info");

 }catch(e){
  log("Error abriendo proyecto: "+e.message,"error");
 }

 e.target.value="";
});

// ACTUALIZAR CONTENIDO AL ESCRIBIR
code.addEventListener("input",()=>{
 if(activeFile){
  projectFiles[activeFile]=code.value;
 }
});

// PUBLICAR COMO UN SOLO index.html
async function publishHTML(shareOnline=false){
 saveActiveFile();

 try{
  if(!window.fengari){
   throw new Error("Fengari no está disponible. Comprueba tu conexión.");
  }

  if(!projectFiles["main.lua"]){
   throw new Error("No existe main.lua.");
  }

  projectName=projectNameInput?.value.trim()||"MiJuego";

  const files={...projectFiles};
  const assets={};

  for(const [path,file] of Object.entries(projectAssets)){
   const bytes=new Uint8Array(await file.arrayBuffer());
   let binary="";

   for(let i=0;i<bytes.length;i+=0x8000){
    binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
   }

   assets[path]={
    type:file.type||"application/octet-stream",
    data:btoa(binary)
   };
  }

  const payload={
   name:projectName,
   files,
   assets
  };

  const payloadText=JSON.stringify(payload)
   .replace(/</g,"\\u003c")
   .replace(/\u2028/g,"\\u2028")
   .replace(/\u2029/g,"\\u2029");

  const safeTitle=projectName.replace(/[&<>"']/g,c=>({
   "&":"&amp;",
   "<":"&lt;",
   ">":"&gt;",
   '"':"&quot;",
   "'":"&#39;"
  }[c]));

  const playerHTML=`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<script src="https://unpkg.com/fengari-web@0.1.4/dist/fengari-web.js"><\/script>
<style>
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;background:#090b10;color:#eee;font-family:Arial}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;gap:10px}
h1{font-size:18px;margin:0;color:#80aaff}
#game{display:block;width:min(100%,1200px);height:auto;max-height:calc(100vh - 100px);aspect-ratio:4/3;object-fit:contain;background:#090b10;border:1px solid #353b4d}
#console{width:min(100%,1200px);max-height:90px;overflow:auto;background:#11131a;border:1px solid #353b4d;border-radius:6px;padding:7px;font:12px Consolas,monospace;color:#a9e8b9}
.error{color:#ff8585}
.info{color:#91baff}
#status{font-size:11px;color:#9da5b8}
</style>
</head>
<body>
<h1 id="title"></h1>
<canvas id="game" width="800" height="600" tabindex="0"></canvas>
<div id="status">Iniciando juego…</div>
<div id="console"></div>

<script>
const PROJECT=${payloadText};
document.getElementById("title").textContent=PROJECT.name;
<\/script>

<script>
(async()=>{
const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");
const output=document.getElementById("console");
const status=document.getElementById("status");

let projectFiles=PROJECT.files||{};
let projectAssets={};
let imageCache={};
let running=false;
let animation=null;
let frameRunner=null;
let lastTime=null;
let sleepUntil=0;
let taggedObjects=[];
let previousTaggedObjects=[];

const keysDown=new Set();
const keyOrder=[];

function log(message,type){
 const div=document.createElement("div");
 div.textContent="> "+String(message);
 if(type==="error")div.className="error";
 if(type==="info")div.className="info";
 output.appendChild(div);
 output.scrollTop=output.scrollHeight;
}

function px(x){return (x+1)*canvas.width/2;}
function py(y){return (1-y)*canvas.height/2;}

function color(value){
 value=value===undefined||value===null?"FFFFFF":String(value);
 value=value.replace("#","");
 if(!/^[0-9a-fA-F]{6}$/.test(value))throw new Error("Color hexadecimal inválido: "+value);
 return "#"+value;
}

function checkNumbers(values){
 if(!values.every(v=>typeof v==="number"&&Number.isFinite(v)))throw new Error("Las coordenadas y medidas deben ser números.");
}

function filled(value){
 return value===true||String(value).toLowerCase()==="fill"||String(value).toLowerCase()==="filled";
}

function registerTag(tag,x,y,w,h){
 if(tag===undefined||tag===null||String(tag)==="")return;
 taggedObjects.push({
  tag:String(tag),
  x:Math.min(x,x+w),
  y:Math.min(y,y+h),
  width:Math.abs(w),
  height:Math.abs(h)
 });
}

function drawLine(x1,y1,x2,y2,c,tag){
 checkNumbers([x1,y1,x2,y2]);
 ctx.save();
 ctx.strokeStyle=color(c);
 ctx.lineWidth=3;
 ctx.beginPath();
 ctx.moveTo(px(x1),py(y1));
 ctx.lineTo(px(x2),py(y2));
 ctx.stroke();
 ctx.restore();
 registerTag(tag,Math.min(px(x1),px(x2))-2,Math.min(py(y1),py(y2))-2,Math.abs(px(x2)-px(x1))+4,Math.abs(py(y2)-py(y1))+4);
}

function drawRectangle(x,y,w,h,fill,c,tag){
 checkNumbers([x,y,w,h]);
 const left=px(x)-w*canvas.width/4;
 const top=py(y)-h*canvas.height/4;
 const width=w*canvas.width/2;
 const height=h*canvas.height/2;
 ctx.save();
 if(filled(fill)){
  ctx.fillStyle=color(c);
  ctx.fillRect(left,top,width,height);
 }else{
  ctx.strokeStyle=color(c);
  ctx.lineWidth=3;
  ctx.strokeRect(left,top,width,height);
 }
 ctx.restore();
 registerTag(tag,left,top,width,height);
}

function drawCircle(x,y,r,fill,c,tag){
 checkNumbers([x,y,r]);
 if(r<0)throw new Error("El radio no puede ser negativo.");
 const cx=px(x),cy=py(y);
 const radius=r*Math.min(canvas.width,canvas.height)/2;
 ctx.save();
 ctx.beginPath();
 ctx.arc(cx,cy,radius,0,Math.PI*2);
 if(filled(fill)){
  ctx.fillStyle=color(c);
  ctx.fill();
 }else{
  ctx.strokeStyle=color(c);
  ctx.lineWidth=3;
  ctx.stroke();
 }
 ctx.restore();
 registerTag(tag,cx-radius,cy-radius,radius*2,radius*2);
}

function drawText(value,x,y,c,tag){
 checkNumbers([x,y]);
 value=String(value);
 ctx.save();
 ctx.fillStyle=color(c);
 ctx.font="24px Arial";
 ctx.textAlign="center";
 ctx.textBaseline="middle";
 ctx.fillText(value,px(x),py(y));
 const width=ctx.measureText(value).width;
 ctx.restore();
 registerTag(tag,px(x)-width/2,py(y)-14,width,28);
}

function findAsset(path){
 path=String(path).replace(/\\\\/g,"/").replace(/^assets\\//i,"");
 const exact="assets/"+path;
 if(projectAssets[exact])return exact;
 return Object.keys(projectAssets).find(key=>key.replace(/^assets\\//i,"").toLowerCase()===path.toLowerCase())||null;
}

function drawImage(x,y,h,w,path,tag){
 checkNumbers([x,y,h,w]);
 if(h<0||w<0)throw new Error("Medidas de imagen inválidas.");
 const assetPath=findAsset(path);
 if(!assetPath){
  log("No se encontró la imagen: "+path,"error");
  return;
 }
 let entry=imageCache[assetPath];
 if(!entry){
  const url=URL.createObjectURL(projectAssets[assetPath]);
  const img=new Image();
  entry=imageCache[assetPath]={image:img,loaded:false,error:false,url};
  img.onload=()=>entry.loaded=true;
  img.onerror=()=>entry.error=true;
  img.src=url;
 }
 if(!entry.loaded||entry.error)return;
 const width=w*canvas.width/2;
 const height=h*canvas.height/2;
 const left=px(x)-width/2;
 const top=py(y)-height/2;
 ctx.drawImage(entry.image,left,top,width,height);
 registerTag(tag,left,top,width,height);
}

function clearScreen(){
 ctx.fillStyle="#090B10";
 ctx.fillRect(0,0,canvas.width,canvas.height);
}

function tagsAreTouching(a,b){
 const aa=previousTaggedObjects.filter(o=>o.tag===String(a));
 const bb=previousTaggedObjects.filter(o=>o.tag===String(b));
 for(const x of aa)for(const y of bb){
  if(x===y)continue;
  if(x.x<y.x+y.width&&x.x+x.width>y.x&&x.y<y.y+y.height&&x.y+x.height>y.y)return true;
 }
 return false;
}

function checkKey(key){
 if(key===undefined||key===null||key===""){
  for(let i=keyOrder.length-1;i>=0;i--){
   if(keysDown.has(keyOrder[i]))return keyOrder[i];
  }
  return null;
 }
 return keysDown.has(String(key).toLowerCase());
}

window.addEventListener("keydown",e=>{
 if(!running)return;
 const key=e.key.toLowerCase();
 if(!keysDown.has(key)){keysDown.add(key);keyOrder.push(key);}
 if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(key))e.preventDefault();
});

window.addEventListener("keyup",e=>{
 const key=e.key.toLowerCase();
 keysDown.delete(key);
 const index=keyOrder.indexOf(key);
 if(index!==-1)keyOrder.splice(index,1);
});

window.addEventListener("blur",()=>{
 keysDown.clear();
 keyOrder.length=0;
});

canvas.addEventListener("click",()=>canvas.focus());

window.__pg_line=drawLine;
window.__pg_rectangle=drawRectangle;
window.__pg_circle=drawCircle;
window.__pg_text=drawText;
window.__pg_image=drawImage;
window.__pg_clear=clearScreen;
window.__pg_is_down=checkKey;
window.__pg_log=log;
window.__pg_tag_touching=tagsAreTouching;

window.__pg_set_res=(w,h)=>{
 w=Number(w);h=Number(h);
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<=0||h<=0)throw new Error("Resolución inválida.");
 if(w>8192||h>8192)throw new Error("Resolución máxima: 8192 × 8192.");
 canvas.width=w;canvas.height=h;
};

window.__pg_get_stage_width=()=>canvas.width;
window.__pg_get_stage_height=()=>canvas.height;
window.__pg_dt=0;

window.__pg_sleep=ms=>{
 ms=Number(ms);
 if(!Number.isFinite(ms)||ms<0)throw new Error("sleep requiere milisegundos no negativos.");
 sleepUntil=Math.max(sleepUntil,performance.now()+ms);
};

function luaString(value){
 return '"'+String(value).replace(/\\\\/g,"\\\\\\\\").replace(/"/g,'\\\\"').replace(/\\n/g,"\\\\n").replace(/\\r/g,"\\\\r")+'"';
}

function moduleName(path){
 return path.replace(/\\.lua$/i,"").replace(/\\//g,".");
}

function createModules(){
 let result="";
 for(const [path,source] of Object.entries(projectFiles)){
  if(path==="main.lua"||!path.toLowerCase().endsWith(".lua"))continue;
  const name=moduleName(path);
  const aliases=[name];
  if(name.includes("."))aliases.push(name.split(".").pop());
  for(const alias of new Set(aliases)){
   result+="\\npackage.preload["+luaString(alias)+"]=function(...)\\n"+source+"\\nend\\n";
  }
 }
 return result;
}

function createLuaPrefix(){
 return \`
local js=require("js")
local jsLine=js.global.__pg_line
local jsRectangle=js.global.__pg_rectangle
local jsCircle=js.global.__pg_circle
local jsText=js.global.__pg_text
local jsImage=js.global.__pg_image
local jsClear=js.global.__pg_clear
local jsIsDown=js.global.__pg_is_down
local jsLog=js.global.__pg_log
local jsTagTouching=js.global.__pg_tag_touching
local jsSleep=js.global.__pg_sleep
local jsSetRes=js.global.__pg_set_res
local jsGetWidth=js.global.__pg_get_stage_width
local jsGetHeight=js.global.__pg_get_stage_height

pougame={draw={},keyboard={},sys={},tag={}}

pougame.draw.line=function(x1,y1,x2,y2,c,tag) jsLine(nil,x1,y1,x2,y2,c,tag) end
pougame.draw.rectangle=function(x,y,w,h,fill,c,tag) jsRectangle(nil,x,y,w,h,fill,c,tag) end
pougame.draw.circle=function(x,y,r,fill,c,tag) jsCircle(nil,x,y,r,fill,c,tag) end
pougame.draw.text=function(t,x,y,c,tag) jsText(nil,tostring(t),x,y,c,tag) end
pougame.draw.image=function(x,y,h,w,path,tag) jsImage(nil,x,y,h,w,tostring(path),tag) end
pougame.draw.clear=function() jsClear(nil) end

pougame.keyboard.isDown=function(key)
 if key==nil then return jsIsDown(nil) end
 return jsIsDown(nil,tostring(key))
end

pougame.log=function(...)
 local values={}
 for i,v in ipairs({...}) do values[i]=tostring(v) end
 jsLog(nil,table.concat(values," "))
end

pougame.tag.tagIsTouching=function(a,b) return jsTagTouching(nil,tostring(a),tostring(b)) end
pougame.sys.setRes=function(w,h) jsSetRes(nil,w,h) end
pougame.sys.getStageWidth=function() return jsGetWidth() end
pougame.sys.getStageHeight=function() return jsGetHeight() end
pougame.sys.sleep=function(ms) jsSleep(nil,ms) end
print=pougame.log
\`;
}

function gameLoop(timestamp){
 if(!running)return;
 try{
  let dt=0;
  if(lastTime!==null)dt=Math.min((timestamp-lastTime)/1000,0.1);
  lastTime=timestamp;
  window.__pg_dt=dt;
  if(performance.now()<sleepUntil){
   animation=requestAnimationFrame(gameLoop);
   return;
  }
  sleepUntil=0;
  previousTaggedObjects=taggedObjects;
  taggedObjects=[];
  clearScreen();
  frameRunner();
 }catch(e){
  running=false;
  status.textContent="Error";
  log(e.message||String(e),"error");
  return;
 }
 animation=requestAnimationFrame(gameLoop);
}

function runGame(){
 if(!window.fengari)throw new Error("Fengari no está disponible.");
 if(!projectFiles["main.lua"])throw new Error("No existe main.lua.");
 const source=createLuaPrefix()+createModules()+"\\n"+projectFiles["main.lua"];
 fengari.load(source,"main.lua")();
 fengari.load("if onLoad then onLoad() end","onLoad")();
 frameRunner=fengari.load(\`
 local js=require("js")
 local dt=js.global.__pg_dt
 if onUpdate then onUpdate(dt) end
 if onDraw then onDraw() end
 \`,"gameLoop");
 running=true;
 status.textContent="● Ejecutando";
 canvas.focus();
 log("Proyecto ejecutado correctamente","info");
 animation=requestAnimationFrame(gameLoop);
}

async function start(){
 try{
  if(!window.fengari)throw new Error("No se pudo cargar Fengari. Comprueba tu conexión.");
  for(const [path,item] of Object.entries(PROJECT.assets||{})){
   const binary=atob(item.data);
   const bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   projectAssets[path]=new Blob([bytes],{type:item.type||"application/octet-stream"});
  }
  clearScreen();
  runGame();
 }catch(e){
  status.textContent="Error al iniciar";
  log(e.message||String(e),"error");
 }
}

start();
})();
<\/script>
</body>
</html>`;
  // PUBLICAR EN POUGAME ONLINE
  if(shareOnline){
   const response=await fetch("/api/games",{
    method:"POST",
    headers:{
     "Content-Type":"application/json"
    },
    body:JSON.stringify({
     name:projectName,
     html:playerHTML
    })
   });

   const responseText=await response.text();

let result={};

try{
 result=JSON.parse(responseText);
}catch(e){
 result={error:responseText};
}

if(!response.ok){
 throw new Error(
  "Netlify HTTP "+response.status+": "+
  (result.error||responseText||"Error desconocido")
 );
}
   const gameURL=location.origin+"/"+result.id;

   // Guardar el enlace y el permiso privado para administrar el juego
   let myGames=[];

   try{
    myGames=JSON.parse(localStorage.getItem("pougameMyGames")||"[]");
    if(!Array.isArray(myGames))myGames=[];
   }catch(e){
    myGames=[];
   }

   myGames.unshift({
    id:result.id,
    name:projectName,
    url:gameURL,
    token:result.token
   });

   localStorage.setItem("pougameMyGames",JSON.stringify(myGames));

   try{
    await navigator.clipboard.writeText(gameURL);
   }catch(e){}

   alert(
    "¡Tu juego está publicado! 🐾\\n\\n"+
    gameURL+
    "\\n\\nEl enlace se ha guardado en tus proyectos."
   );

   log("Juego publicado correctamente","info");
   log(gameURL,"info");

   return;
  }

  const blob=new Blob([playerHTML],{
   type:"text/html;charset=utf-8"
  });

  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");

  a.href=url;
  a.download="index.html";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(url),5000);

  log("¡index.html creado correctamente!","info");
  log("Proyecto: "+projectName,"info");
  log("Los scripts y assets están integrados en el archivo.","info");

 }catch(e){
  log("Error creando index.html: "+(e.message||e),"error");
 }
}

// INICIALIZAR
code.value=projectFiles["main.lua"];
refreshExplorer();
clearScreen();
