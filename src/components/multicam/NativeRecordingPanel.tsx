import { previewTapPoint } from "@/lib/native-preview-coordinate";
import { isFreshNativeFrame } from "@/lib/native-preview-freshness";
import { validNativeSelection } from "@/lib/native-mode-selection";
import { nativeCapture as bridge, nativeRecorderOwnsCamera, type NativeCaptureStatus as Status } from "@/lib/native-capture";
import { useEffect, useState, type MouseEvent } from "react";
import { isNative, MultiCamNative, type NativeCameraProfile } from "@/lib/native";
import { Button } from "@/components/ui/button";

export function NativeRecordingPanel(){
 const [cameras,setCameras]=useState<NativeCameraProfile[]>([]);
 const [camera,setCamera]=useState(()=>{
   try{return localStorage.getItem("multicam-native-last-camera-v1")??"";}catch{return "";}
 });
 const [resolution,setResolution]=useState(()=>{
   try{const saved=localStorage.getItem("multicam-native-last-size-v1");
     return saved && /^\d{3,4}x\d{3,4}$/.test(saved) ? saved : "1920x1080";
   }catch{return "1920x1080";}
 });
 const [fps,setFps]=useState(()=>{
   try{const n=Number(localStorage.getItem("multicam-native-last-fps-v1"));
     return [24,25,30,60].includes(n)?n:30;
   }catch{return 30;}
 });
 const [audio,setAudio]=useState(true);
 // Save UI choices only, never recorder ownership or a fictitious resumed
 // recording. A persisted lens must match current Camera2 enumeration.
 useEffect(()=>{
   if(!camera)return;
   try{localStorage.setItem("multicam-native-last-camera-v1",camera);}catch{}
 },[camera]);
 useEffect(()=>{
   try{localStorage.setItem("multicam-native-last-size-v1",resolution);
     localStorage.setItem("multicam-native-last-fps-v1",String(fps));}catch{}
 },[resolution,fps]);
 const [status,setStatus]=useState<Status|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 // Keep the interface responsive to hardware reconnects while never dropping
 // the selected camera or interrupting an active Android recording session.
 const [preview,setPreview]=useState("");
 const tapPreview=async(e:MouseEvent<HTMLImageElement>)=>{
  if(!status?.tapAfSupported&&!status?.tapAeSupported)return;
  const image=e.currentTarget;
  const point=previewTapPoint(e.clientX,e.clientY,image.getBoundingClientRect(),
    image.naturalWidth,image.naturalHeight);
  if(!point)return;
  try{setStatus(await bridge.tapToMeter(point));setError("");}
  catch(error){setError(String(error));}
 };
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
   if(live){setCameras(x.cameras);setCamera(previous=>
     x.cameras.some(camera=>camera.cameraId===previous)?previous:x.cameras[0]?.cameraId??"");}
  }).catch(e=>{if(live)setError(String(e));});
  const refresh=()=>void bridge.status().then(x=>{if(live){setStatus(x);if(nativeRecorderOwnsCamera(x.state)){if(x.cameraId)setCamera(x.cameraId);if(x.width&&x.height)setResolution(`${x.width}x${x.height}`);if(x.fps)setFps(x.fps);}}}).catch(()=>undefined);
  refresh();const timer=window.setInterval(refresh,1700);
  return ()=>{live=false;window.clearInterval(timer);};
 },[]);
 useEffect(()=>{
  if(!isNative())return;
  let live=true;
  const availabilityOwner="native-availability-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
  let listener: {remove:()=>Promise<void>}|undefined;
  let token=0;
  const refresh=async()=>{
    const current=++token;
    try{
      const result=await MultiCamNative.getCapabilities();
      if(!live||current!==token)return;
      setCameras(result.cameras);
      // A camera that vanished must not be substituted while Android records.
      // The service itself remains authoritative about active recording.
      const capture=await bridge.status().catch(()=>null);
      if(!live||current!==token)return;
      if(capture&&nativeRecorderOwnsCamera(capture.state))return;
      setCamera(previous=>result.cameras.some(c=>c.cameraId===previous)
        ?previous:result.cameras[0]?.cameraId??"");
    }catch{ /* Missing native availability is unknown, not zero cameras. */ }
  };
  const onVisibility=()=>{if(!document.hidden)void refresh();};
  document.addEventListener("visibilitychange",onVisibility);
  void MultiCamNative.addListener("cameraAvailabilityChanged",()=>void refresh()).then(handle=>{
    if(!live)void handle.remove();else listener=handle;
  }).catch(()=>undefined);
  void MultiCamNative.startCameraAvailability({ownerId:availabilityOwner}).then(()=>{
    // An old Activity can unmount while the Android registration is pending.
    // Never keep its observer lease after its new Activity takes over.
    if(!live)void MultiCamNative.stopCameraAvailability({ownerId:availabilityOwner}).catch(()=>undefined);
  }).catch(()=>undefined);
  return ()=>{
    live=false;token++;
    document.removeEventListener("visibilitychange",onVisibility);
    void listener?.remove();
    void MultiCamNative.stopCameraAvailability({ownerId:availabilityOwner}).catch(()=>undefined);
  };
 },[]);
 useEffect(()=>{
  if(!isNative())return;
  let live=true,inFlight=false,visible=!document.hidden,latestFrameAt=0;
  // Each mounted viewer owns its Android preview lease. A late cleanup from
  // an old fold/Activity view cannot hide the new viewer.
  const ownerId="native-preview-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
  const setVisible=(value:boolean)=>{
    void bridge.setPreviewVisible({visible:value,ownerId}).catch(()=>undefined);
  };
  const read=async()=>{
    if(!live||!visible||inFlight)return;
    inFlight=true;
    try {
      const frame=await bridge.previewFrame();
      if(!live||!visible)return;
      if(!frame.jpeg){
        latestFrameAt=0;
        setPreview(previous=>previous ? "" : previous);
      }else if(isFreshNativeFrame(frame,latestFrameAt)){
        latestFrameAt=typeof frame.frameAt==="number"&&frame.frameAt>0 ? frame.frameAt : 0;
        setPreview("data:image/jpeg;base64,"+frame.jpeg);
      }
    }catch{
      // Keep the last valid frame for transient native bridge failures.
      // Missing/stopped camera frames are cleared by the empty response.
    }finally{inFlight=false;}
  };
  const onVisibility=()=>{
    visible=!document.hidden;
    setVisible(visible);
    if(visible)void read();
    else{latestFrameAt=0;setPreview(previous=>previous ? "" : previous);}
  };
  document.addEventListener("visibilitychange",onVisibility);
  setVisible(visible);
  if(visible)void read();
  // Bounded JPEG transport, not a 30/60 FPS native SurfaceView.
  const timer=window.setInterval(()=>{void read();},250);
  return ()=>{
    live=false;window.clearInterval(timer);
    document.removeEventListener("visibilitychange",onVisibility);
    setVisible(false);
  };
 },[]);
 if(!isNative())return null;
 const current=cameras.find(x=>x.cameraId===camera);
 const sizes=(current?.sizes??[]).filter((x:string)=>/^\d{3,4}x\d{3,4}$/.test(x)).slice(0,60);
 const mode=validNativeSelection(current,resolution,fps);
 const availableFps=mode.choices;
 const openPreview=async()=>{
  if(busy || !camera)return;
  setBusy(true);setError("");
  try{
   const permission=await bridge.requestPermissions({permissions:["camera"]});
   if(permission["camera"]!=="granted")throw Error("Предоставьте доступ к камере Android");
   setStatus(await bridge.startPreview({cameraId:camera}));
  }catch(e){setError(String(e));}finally{setBusy(false);}
 };
 const start=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{
   const result=await bridge.requestPermissions({permissions:audio?["camera","microphone"]:["camera"]});
   if(result["camera"]!=="granted"||(audio&&result["microphone"]!=="granted"))
    throw Error("Android не предоставил разрешение на камеру/микрофон.");
   if(!window.confirm("Запустить отдельную нативную запись Camera2? Обычный предпросмотр WebView должен быть закрыт. Запись продолжается при пересоздании интерфейса, но не гарантирована при гибели процесса Android."))return;
   const [width = 0,height = 0]=resolution.split("x").map(Number);
   if(!sizes.includes(resolution))throw Error("Это разрешение не объявлено выбранной камерой.");
   if(mode.size!==resolution||!mode.choices.includes(fps))throw Error("Разрешение и FPS не совместимы по опубликованным ограничениям Camera2. Выберите доступную комбинацию.");
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
 const adjust=async(zoom:number,exposureIndex:number)=>{
  if(busy)return;
  try{setStatus(await bridge.setControls({zoom,exposureIndex}));setError("");}
  catch(e){setError(String(e));}
 };
 const focus=async(manual:boolean,diopters:number)=>{
  if(busy)return;
  try{setStatus(await bridge.setFocus({manual,diopters}));setError("");}
  catch(e){setError(String(e));}
 };
 const active=nativeRecorderOwnsCamera(status?.state??"");
 return <section className="mt-4 space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
   <h3 className="font-semibold">Отдельная нативная запись Camera2</h3>
   <div className="relative mx-auto flex aspect-video w-full max-w-[740px] items-center justify-center overflow-hidden rounded-xl bg-black" role="img" aria-label="Предпросмотр нативной камеры">
    {preview ? <img src={preview} alt="Текущее изображение с Camera2" className="h-full w-full object-contain" onClick={e=>void tapPreview(e)} style={{cursor:status?.tapAfSupported||status?.tapAeSupported?"crosshair":"default"}} /> :
      <p className="max-w-sm px-4 text-center text-sm text-white/80">{nativeRecorderOwnsCamera(status?.state??"") ?
        "Камера записывает MP4. Предпросмотр ожидает кадр либо не поддерживается этим устройством." :
        "Нажмите «Открыть видоискатель». Запись MP4 начнётся только после отдельного нажатия кнопки записи."}</p>}
    {nativeRecorderOwnsCamera(status?.state??"")&&<span className="absolute left-3 top-3 rounded bg-red-700 px-2 py-1 text-xs font-medium text-white">{status?.state==="paused"?"ПАУЗА":"REC"}</span>}
   </div>
   {(status?.tapAfSupported||status?.tapAeSupported)&&<p className="text-muted-foreground">Коснитесь изображения, чтобы выбрать точку {status.tapAfSupported?"автофокуса и ":""}экспозамера. Чёрные поля неактивны. Подтверждение команды не означает успешное наведение.</p>}
   <p className="text-muted-foreground">Нативный Android-рекордер работает независимо от интерфейса. Запускайте через режим «Нативная запись» в разделе Камера; обычный предпросмотр должен быть закрыт. Видео сохраняется в «Фильмы / MULTI-CAM POV».</p>
   {!cameras.length&&<Button variant="outline" onClick={()=>void refreshCameras()}>Разрешить камеру и показать объективы</Button>}
   <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,14rem),1fr))"}}>
    <label>Камера<select className="w-full bg-background p-2" value={camera} disabled={active}
      onChange={e=>{const next=e.target.value;const selected=validNativeSelection(cameras.find(x=>x.cameraId===next),resolution,fps);setCamera(next);setResolution(selected.size);setFps(selected.fps);}}>
       {cameras.map(x=><option key={x.cameraId} value={x.cameraId}>{x.cameraId} · {x.facing}</option>)}
     </select></label>
    <label>Разрешение<select className="w-full bg-background p-2" value={resolution} disabled={active}
      onChange={e=>{const next=e.target.value;const selected=validNativeSelection(current,next,fps);setResolution(selected.size);setFps(selected.fps);}}>
       {(sizes.length?sizes:[resolution]).map(x=><option key={x} value={x}>{x}</option>)}
     </select></label>
    <label>FPS<select className="w-full bg-background p-2" value={availableFps.includes(fps)?fps:0} disabled={active||!availableFps.length}
     onChange={e=>setFps(Number(e.target.value))}>
      {!availableFps.includes(fps)&&<option value={0}>Выберите поддерживаемый FPS</option>}
      {availableFps.map(x=><option key={x} value={x}>{x}</option>)}
     </select></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={audio} disabled={active}
     onChange={e=>setAudio(e.target.checked)}/>Записать звук</label>
   </div>
   <p role="status">Состояние: {status?.state??"неизвестно"}. {status?.message??""} {status?.recordedDurationMs!==undefined&&`Время видеозаписи: ${Math.floor(status.recordedDurationMs/1000)} сек.`}</p>
   {status&&<p>Ориентация MP4: {status.orientationDegrees ?? "неизвестно"}°. Стабилизация: {status.stabilization} {status.stabilizationCaptureResultObserved?"(CaptureResult получен)":"(не подтверждена)"}. Записано: {status.savedBytes} байт</p>}
   {active&&status&&<div className="grid gap-3 rounded-lg border border-border p-2" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,14rem),1fr))"}}>
      <label className="space-y-1">Увеличение: {(status.zoom??1).toFixed(1)}×
        <input type="range" className="w-full" min={1} max={Math.max(1,status.maxZoom??1)}
          step={0.1} value={status.zoom??1}
          onChange={e=>void adjust(Number(e.target.value),status.exposureIndex??0)}/>
      </label>
      <label className="space-y-1">Экспозиция: {((status.exposureIndex??0)*(status.exposureStep??0)).toFixed(1)} EV
        <input type="range" className="w-full" min={status.exposureMin??0}
          max={status.exposureMax??0} step={1} value={status.exposureIndex??0}
          onChange={e=>void adjust(status.zoom??1,Number(e.target.value))}/>
      </label>
   </div>}
   {active&&status&&(status.manualFocusSupported||status.autoFocusSupported)&&
      <div className="space-y-2 rounded-lg border border-border p-2">
        <p className="font-medium">Фокусировка Camera2</p>
        <div className="flex flex-wrap gap-2">
         {status.autoFocusSupported&&<Button size="sm" variant={status.focusMode==="manual"?"outline":"default"}
           onClick={()=>void focus(false,0)}>Автофокус</Button>}
         {status.manualFocusSupported&&<Button size="sm" variant={status.focusMode==="manual"?"default":"outline"}
           onClick={()=>void focus(true,status.focusDiopters??0)}>Ручной фокус</Button>}
        </div>
        {status.manualFocusSupported&&status.focusMode==="manual"&&<label className="block space-y-1">
         Расстояние фокуса: {(status.focusDiopters??0).toFixed(2)} диоптрии
         <input type="range" className="w-full" min={0} max={status.maxFocusDiopters??0}
          step={0.05} value={status.focusDiopters??0}
          onChange={e=>void focus(true,Number(e.target.value))}/>
        </label>}
        <p className="text-muted-foreground">
         {status.reportedFocusDiopters!==undefined&&status.reportedFocusDiopters>=0
           ? `Camera2 сообщает: ${status.reportedFocusDiopters.toFixed(2)} дптр.`
           : "Фактическое положение объектива пока не подтверждено системой."}
        </p>
      </div>}
   {active&&status?.torchAvailable&&<Button variant="outline" className="w-full"
     onClick={()=>void bridge.setTorch({enabled:!status.torchEnabled}).then(setStatus).catch(e=>setError(String(e)))}>
      {status.torchEnabled?"Выключить фонарик":"Включить фонарик"}
    </Button>}
   {error&&<p role="alert" className="text-destructive">{error}</p>}
   <div className="flex flex-wrap gap-2">
    <Button variant="outline" disabled={busy||active||!camera} onClick={()=>void openPreview()}>Открыть видоискатель</Button>
    <Button disabled={busy||!camera||!mode.size||!mode.choices.includes(fps)||(active && status?.state!=="previewing")} onClick={()=>void start()}>Начать нативную запись</Button>
    <Button disabled={busy||!["recording","paused"].includes(status?.state??"")} variant="outline" onClick={()=>void changePause()}>{status?.state==="paused"?"Продолжить":"Пауза"}</Button>
    <Button disabled={busy||!active} variant="outline" onClick={()=>void stop()}>{status?.state==="previewing"?"Закрыть камеру":"Остановить"}</Button>
   </div>
 </section>;
}
