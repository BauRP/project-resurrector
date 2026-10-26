/** A deliberately limited but REAL multi-clip exporter: one video lane,
 * contiguous hard cuts, original per-clip audio, no transitions/overlap.
 * A single HTMLVideoElement/WebAudio source feeds one Canvas+MediaRecorder,
 * avoiding fake JSON manifests. Android WebView codec support still varies.
 */
import type { EditorExportConfig } from "./editor-render-bridge";
import { webmOutputSize, type SimpleOverlay, type SimpleVideoSegment } from "./editor-webm-render";

export interface SequentialPart {
  segment: SimpleVideoSegment;
  timelineStart: number;
  timelineEnd: number;
}
export interface SequentialRenderPlan {
  parts: SequentialPart[];
  overlays: SimpleOverlay[];
  duration: number;
}
export function planSequentialVideoRender(
  items: readonly (SimpleVideoSegment & {track:number})[],
  overlays: readonly SimpleOverlay[],
  transitions: number,
  muted:Record<string,boolean>, hidden:Record<string,boolean>,
): SequentialRenderPlan {
  if(items.length<2 || items.length>8 || transitions!==0)
    throw Error("Последовательный экспорт поддерживает 2–8 клипов без переходов.");
  const ordered=[...items].sort((a,b)=>a.start-b.start);
  if(ordered.some(x=>x.kind!=="video"||x.track!==ordered[0]!.track ||
      muted[`v${x.track}`]||hidden[`v${x.track}`]))
    throw Error("Для объединения нужна одна видимая видеодорожка без выключенного звука.");
  let expected=0;
  const parts:SequentialPart[]=[];
  for(const item of ordered) {
    if(!item.mediaId || !Number.isFinite(item.start) || !Number.isFinite(item.in) ||
       !Number.isFinite(item.out) || item.in<0 || item.out<=item.in ||
       item.reverse || item.speed!==1 || item.look!=="Без цвета" ||
       item.opacity!==100 || item.scale!==100 || item.posX!==0 ||
       item.crop!=null || (item.color!=null && Object.values(item.color).some(v=>v!==0)))
      throw Error("Склейка пока поддерживает только обычные клипы без индивидуальных эффектов, ускорения или обрезки кадра.");
    if(Math.abs(item.start-expected)>.08)
      throw Error("На таймлайне есть пропуск или наложение: простая склейка не изменяет монтаж.");
    const duration=item.out-item.in;
    if(duration<.25 || duration>120)
      throw Error("Недопустимая длина одного клипа.");
    parts.push({segment:item,timelineStart:expected,timelineEnd:expected+duration});
    expected+=duration;
  }
  if(expected>120)
    throw Error("Для этой локальной склейки максимум 120 секунд видео.");
  if(overlays.length>30 || overlays.some(o=>!Number.isFinite(o.start)||!Number.isFinite(o.end)||
     o.start<0||o.end<=o.start||o.end>expected+.15||o.text.length>1000))
    throw Error("Некорректные титры монтажного проекта.");
  return {parts,overlays:overlays.map(x=>({...x})),duration:expected};
}

/** Uses real video/audio decoders and the device WebM encoder. The pause between
 * clips prevents background loading/seek from becoming recorded black gaps.
 * This does NOT establish sample-accurate audio/video splice on any device.
 */
