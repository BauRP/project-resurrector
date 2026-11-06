import type { EditorExportConfig } from "./editor-render-bridge";
/** Offline WebM video render of ONE source clip using the local Canvas/MediaRecorder
 * encoder and a real WebAudio track. Not a fake timer and not a full NLE.
 * Avoids silent loss of multi-layer video/audio, transitions and unsupported FX.
 */
export interface SimpleVideoSegment {
  kind: "video" | "audio"; mediaId: string; start: number; in: number; out: number;
  speed: number; reverse: boolean; opacity: number; scale: number; posX: number;
  look: string; crop?: {x:number;y:number;w:number;h:number}; color?: Partial<Record<string,number>>;
}
export interface SimpleOverlay {
  text:string; x:number; y:number; size:number; color:string; bg:boolean;
  font:string; start:number; end:number;
}
export interface SimpleRenderPlan {
  segment: SimpleVideoSegment;
  overlays: SimpleOverlay[];
  duration: number;
}
export function planSimpleVideoRender(
  items: readonly SimpleVideoSegment[], overlays: readonly SimpleOverlay[], transitions: number,
  muted:boolean, hidden:boolean,
): SimpleRenderPlan {
  const item=items[0];
  if(items.length!==1||!item||item.kind!=="video"||transitions!==0||muted||hidden)
    throw Error("WebM-рендер пока поддерживает одну видимую видеодорожку без переходов и отдельных аудиоклипов.");
  if(item.reverse||!Number.isFinite(item.speed)||item.speed<.25||item.speed>4)
    throw Error("Обратное воспроизведение или выбранная скорость не поддерживается WebM-рендером.");
  const duration=(item.out-item.in)/item.speed;
  if(![item.in,item.out,item.start,item.opacity,item.scale,item.posX].every(Number.isFinite)||
     item.start>.05||item.in<0||item.out<=item.in||duration<.2||duration>120||
     item.opacity<0||item.opacity>100||item.scale<1||item.scale>400)
    throw Error("Невозможно обработать выбранные границы клипа (лимит рендера 120 секунд).");
  if(item.color&&Object.values(item.color).some(v=>v!==0))
    throw Error("Точная цветокоррекция этого пресета пока не поддерживается в WebM-рендере.");
  if(item.crop&&!([item.crop.x,item.crop.y,item.crop.w,item.crop.h].every(Number.isFinite)&&
      item.crop.w>0&&item.crop.h>0&&item.crop.x>=0&&item.crop.y>=0&&
      item.crop.x+item.crop.w<=100.01&&item.crop.y+item.crop.h<=100.01))
    throw Error("Недопустимая область обрезки кадра.");
  if(overlays.length>30||overlays.some(v=>!Number.isFinite(v.start)||!Number.isFinite(v.end)||
      v.end<=v.start||!Number.isFinite(v.x)||!Number.isFinite(v.y)||!Number.isFinite(v.size)||
      v.text.length>1000))
    throw Error("Слишком много наложений или недопустимые параметры титров.");
  if(item.look!=="Без цвета"&&!["Тёплый","Холодный","Ч/Б","Кино","Яркий","LOG → Rec709"].includes(item.look))
    throw Error("Выбранный цветовой эффект не поддерживается WebM-рендером.");
  return {segment:item,overlays:overlays.map(x=>({...x})),duration};
}
/** Actual output canvas sizes; never pretend source dimensions satisfy a
 * user's requested aspect. Limit GPU memory across fold/resume transitions.
 */
