import { nativeCapture as bridge, nativeRecorderOwnsCamera, type NativeCaptureStatus as Status } from "@/lib/native-capture";
import { useEffect, useState } from "react";
import { isNative, MultiCamNative, type NativeCameraProfile } from "@/lib/native";
import { Button } from "@/components/ui/button";

export function NativeRecordingPanel(){
 const [cameras,setCameras]=useState<NativeCameraProfile[]>([]);
 const [camera,setCamera]=useState("");
 const [resolution,setResolution]=useState("1920x1080");
 const [fps,setFps]=useState(30);
 const [audio,setAudio]=useState(true);
 const [status,setStatus]=useState<Status|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [preview,setPreview]=useState("");
 const refreshCameras=async()=>{
   try{
    const permissions=await bridge.requestPermissions({permissions:["camera"]});
    if(permissions["camera"]!=="granted")throw Error("Android не разрешил доступ к камере");
    const list=(await MultiCamNative.getCapabilities()).cameras;
    setCameras(list);setCamera(previous=>list.some(c=>c.cameraId===previous)?previous:list[0]?.cameraId??"");
    setError("");
   }catch(e){setError(String(e));}
 };
 useEffect(()=>{
  if(!isNative())return;
  let live=true;
  void MultiCamNative.getCapabilities().then(x=>{
   if(live){setCameras(x.cameras);setCamera(x.cameras[0]?.cameraId??"");}
  }).catch(e=>{if(live)setError(String(e));});
  const refresh=()=>void bridge.status().then(x=>{if(live){setStatus(x);if(nativeRecorderOwnsCamera(x.state)){if(x.cameraId)setCamera(x.cameraId);if(x.width&&x.height)setResolution(`${x.width}x${x.height}`);if(x.fps)setFps(x.fps);}}}).catch(()=>undefined);
  refresh();const timer=window.setInterval(refresh,1700);
  return ()=>{live=false;window.clearInterval(timer);};
 },[]);
 useEffect(()=>{
  if(!isNative())return;
  let live=true,inFlight=false;
  const read=async()=>{
    if(!live||inFlight)return;
    inFlight=true;
    try {
      const image=await bridge.previewFrame();
      if(live)setPreview(image.jpeg ? "data:image/jpeg;base64,"+image.jpeg : "");
    }catch{if(live)setPreview("");}
    finally{inFlight=false;}
  };
  void read();
  const timer=window.setInterval(()=>{void read();},600);
  return ()=>{live=false;window.clearInterval(timer);};
 },[]);
 if(!isNative())return null;
 const current=cameras.find(x=>x.cameraId===camera);
 const sizes=(current?.sizes??[]).filter((x:string)=>/^\d{3,4}x\d{3,4}$/.test(x)).slice(0,60);
 const start=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{
   const result=await bridge.requestPermissions({permissions:audio?["camera","microphone"]:["camera"]});
   if(result["camera"]!=="granted"||(audio&&result["microphone"]!=="granted"))
    throw Error("Android не предоставил разрешение на камеру/микрофон.");
   if(!window.confirm("Запустить отдельную нативную запись Camera2? Обычный предпросмотр WebView должен быть закрыт. Запись продолжается при пересоздании интерфейса, но не гарантирована при гибели процесса Android."))return;
   const [width = 0,height = 0]=resolution.split("x").map(Number);
   setStatus(await bridge.start({cameraId:camera,width,height,fps,audio}));
  }catch(e){setError(String(e));}
  finally{setBusy(false);}
 };
 const stop=async()=>{setBusy(true);try{setStatus(await bridge.stop());}catch(e){setError(String(e));}finally{setBusy(false);}};
 const changePause=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{setStatus(status?.state==="paused"?await bridge.resume():await bridge.pause());}
  catch(e){setError(String(e));}finally{setBusy(false);}
 };
 const active=nativeRecorderOwnsCamera(status?.state??"");
 return <section className="mt-4 space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
   <h3 className="font-semibold">Отдельная нативная запись Camera2</h3>
   <div className="relative mx-auto flex aspect-video w-full max-w-[740px] items-center justify-center overflow-hidden rounded-xl bg-black" role="img" aria-label="Предпросмотр нативной камеры">
    {preview ? <img src={preview} alt="Текущее изображение с Camera2" className="h-full w-full object-contain" style={{transform:status?.orientationDegrees===90?"rotate(90deg) scale(.5625)":status?.orientationDegrees===270?"rotate(270deg) scale(.5625)":status?.orientationDegrees===180?"rotate(180deg)":undefined}}/> :
      <p className="max-w-sm px-4 text-center text-sm text-white/80">{nativeRecorderOwnsCamera(status?.state??"") ?
        "Камера записывает MP4. Предпросмотр ожидает кадр либо не поддерживается этим устройством." :
        "Для предпросмотра начните нативную запись. Камера останется под управлением Android."}</p>}
    {nativeRecorderOwnsCamera(status?.state??"")&&<span className="absolute left-3 top-3 rounded bg-red-700 px-2 py-1 text-xs font-medium text-white">{status?.state==="paused"?"ПАУЗА":"REC"}</span>}
   </div>
   <p className="text-muted-foreground">Нативный Android-рекордер работает независимо от интерфейса. Запускайте через режим «Нативная запись» в разделе Камера; обычный предпросмотр должен быть закрыт. Видео сохраняется в «Фильмы / MULTI-CAM POV».</p>
   {!cameras.length&&<Button variant="outline" onClick={()=>void refreshCameras()}>Разрешить камеру и показать объективы</Button>}
   <div className="grid grid-cols-2 gap-2">
    <label>Камера<select className="w-full bg-background p-2" value={camera} disabled={active}
      onChange={e=>{setCamera(e.target.value);setResolution("1920x1080");}}>
       {cameras.map(x=><option key={x.cameraId} value={x.cameraId}>{x.cameraId} · {x.facing}</option>)}
     </select></label>
    <label>Разрешение<select className="w-full bg-background p-2" value={resolution} disabled={active}
      onChange={e=>setResolution(e.target.value)}>
       {(sizes.length?sizes:[resolution]).map(x=><option key={x} value={x}>{x}</option>)}
     </select></label>
    <label>FPS<select className="w-full bg-background p-2" value={fps} disabled={active}
     onChange={e=>setFps(Number(e.target.value))}>
      {[24,25,30,60].map(x=><option key={x} value={x}>{x}</option>)}
     </select></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={audio} disabled={active}
     onChange={e=>setAudio(e.target.checked)}/>Записать звук</label>
   </div>
   <p role="status">Состояние: {status?.state??"неизвестно"}. {status?.message??""} {status?.recordedDurationMs!==undefined&&`Время видеозаписи: ${Math.floor(status.recordedDurationMs/1000)} сек.`}</p>
   {status&&<p>Ориентация MP4: {status.orientationDegrees ?? "неизвестно"}°. Стабилизация: {status.stabilization} {status.stabilizationCaptureResultObserved?"(CaptureResult получен)":"(не подтверждена)"}. Записано: {status.savedBytes} байт</p>}
   {error&&<p role="alert" className="text-destructive">{error}</p>}
   <div className="flex gap-2">
    <Button disabled={busy||active||!camera} onClick={()=>void start()}>Начать нативную запись</Button>
    <Button disabled={busy||!["recording","paused"].includes(status?.state??"")} variant="outline" onClick={()=>void changePause()}>{status?.state==="paused"?"Продолжить":"Пауза"}</Button>
    <Button disabled={busy||!active} variant="outline" onClick={()=>void stop()}>Остановить</Button>
   </div>
 </section>;
}
