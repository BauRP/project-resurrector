/** Only editor geometry/project metadata. Never serializes media blobs or
 * any device/camera permission, file system paths or active recorder.
 * Media stays independently in IndexedDB.
 */
const KEY="multicam-editor-project-v1";
const MAX_BYTES=220000;
type AnyRecord=Record<string,unknown>;
export interface RecoverableEditorProject {
  items: AnyRecord[];
  overlays: AnyRecord[];
  transitions: AnyRecord[];
  hidden: Record<string,boolean>;
  muted: Record<string,boolean>;
}
const plain=(v:unknown):v is AnyRecord=>!!v&&typeof v==="object"&&!Array.isArray(v);
const identifier=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=128;
const finite=(v:unknown,min:number,max:number):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
function validItem(v:unknown):v is AnyRecord {
  return plain(v)&&identifier(v["id"])&&identifier(v["mediaId"])&&
    (v["kind"]==="video"||v["kind"]==="audio")&&finite(v["track"],1,64)&&
    finite(v["start"],0,86400)&&finite(v["in"],0,86400)&&finite(v["out"],0,86400)&&
    (v["out"] as number)>(v["in"] as number)&&
    finite(v["speed"],.05,16)&&typeof v["reverse"]==="boolean"&&
    finite(v["scale"],1,800)&&finite(v["posX"],-1000,1000)&&
    finite(v["opacity"],0,100)&&typeof v["look"]==="string"&&v["look"].length<128;
}
function validOverlay(v:unknown):v is AnyRecord {
  return plain(v)&&identifier(v["id"])&&typeof v["text"]==="string"&&v["text"].length<=3000&&
    finite(v["x"],-100,200)&&finite(v["y"],-100,200)&&
    finite(v["start"],0,86400)&&finite(v["end"],0,86400)&&
    (v["end"] as number)>(v["start"] as number)&&finite(v["size"],4,300);
}
function validTransition(v:unknown):v is AnyRecord {
  return plain(v)&&identifier(v["id"])&&identifier(v["aId"])&&identifier(v["bId"])&&
    finite(v["track"],1,64)&&typeof v["type"]==="string"&&v["type"].length<64&&
    finite(v["dur"],.01,30);
}
// Explicit allowlist avoids persisting arbitrary metadata injected by
// imported projects; nested crop/color must stay bounded numeric settings.
const numericMap=(v:unknown):Record<string,number>|undefined=>{
  if(!plain(v))return undefined;
  const entries=Object.entries(v).filter(([k,x])=>/^[a-zA-Z]{1,30}$/.test(k)&&finite(x,-1000,1000)).slice(0,30);
  return Object.fromEntries(entries) as Record<string,number>;
};
function cleanItem(v:AnyRecord):AnyRecord {
  return {id:v["id"],mediaId:v["mediaId"],kind:v["kind"],track:v["track"],start:v["start"],
    in:v["in"],out:v["out"],speed:v["speed"],reverse:v["reverse"],scale:v["scale"],
    posX:v["posX"],opacity:v["opacity"],look:v["look"],
    ...(numericMap(v["crop"])?{crop:numericMap(v["crop"])}:{}),
    ...(numericMap(v["color"])?{color:numericMap(v["color"])}:{})};
}
function cleanOverlay(v:AnyRecord):AnyRecord {
  return {id:v["id"],text:v["text"],x:v["x"],y:v["y"],size:v["size"],start:v["start"],end:v["end"],
    color:typeof v["color"]==="string"&&v["color"].length<40?v["color"]:"#ffffff",
    bg:v["bg"]===true,font:typeof v["font"]==="string"&&v["font"].length<140?v["font"]:"sans-serif",
    subtitle:v["subtitle"]===true};
}
function cleanTransition(v:AnyRecord):AnyRecord {
  return {id:v["id"],track:v["track"],aId:v["aId"],bId:v["bId"],type:v["type"],dur:v["dur"]};
}
const booleans=(v:unknown):Record<string,boolean>=>{
  if(!plain(v))return {};
  return Object.fromEntries(Object.entries(v).filter(([key,val])=>/^[av][1-9]\d{0,2}$/.test(key)&&typeof val==="boolean").slice(0,128)) as Record<string,boolean>;
};
export function sanitizeEditorProject(value:unknown):RecoverableEditorProject {
  const v=plain(value)?value:{};
  return {
    items:(Array.isArray(v["items"])?v["items"]:[]).filter(validItem).slice(0,400).map(cleanItem),
    overlays:(Array.isArray(v["overlays"])?v["overlays"]:[]).filter(validOverlay).slice(0,250).map(cleanOverlay),
    transitions:(Array.isArray(v["transitions"])?v["transitions"]:[]).filter(validTransition).slice(0,200).map(cleanTransition),
    hidden:booleans(v["hidden"]), muted:booleans(v["muted"]),
  };
}
export function loadEditorProject():RecoverableEditorProject {
  try {
    const raw=localStorage.getItem(KEY);
    if(!raw||raw.length>MAX_BYTES)return sanitizeEditorProject(null);
    return sanitizeEditorProject(JSON.parse(raw));
  }catch{return sanitizeEditorProject(null);}
}
export function saveEditorProject<T extends {items:readonly object[];overlays:readonly object[];transitions:readonly object[];hidden:Record<string,boolean>;muted:Record<string,boolean>}>(project:T):boolean {
  try {
    const raw=JSON.stringify(sanitizeEditorProject(project));
    if(raw.length>MAX_BYTES)return false;
    localStorage.setItem(KEY,raw);
    return true;
  }catch{return false;}
}
