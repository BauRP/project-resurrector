import { registerPlugin } from "@capacitor/core";
import { useEffect, useState } from "react";
import { isNative, MultiCamNative, type NativeCameraProfile } from "@/lib/native";
import { Button } from "@/components/ui/button";

type Status = {state:string;message:string;startedAt:number;stabilization:string;
 stabilizationCaptureResultObserved:boolean;savedBytes:number;savedUri:string;videoOnly:boolean};
interface NativeCaptureBridge {
 start(options:{cameraId:string;width:number;height:number;fps:number;audio:boolean}):Promise<Status>;
 stop():Promise<Status>;
 status():Promise<Status>;
 requestPermissions(options?:{permissions:string[]}):Promise<Record<string,string>>;
}
const bridge=registerPlugin<NativeCaptureBridge>("NativeCapture");
export function NativeRecordingPanel(){
 const [cameras,setCameras]=useState<NativeCameraProfile[]>([]);
 const [camera,setCamera]=useState("");
 const [resolution,setResolution]=useState("1920x1080");
 const [fps,setFps]=useState(30);
 const [audio,setAudio]=useState(true);
 const [status,setStatus]=useState<Status|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!isNative())return;
  let live=true;
  void MultiCamNative.getCapabilities().then(x=>{
   if(live){setCameras(x.cameras);setCamera(x.cameras[0]?.cameraId??"");}
  }).catch(e=>{if(live)setError(String(e));});
  const refresh=()=>void bridge.status().then(x=>{if(live)setStatus(x);}).catch(()=>undefined);
  refresh();const timer=window.setInterval(refresh,1700);
  return ()=>{live=false;window.clearInterval(timer);};
 },[]);
 if(!isNative())return null;
 const current=cameras.find(x=>x.cameraId===camera);
 const sizes=(current?.sizes??[]).filter((x:string)=>/^\d{3,4}x\d{3,4}$/.test(x)).slice(0,60);
 const start=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{
   const result=await bridge.requestPermissions({permissions:audio?["camera","microphone"]:["camera"]});
   if(result.camera!=="granted"||(audio&&result.microphone!=="granted"))
    throw Error("Android не предоставил разрешение на камеру/микрофон.");
   if(!window.confirm("Запустить отдельную нативную запись Camera2? Обычный предпросмотр WebView должен быть закрыт. Запись продолжается при пересоздании интерфейса, но не гарантирована при гибели процесса Android."))return;
   const [width,height]=resolution.split("x").map(Number);
   setStatus(await bridge.start({cameraId:camera,width,height,fps,audio}));
  }catch(e){setError(String(e));}
  finally{setBusy(false);}
 };
 const stop=async()=>{setBusy(true);try{setStatus(await bridge.stop());}catch(e){setError(String(e));}finally{setBusy(false);}};
 const active=["starting","recording","stopping"].includes(status?.state??"");
 return <section className="mt-4 space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
   <h3 className="font-semibold">Отдельная нативная запись Camera2</h3>
   <p className="text-muted-foreground">Нативный Android-рекордер работает независимо от интерфейса. Для безопасного запуска откройте «Настройки» вместо активного предпросмотра камеры. Видео сохраняется в «Фильмы / MULTI-CAM POV».</p>
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
   <p role="status">Состояние: {status?.state??"неизвестно"}. {status?.message??""}</p>
   {status&&<p>Стабилизация: {status.stabilization} {status.stabilizationCaptureResultObserved?"(CaptureResult получен)":"(не подтверждена)"}. Записано: {status.savedBytes} байт</p>}
   {error&&<p role="alert" className="text-destructive">{error}</p>}
   <div className="flex gap-2">
    <Button disabled={busy||active||!camera} onClick={()=>void start()}>Начать нативную запись</Button>
    <Button disabled={busy||!active} variant="outline" onClick={()=>void stop()}>Остановить</Button>
   </div>
 </section>;
}