export function webmOutputSize(config: EditorExportConfig): {width:number;height:number;bitrate:number} {
  if (config.videoCodec!=="VP8" || config.audioCodec!=="Opus" ||
      config.resolution!=="720p" || config.fps!=="30")
    throw Error("Поддерживается только WebM VP8 / Opus, 720p, 30 FPS.");
  const dims:Record<string,[number,number]>={
    "16:9":[1280,720],"9:16":[720,1280],"1:1":[720,720],"21:9":[1512,648],
  };
  const output=dims[config.aspect];
  if(!output)throw Error("Неизвестное соотношение сторон для видеорендера.");
  if(!Number.isFinite(config.bitrate) || config.bitrate<1.5 || config.bitrate>12)
    throw Error("Выберите битрейт 1.5–12 Мбит/с для WebM-рендера.");
  return {width:output[0],height:output[1],
    bitrate:Math.round(config.bitrate*1000000)};
}
const LOOK_FILTER:Record<string,string>={
  "Без цвета":"none","Тёплый":"sepia(.25) saturate(1.2)",
  "Холодный":"hue-rotate(190deg) saturate(.9)","Ч/Б":"grayscale(1) contrast(1.1)",
  "Кино":"contrast(1.15) saturate(.85) brightness(.95)",
  "Яркий":"saturate(1.5) contrast(1.05)",
  "LOG → Rec709":"contrast(1.35) saturate(1.3)",
};
const guarded=async(p:Promise<unknown>,millis:number,reason:string):Promise<void>=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {await Promise.race([p,new Promise((_ok,reject)=>{timer=setTimeout(()=>reject(Error(reason)),millis);})]);}
  finally {if(timer!==undefined)clearTimeout(timer);}
};
export async function renderSimpleVideoWebm(
  plan:SimpleRenderPlan, source:Blob, config:EditorExportConfig,
  signal:AbortSignal, progress:(n:number)=>void,
):Promise<{blob:Blob;filename:string}>{
  if(signal.aborted)throw Error("Экспорт отменён");
  const output=webmOutputSize(config);
  if(typeof MediaRecorder==="undefined"||typeof HTMLCanvasElement==="undefined"||
     !MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus"))
    throw Error("Устройство не поддерживает локальное кодирование WebM VP8/Opus.");
  if(typeof AudioContext==="undefined")
    throw Error("Устройство не поддерживает необходимый аудиомикшер.");
  const video=document.createElement("video");
  video.playsInline=true; video.preload="auto"; video.muted=false;
  video.style.cssText="position:fixed;left:-9999px;width:1px;height:1px;pointer-events:none";
  const url=URL.createObjectURL(source);video.src=url;
  let audio:AudioContext|null=null, recorder:MediaRecorder|null=null, stream:MediaStream|null=null;
  let raf=0, watchdog:ReturnType<typeof setTimeout>|undefined;
  let halted=false,ended=false;
  let failRender:((error:Error)=>void)|null=null;
  const terminate=(reason:string)=>{
    if(halted)return;
    halted=true;
    failRender?.(Error(reason));
    try{video.pause();if(recorder?.state!=="inactive")recorder?.stop();}
    catch{/* resources released in finally */}
  };
  const abort=()=>terminate("Экспорт отменён или приложение закрыто");
  signal.addEventListener("abort",abort,{once:true});
  const onHidden=()=>{if(document.hidden)abort();};
  document.addEventListener("visibilitychange",onHidden);
  try{
    if(!document.body)throw Error("Страница редактора недоступна");
    document.body.append(video);
    await guarded(new Promise<void>((resolve,reject)=>{
      video.onloadedmetadata=()=>resolve();
      video.onerror=()=>reject(Error("Не удалось открыть исходное видео"));
      video.load();
    }),5500,"Исходное видео не открылось");
    if(halted)throw Error("Экспорт прерван при открытии видео");
    if(!video.videoWidth||!video.videoHeight)throw Error("Видеодорожка не декодируется");
    if(plan.segment.out>video.duration+.12)throw Error("Монтаж выходит за пределы исходного файла");
    if(plan.segment.in>.05)
      await guarded(new Promise<void>((resolve,reject)=>{
        video.onseeked=()=>resolve();
        video.onerror=()=>reject(Error("Ошибка перемотки источника"));
        video.currentTime=plan.segment.in;
      }),4500,"Не удалось перемотать исходное видео");
    const w=output.width,h=output.height;
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx||typeof canvas.captureStream!=="function")throw Error("Canvas-энкодер не поддерживается");
    audio=new AudioContext();
    const src=audio.createMediaElementSource(video);
    const dest=audio.createMediaStreamDestination();
    src.connect(dest); // do not connect to speakers
    await guarded(audio.resume(),3500,"Аудиокодировщик не запущен");
    if(audio.state!=="running")throw Error("Аудиокодировщик недоступен");
    stream=canvas.captureStream(30);
    for(const track of dest.stream.getAudioTracks())stream.addTrack(track);
    if(!stream.getVideoTracks().length||!stream.getAudioTracks().length)
      throw Error("Не удалось создать видео- и звуковую дорожки");
    recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp8,opus",
      videoBitsPerSecond:output.bitrate});
    const pieces:Blob[]=[];
    const finished=new Promise<Blob>((resolve,reject)=>{
      failRender=reject;
      recorder!.ondataavailable=e=>{if(e.data.size)pieces.push(e.data);};
      recorder!.onerror=()=>reject(Error("Ошибка WebM-кодировщика"));
      recorder!.onstop=()=>{if(halted)reject(Error("Экспорт прерван"));
        else {const result=new Blob(pieces,{type:"video/webm"});
          result.size>=1024?resolve(result):reject(Error("WebM-кодировщик вернул пустой файл"));}};
    });
    const draw=()=>{
      if(halted||ended)return;
      const at=video.currentTime;
      const local=(at-plan.segment.in)/plan.segment.speed;
      if(at>=plan.segment.out-.02){ended=true;try{recorder!.stop();}catch{/* onerror */}return;}
      ctx.save();
      ctx.fillStyle="#000";ctx.fillRect(0,0,w,h);
      ctx.filter=LOOK_FILTER[plan.segment.look]??"none";
      ctx.globalAlpha=plan.segment.opacity/100;
      const crop=plan.segment.crop??{x:0,y:0,w:100,h:100};
      const sx=video.videoWidth*crop.x/100,sy=video.videoHeight*crop.y/100;
      const sw=video.videoWidth*crop.w/100,sh=video.videoHeight*crop.h/100;
      const zoom=plan.segment.scale/100;
      const fill=Math.max(w/sw,h/sh)*zoom;
      const dw=sw*fill,dh=sh*fill;
      ctx.drawImage(video,sx,sy,sw,sh,
        (w-dw)/2+plan.segment.posX/100*w,(h-dh)/2,dw,dh);
      ctx.restore();
      for(const overlay of plan.overlays){
        if(local<overlay.start||local>=overlay.end)continue;
        ctx.save();const size=Math.max(8,Math.min(70,overlay.size));
        ctx.font=`bold ${size}px sans-serif`;ctx.textAlign="center";
        const x=w*overlay.x/100,y=h*overlay.y/100;
        const lines=overlay.text.split("\n").slice(0,6);
        lines.forEach((line,i)=>{
          const top=y+i*size*1.25;
          if(overlay.bg){ctx.fillStyle="rgba(0,0,0,0.7)";
            const width=ctx.measureText(line).width;
            ctx.fillRect(x-width/2-6,top-size,width+12,size*1.25);}
          ctx.fillStyle=/^#[\da-fA-F]{6}$/.test(overlay.color)?overlay.color:"#ffffff";
          ctx.fillText(line.slice(0,160),x,top);
        });ctx.restore();
      }
      progress(Math.max(0,Math.min(95,Math.floor(local/plan.duration*95))));
      raf=requestAnimationFrame(draw);
    };
    video.onended=()=>{
      if(!ended)terminate("Исходное видео закончилось раньше заданного конца монтажа");
    };
    recorder.start(1000);
    if(halted)throw Error("Экспорт отменён");
    video.playbackRate=plan.segment.speed;
    await guarded(video.play(),4500,"WebView запретил воспроизведение для экспорта");
    raf=requestAnimationFrame(draw);
    watchdog=setTimeout(()=>terminate("Рендер превысил допустимое время и остановлен"),Math.ceil(plan.duration*1000*2+14000));
    const result=await finished;
    if(signal.aborted)throw Error("Экспорт отменён");
    progress(100);
    return {blob:result,filename:`multicam-render-${Date.now()}.webm`};
  }finally{
    halted=true;
    if(watchdog!==undefined)clearTimeout(watchdog);
    cancelAnimationFrame(raf);signal.removeEventListener("abort",abort);
    document.removeEventListener("visibilitychange",onHidden);
    try{if(recorder?.state!=="inactive")recorder?.stop();}catch{/* cleanup */}
    stream?.getTracks().forEach(t=>t.stop());
    video.pause();video.removeAttribute("src");video.load();video.remove();
    URL.revokeObjectURL(url);
    video.onended=null;
    if(audio)void audio.close().catch(()=>undefined);
  }
}