export async function renderSequentialVideoWebm(
  plan:SequentialRenderPlan, sources:readonly Blob[], config:EditorExportConfig,
  signal:AbortSignal, report:(percent:number)=>void,
):Promise<{blob:Blob;filename:string}> {
  const output=webmOutputSize(config);
  if(plan.parts.length!==sources.length || signal.aborted)
    throw Error("Неверная последовательность клипов или экспорт отменён.");
  const mime="video/webm;codecs=vp8,opus";
  if(typeof MediaRecorder==="undefined"||!MediaRecorder.isTypeSupported(mime)||
     typeof AudioContext==="undefined")
    throw Error("Устройство не поддерживает локальный WebM/Opus энкодер.");
  const video=document.createElement("video");
  video.playsInline=true;video.preload="auto";video.muted=false;
  video.style.cssText="position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none";
  const canvas=document.createElement("canvas");
  canvas.width=output.width;canvas.height=output.height;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx||typeof canvas.captureStream!=="function")
    throw Error("Кодирование из Canvas недоступно.");
  const urls:string[]=[];
  let audio:AudioContext|null=null, stream:MediaStream|null=null, recorder:MediaRecorder|null=null;
  let frame=0, watchdog:ReturnType<typeof setTimeout>|null=null;
  let stopped=false,completed=false,partIndex=0,switching=false;
  let rejectFinish:((reason:Error)=>void)|null=null;
  const stop=(reason:string)=>{
    if(stopped)return;
    stopped=true;
    rejectFinish?.(Error(reason));
    try { video.pause();if(recorder?.state!=="inactive")recorder?.stop(); }
    catch {/* cleanup in finally */}
  };
  const abort=()=>stop("Экспорт отменён или приложение закрыто.");
  const hidden=()=>{if(document.hidden)abort();};
  const bounded = async (task:Promise<unknown>,ms:number,message:string)=>{
    let timeout:ReturnType<typeof setTimeout>|null=null;
    try {
      await Promise.race([task,new Promise((_resolve,reject)=>{
        timeout=setTimeout(()=>reject(Error(message)),ms);
      })]);
      if(stopped||signal.aborted)throw Error("Экспорт отменён");
    } finally {if(timeout!==null)clearTimeout(timeout);}
  };
  const loadPart=async(index:number)=>{
    const current=plan.parts[index];
    if(!current)throw Error("Позиция склейки недоступна.");
    const nextUrl=urls[index];
    if(!nextUrl)throw Error("Исходный видеофайл отсутствует");
    video.pause();
    video.src=nextUrl;video.load();
    await bounded(new Promise<void>((resolve,reject)=>{
      video.onloadedmetadata=()=>resolve();
      video.onerror=()=>reject(Error("Невозможно декодировать клип "+(index+1)));
    }),6500,"Истекло время открытия клипа.");
    if(video.videoWidth<=0||video.videoHeight<=0 ||
       !Number.isFinite(video.duration) ||
       video.duration+.12<current.segment.out)
      throw Error("Сохранённый клип слишком короткий или не содержит декодируемого видео.");
    if(current.segment.in>.03){
      await bounded(new Promise<void>((resolve,reject)=>{
        video.onseeked=()=>resolve();
        video.onerror=()=>reject(Error("Ошибка перемотки клипа"));
        video.currentTime=current.segment.in;
      }),5500,"Клип не удалось перемотать.");
    }
    video.onloadedmetadata=null;video.onseeked=null;video.onerror=null;
  };
  const draw=()=>{
    if(stopped||completed||switching)return;
    const part=plan.parts[partIndex]!;
    const position=video.currentTime-part.segment.in;
    if(position>=part.timelineEnd-part.timelineStart-.025){
      if(partIndex===plan.parts.length-1){
        completed=true;
        try {recorder!.stop();}catch{stop("Не удалось завершить запись WebM");}
        return;
      }
      switching=true;
      void (async()=>{
        try {
          video.pause();
          if(recorder?.state==="recording")recorder.pause();
          partIndex++;
          await loadPart(partIndex);
          if(stopped)return;
          if(recorder?.state==="paused")recorder.resume();
          await bounded(video.play(),4500,"Следующий клип не запускается");
          switching=false;
          frame=requestAnimationFrame(draw);
        }catch(err){stop(err instanceof Error?err.message:"Ошибка соединения видеоклипов");}
      })();
      return;
    }
    const w=output.width,h=output.height;
    ctx.fillStyle="#000000";ctx.fillRect(0,0,w,h);
    const scale=Math.min(w/video.videoWidth,h/video.videoHeight);
    const dw=video.videoWidth*scale,dh=video.videoHeight*scale;
    ctx.drawImage(video,(w-dw)/2,(h-dh)/2,dw,dh);
    const timelineTime=part.timelineStart+Math.max(0,position);
    for(const overlay of plan.overlays){
      if(timelineTime<overlay.start||timelineTime>=overlay.end)continue;
      ctx.save();
      const size=Math.max(8,Math.min(70,overlay.size));
      const x=w*overlay.x/100,y=h*overlay.y/100;
      ctx.font=`bold ${size}px sans-serif`;ctx.textAlign="center";
      ctx.fillStyle=/^#[a-fA-F0-9]{6}$/.test(overlay.color)?overlay.color:"#ffffff";
      ctx.fillText(overlay.text.slice(0,160),x,y);ctx.restore();
    }
    report(Math.max(0,Math.min(95,Math.floor(timelineTime/plan.duration*95))));
    frame=requestAnimationFrame(draw);
  };
  signal.addEventListener("abort",abort,{once:true});
  document.addEventListener("visibilitychange",hidden);
  try {
    if(!document.body)throw Error("Рабочее окно редактора недоступно.");
    document.body.appendChild(video);
    for(const blob of sources){
      if(!blob||blob.size<1024||!blob.type.startsWith("video/"))
        throw Error("В монтажном проекте найден пустой или неподдерживаемый клип.");
      urls.push(URL.createObjectURL(blob));
    }
    await loadPart(0);
    audio=new AudioContext();
    const audioSource=audio.createMediaElementSource(video);
    const audioDest=audio.createMediaStreamDestination();
    audioSource.connect(audioDest);
    await bounded(audio.resume(),3500,"Аудиосистема недоступна.");
    stream=canvas.captureStream(30);
    for(const t of audioDest.stream.getAudioTracks())stream.addTrack(t);
    if(!stream.getAudioTracks().length||!stream.getVideoTracks().length)
      throw Error("Энкодер не создал аудио- и видеодорожки.");
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:output.bitrate});
    const blobs:Blob[]=[];
    const finished=new Promise<Blob>((resolve,reject)=>{
      rejectFinish=reject;
      recorder!.ondataavailable=e=>{if(e.data.size)blobs.push(e.data);};
      recorder!.onerror=()=>reject(Error("Ошибка MediaRecorder"));
      recorder!.onstop=()=>{
        if(stopped||!completed){reject(Error("Склейка не завершилась"));return;}
        const result=new Blob(blobs,{type:"video/webm"});
        result.size>=1024?resolve(result):reject(Error("Видеофайл получился пустым"));
      };
    });
    // Metadata is not proof of a decoded first frame. Never throw from
    // drawImage before the decoder delivers current video data.
    ctx.fillStyle="#000000";ctx.fillRect(0,0,output.width,output.height);
    if(video.readyState>=2)ctx.drawImage(video,0,0,output.width,output.height);
    video.onended=()=>{if(!switching&&!completed)
      stop("Клип завершился раньше выбранной точки склейки");};
    recorder.start(1000);
    await bounded(video.play(),4500,"Не удалось начать первый клип");
    frame=requestAnimationFrame(draw);
    watchdog=setTimeout(()=>stop("Локальная склейка превысила ограничение времени"),
      plan.duration*1700+30000);
    const blob=await finished;
    if(stopped||signal.aborted)throw Error("Склейка отменена");
    report(100);
    return {blob,filename:`multicam-joined-${Date.now()}.webm`};
  }finally{
    stopped=true;
    if(watchdog!==null)clearTimeout(watchdog);
    cancelAnimationFrame(frame);
    signal.removeEventListener("abort",abort);
    document.removeEventListener("visibilitychange",hidden);
    try{video.pause();if(recorder&&recorder.state!=="inactive")recorder.stop();}catch{/*cleanup*/}
    stream?.getTracks().forEach(t=>t.stop());
    video.onended=null;video.onloadedmetadata=null;video.onseeked=null;video.onerror=null;
    video.removeAttribute("src");video.load();video.remove();
    urls.forEach(url=>URL.revokeObjectURL(url));
    if(audio)void audio.close().catch(()=>undefined);
  }
}
