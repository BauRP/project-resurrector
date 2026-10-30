import { previewTapPoint } from "@/lib/native-preview-coordinate";
import { nativePreviewPlacement, nativePreviewSnapshot, samePreviewPlacement, foldPreviewTopologySignature, type PreviewRect } from "@/lib/native-preview-placement";
import { getActiveFoldBaseline } from "@/lib/fold-recording-evidence";
import { createSerializedAsyncActions } from "@/lib/serialized-preview-operations";
import { isFreshNativeFrame } from "@/lib/native-preview-freshness";
import { validNativeSelection, declaredAvcRecordingSupport } from "@/lib/native-mode-selection";
import { nativeRecordedModeEvidence } from "@/lib/native-recorded-mode-evidence";
import { recordModeEvidence } from "@/lib/camera-passport";
import { nativeAnonymizedAuditReport } from "@/lib/native-audit-report";
import { nativeCapture as bridge, nativeRecorderOwnsCamera, type NativeCaptureStatus as Status } from "@/lib/native-capture";
import { useEffect, useRef, useState, type MouseEvent } from "react";
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
 const [encoderSupport,setEncoderSupport]=useState<"declared"|"unsupported"|"unknown">("unknown");
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
 const savedModeKey=useRef("");
 useEffect(()=>{
   if(!status||!["saved","saved_interrupted","interrupted","error"].includes(status.state))return;
   const evidence=nativeRecordedModeEvidence(status,Date.now());
   if(!evidence)return;
   // Polling must not repeatedly overwrite the same camera passport entry.
   // Include recording start and saved size so a subsequent new MP4 is fresh.
   const key=[status.cameraId,status.startedAt,status.savedBytes,status.state].join("|");
   if(savedModeKey.current===key)return;
   savedModeKey.current=key;
   recordModeEvidence(evidence);
 },[status]);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [auditHistory,setAuditHistory]=useState<{entries:Array<Record<string,unknown>>;omittedEarlier:number;maxEntries:number}|null>(null);
 const [auditError,setAuditError]=useState("");
 const readAudit=async()=>{
   try{const result=await bridge.auditHistory();setAuditHistory(result);setAuditError("");}
   catch(error){setAuditError("Не удалось прочитать журнал: "+String(error));}
 };
 // Keep the interface responsive to hardware reconnects while never dropping
 // the selected camera or interrupting an active Android recording session.
 const [preview,setPreview]=useState("");
 const [directEnabled,setDirectEnabled]=useState(()=>{
   try{return localStorage.getItem("multicam-native-direct-preview-v1")==="yes";}
   catch{return false;}
 });
 useEffect(()=>{
   try{localStorage.setItem("multicam-native-direct-preview-v1",directEnabled?"yes":"no");}catch{}
 },[directEnabled]);
 const [directNotice,setDirectNotice]=useState("");
 const directTarget=useRef<HTMLDivElement|null>(null);
 const directLease=useRef("native-direct-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));
 useEffect(()=>{
   if(!directEnabled||!isNative())return;
   let live=true;
   const ownerId=directLease.current;
   let lastPosition:PreviewRect|null=null;
   let lastViewport:{width:number;height:number}|null=null;
   let lastVisible=false;
   let foldEpoch=0,lastShownFoldEpoch=-1;
   let foldSignature=foldPreviewTopologySignature(getActiveFoldBaseline());
   // Keep errors visible to callers without poisoning later cleanup.
   const enqueue=createSerializedAsyncActions();
   const hide=()=>enqueue(async()=>{
     if(!lastVisible)return;
     lastVisible=false;lastPosition=null;lastViewport=null;lastShownFoldEpoch=-1;
     await bridge.setDirectPreview({ownerId,visible:false}).catch(()=>undefined);
   });
   const measure=()=>nativePreviewSnapshot(
     directTarget.current?.getBoundingClientRect(),
     {width:document.documentElement.clientWidth,height:window.innerHeight},
     getActiveFoldBaseline()?.regionGeometry);
   const sync=async()=>{
     if(!live)return;
     // Do not use a cached WindowManager/CSS viewport after a fold.
     if(document.hidden||!measure()){await hide();return;}
     try {
       await enqueue(async()=>{
         if(!live)return;
         // The async queue may run after several folds. Take the real CURRENT
         // geometry and both scaling axes at command submission time.
         const latest=document.hidden?null:measure();
         if(!latest){
           lastVisible=false;lastPosition=null;lastViewport=null;lastShownFoldEpoch=-1;
           await bridge.setDirectPreview({ownerId,visible:false}).catch(()=>undefined);
           return;
         }
         const {placement,viewport}=latest;
         const submittedFoldEpoch=foldEpoch;
         if(lastVisible&&lastShownFoldEpoch===submittedFoldEpoch&&
            samePreviewPlacement(placement,lastPosition)&&
            lastViewport?.width===viewport.width&&lastViewport?.height===viewport.height)return;
         // A real fold may have caused Android to detach its TextureView even
         // if the DOM box did not move. Re-submit only for a changed topology.
         await bridge.setDirectPreview({ownerId,visible:true,...placement,
           viewportWidth:viewport.width,viewportHeight:viewport.height});
         lastVisible=true;lastPosition=placement;lastViewport=viewport;
         lastShownFoldEpoch=submittedFoldEpoch;
       });
       if(!live)return;
       setDirectNotice("Поверхность подготовлена. Откройте видоискатель.");
     }catch{
       if(live){setDirectNotice("Прямой вывод недоступен; используйте JPEG.");setDirectEnabled(false);}
     }
   };
   const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>void sync()):null;
   if(directTarget.current)observer?.observe(directTarget.current);
   const resized=()=>void sync();
   const visibility=()=>void sync();
   const scrolling=()=>void sync();
   // Native Android can detach the TextureView when a hinge moves while the
   // CSS rectangle appears unchanged. Invalidate our lastVisible cache so
   // returning to a safe pane restores the preview without touching recording.
   // Native WindowManager already hides an overlay that physically crosses
   // a hinge. Here a geometry recheck is enough: identical callbacks must
   // not detach and recreate a perfectly safe Android TextureView.
   const folding=()=>{
     const next=foldPreviewTopologySignature(getActiveFoldBaseline());
     if(next!==foldSignature){foldSignature=next;foldEpoch++;}
     void sync();
   };
   window.addEventListener("resize",resized);
   window.addEventListener("scroll",scrolling,true);
   window.addEventListener("multicam-fold-topology",folding);
   document.addEventListener("visibilitychange",visibility);
   void sync();
   return ()=>{live=false;observer?.disconnect();window.removeEventListener("resize",resized);
     window.removeEventListener("scroll",scrolling,true);
     window.removeEventListener("multicam-fold-topology",folding);
     document.removeEventListener("visibilitychange",visibility);
     // Always queue a final hide, even when the first show is pending.
     void enqueue(async()=>{
       lastVisible=false;lastPosition=null;lastViewport=null;lastShownFoldEpoch=-1;
       await bridge.setDirectPreview({ownerId,visible:false}).catch(()=>undefined);
     });};
 },[directEnabled]);
 const tapDirect=async(e:MouseEvent<HTMLDivElement>)=>{
   if(!directEnabled||!status?.directPreviewActive||
      (!status.tapAfSupported&&!status.tapAeSupported))return;
   const rect=e.currentTarget.getBoundingClientRect();
   const x=(e.clientX-rect.left)/rect.width;
   const y=(e.clientY-rect.top)/rect.height;
   if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)return;
   try{setStatus(await bridge.tapToMeter({x,y}));setError("");}
   catch(error){setError(String(error));}
 };
 // A real camera metering action reachable with TalkBack, keyboard and on
 // narrow foldable panes where a precise tap in the preview is inaccessible.
 // Submitting the request is not proof that the physical lens has focused.
 const meterCenter=async()=>{
   if(busy || !status || !["previewing","recording","paused"].includes(status.state) ||
      (!status.tapAfSupported&&!status.tapAeSupported))return;
   try{
     setStatus(await bridge.tapToMeter({x:0.5,y:0.5}));
     setError("");
   }catch(error){setError(String(error));}
 };
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
 const current=cameras.find(x=>x.cameraId===camera);
 const sizes=(current?.sizes??[]).filter((x:string)=>/^\d{3,4}x\d{3,4}$/.test(x)).slice(0,60);
 const mode=validNativeSelection(current,resolution,fps);
 const availableFps=mode.choices;
 useEffect(()=>{
   if(!isNative()||!camera||!resolution||!fps){setEncoderSupport("unknown");return;}
   const [width,height]=resolution.split("x").map(Number);
   if(!width||!height){setEncoderSupport("unknown");return;}
   let active=true;
   setEncoderSupport("unknown");
   void MultiCamNative.getEncoderSupport({width,height,fps}).then(result=>{
     if(active)setEncoderSupport(declaredAvcRecordingSupport(result.encoders));
   }).catch(()=>{if(active)setEncoderSupport("unknown");});
   return ()=>{active=false;};
 },[camera,resolution,fps]);
 // The restored UI mode may belong to an old lens. Offer the real
 // compatible fallback explicitly, never silently change capture settings.
 // All hooks must execute unconditionally, including in WebView-only builds.
 const canRestoreMode=!!mode.size && (mode.size!==resolution||mode.fps!==fps);
 const applyCompatibleMode=()=>{
   if(busy||nativeRecorderOwnsCamera(status?.state??""))return;
   setResolution(mode.size);
   setFps(mode.fps);
 };
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
   if(result["camera"]!=="granted")
    throw Error("Android не предоставил разрешение на камеру.");
   // Microphone denial must not block a genuine Camera2 video-only recording.
   // Require an explicit choice; never silently imply a soundtrack exists.
   const recordAudio=audio && result["microphone"]==="granted";
   if(audio&&!recordAudio){
     if(!window.confirm("Микрофон недоступен. Записать настоящее видео без звука?"))return;
     setAudio(false);
   }
   if(!window.confirm("Запустить отдельную нативную запись Camera2? Обычный предпросмотр WebView должен быть закрыт. Запись продолжается при пересоздании интерфейса, но не гарантирована при гибели процесса Android."))return;
   if(directEnabled){
     await bridge.setDirectPreview({ownerId:directLease.current,visible:false}).catch(()=>undefined);
     setDirectEnabled(false);
   }
   const [width = 0,height = 0]=resolution.split("x").map(Number);
   if(!sizes.includes(resolution))throw Error("Это разрешение не объявлено выбранной камерой.");
   if(mode.size!==resolution||!mode.choices.includes(fps))throw Error("Разрешение и FPS не совместимы по опубликованным ограничениям Camera2. Выберите доступную комбинацию.");
   if(encoderSupport==="unsupported")throw Error("H.264-кодировщик не объявляет поддержку выбранного разрешения/FPS.");
   setStatus(await bridge.start({cameraId:camera,width,height,fps,audio:recordAudio}));
  }catch(e){setError(String(e));}
  finally{setBusy(false);}
 };
 const stop=async()=>{setBusy(true);try{setStatus(await bridge.stop());}catch(e){setError(String(e));}finally{setBusy(false);}};
 const retryGallery=async()=>{
   if(busy)return;
   setBusy(true);setError("");
   try{setStatus(await bridge.retryGalleryPublication());}
   catch(e){setError(String(e));}
   finally{setBusy(false);}
 };
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
 if(!isNative())return null;
 return <section className="mt-4 space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
   <h3 className="font-semibold">Отдельная нативная запись Camera2</h3>
   <p role="status">H.264-кодировщик: {encoderSupport==="declared"
     ?"комбинация разрешения/FPS заявлена (требуется пробная запись)"
     :encoderSupport==="unsupported"
     ?"выбранная комбинация явно не поддерживается"
     :"поддержка не подтверждена; окончательная проверка при старте записи"}.</p>
   <div ref={directTarget} onClick={e=>void tapDirect(e)} className="relative mx-auto flex aspect-video w-full max-w-[740px] items-center justify-center overflow-hidden rounded-xl bg-black" role="img" aria-label="Предпросмотр нативной камеры">
    {directEnabled ? <p className="px-3 text-center text-white/80">Прямой Android-видоискатель. Если кадр не появился, выключите этот режим.</p> :
     preview ? <img src={preview} alt="Текущее изображение с Camera2" className="h-full w-full object-contain" onClick={e=>void tapPreview(e)} style={{cursor:status?.tapAfSupported||status?.tapAeSupported?"crosshair":"default"}} /> :
      <p className="max-w-sm px-4 text-center text-sm text-white/80">{nativeRecorderOwnsCamera(status?.state??"") ?
        "Камера записывает MP4. Предпросмотр ожидает кадр либо не поддерживается этим устройством." :
        "Нажмите «Открыть видоискатель». Запись MP4 начнётся только после отдельного нажатия кнопки записи."}</p>}
    {["recording","paused"].includes(status?.state??"")&&<span className="absolute left-3 top-3 rounded bg-red-700 px-2 py-1 text-xs font-medium text-white">{status?.state==="paused"?"ПАУЗА":"REC"}</span>}
   </div>
   <label className="flex items-center gap-2"><input type="checkbox" checked={directEnabled}
     disabled={busy||["recording","paused","starting","stopping"].includes(status?.state??"")}
     onChange={e=>{setDirectEnabled(e.target.checked);setDirectNotice("");}}/>
     Экспериментальный прямой видоискатель Android (до записи)
   </label>
   {directNotice&&<p role="status">{directNotice}</p>}
   {status&&nativeRecorderOwnsCamera(status.state)&&
     <p role="status">Сенсор Camera2: {status.cameraSensorFrames??0} подтверждённых кадров,
       {status.cameraSensorFps!==undefined&&status.cameraSensorFps>0
         ?` оценка частоты сенсора ${status.cameraSensorFps.toFixed(1)} FPS.`
         :" частота пока неизвестна."}
       Это измерение сенсора, не FPS готового MP4.
     </p>}
   {directEnabled&&status?.state==="previewing"&&
     <p role="status">{status.directPreviewActive
       ?"Camera2 передаёт изображение напрямую в Android TextureView. Реальная частота кадров пока не измерена."
       :"Прямой вывод не подтверждён: Camera2 использует запасной режим или ожидает поверхность."}</p>}
   {(status?.tapAfSupported||status?.tapAeSupported)&&
     <Button type="button" variant="outline" disabled={busy||
       !["previewing","recording","paused"].includes(status?.state??"")}
       aria-label="Фокусировка и замер экспозиции в центре изображения"
       onClick={()=>void meterCenter()}>
       Фокус и экспозиция по центру кадра
     </Button>}
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
   {canRestoreMode&&<div role="status" className="rounded-md border border-border bg-secondary p-2">
     После смены камеры или пересоздания экрана прежний режим не подтверждён.
     {mode.choices.length>0 ? <Button type="button" size="sm" variant="outline" className="ml-2"
       disabled={busy||nativeRecorderOwnsCamera(status?.state??"")}
       onClick={applyCompatibleMode}>Выбрать доступный {mode.size} / {mode.fps} FPS</Button>
       : <span> Камера не сообщает совместимый режим записи.</span>}
   </div>}
   <p role="status">Состояние: {status?.state??"неизвестно"}. {status?.message??""} {status?.recordedDurationMs!==undefined&&`Время видеозаписи: ${Math.floor(status.recordedDurationMs/1000)} сек.`}</p>
   {status&&["saved","saved_interrupted"].includes(status.state)&&
     !status.savedUri&&(status.savedBytes??0)>1024&&
     <Button type="button" variant="outline" disabled={busy} onClick={()=>void retryGallery()}>
       Повторить сохранение готового MP4 в Галерею
     </Button>}
   {status&&["saved","saved_interrupted"].includes(status.state)&&<p role="status">
     Декодирование MP4: {status.mp4FirstFrameDecodable
       ?"начальный кадр успешно прочитан"
       :"начальный кадр не подтверждён"};
     {status.mp4DurationMs!==undefined&&status.mp4DurationMs>1500
       ?(status.mp4TailFrameDecodable?" кадр возле конца также успешно прочитан.":" кадр возле конца не подтверждён.")
       :" проверка кадра в конце недоступна для короткого файла."}
     Это две выборочные проверки, а не проверка всего видеоролика.
   </p>}
   {status&&["recording","paused","saved","saved_interrupted"].includes(status.state)&&
     <p role="status">Нативные наблюдения складного экрана во время записи:
       {status.foldObservations??0} событий WindowManager;
       {status.foldPostureChanges??0} изменений положения шарниров; {status.foldGeometryOnlyChanges??0} изменений только координат шарниров. {status.foldObserverGap?"Наблюдение за складным экраном прерывалось; непрерывность не подтверждена.":""} Во время паузы: {status.foldChangesWhilePaused??0} изменений положения; сверх восьми проверяемых точек MP4: {status.foldCheckpointsOmitted??0}.
       {status.lastFoldAt? ` Последнее изменение: ${new Date(status.lastFoldAt).toLocaleTimeString()}.`:""}
       {status.foldPostureChanges!==undefined&&status.foldPostureChanges>0&&
         ` После изменений положения обнаружено ${status.foldNearbyCallbackGaps??0} задержек callback Camera2 более 250 мс за первые 3 секунды; максимальная ${status.maxFoldNearbyCallbackGapMs??0} мс.`}
       События и задержки callback не доказывают отсутствие потерянных кадров MP4 и могут отсутствовать,
       если экран приложения не наблюдался.
     </p>}
   {status?.mp4TracksInspected&&status.audioRequested&&
     <p role="status">Синхронизация звука и видео (первые временные метки):
       {status.mp4AvStartMeasured===true&&
          status.mp4AvStartOffsetMs!==undefined&&Number.isFinite(status.mp4AvStartOffsetMs)
          ? ` звук начинается на ${status.mp4AvStartOffsetMs} мс относительно первого видеообразца.`
          : " начало звука и видео не удалось сопоставить."}
       Это только начало MP4, не проверка синхронности всего ролика.
     </p>}
   {status?.mp4TracksInspected&&<p role="status">
     Последовательная проверка временных меток MP4: {status.mp4TimelineCompleted===true?"завершена":"не завершена"},
     просмотрено {status.mp4TimelineSamples??0} видеосэмплов; подозрительных длинных интервалов {status.mp4TimelineLargeGaps??0},
     откатов {status.mp4TimelineRollbacks??0}, повторов {status.mp4TimelineDuplicates??0}; самый длинный интервал {status.mp4TimelineMaxGapMs??0} мс.
     Это проверка временных меток, а не полноценное декодирование всего видео.
   </p>}
   {status?.mp4TracksInspected && status.audioRequested && <p role="status">
     Проверка всех доступных аудиометок: {status.mp4AudioTimelineCompleted?"завершена":"не завершена"};
     найдено {status.mp4AudioTimelineSamples??0} сэмплов; подозрительных интервалов {status.mp4AudioTimelineLargeGaps??0},
     откатов {status.mp4AudioTimelineRollbacks??0}, повторов {status.mp4AudioTimelineDuplicates??0}.
     Наличие дорожки: {status.mp4AudioTimelineTrackFound?"подтверждено":"не подтверждено"}.
     {status.mp4AvDriftMeasured===true ? ` Изменение сдвига звука относительно видео от начала к концу: ${status.mp4AvDriftMs??0} мс.` : " Дрейф звука и видео неизвестен."}
     Это проверка меток, а не прослушивание звука или подтверждение синхронности всего ролика.
   </p>}
   {status?.mp4TracksInspected&&<p role="status">
     Выборочная проверка MP4 (декодирование и временные метки до 250 мс): середина {status.mp4MiddleMatched??0} из {status.mp4MiddleProbes??0},
     около наблюдавшихся изменений положения или геометрии шарниров {status.mp4FoldMatched??0} из {status.mp4FoldProbes??0}.
     Пропущено контрольных точек изменений экрана у краёв файла: {status.mp4FoldPointsSkipped??0}. Интервалы временных меток MP4 возле складок: {status.mp4FoldPtsSpanChecks??0} проверок,
     больших разрывов (свыше 250 мс): {status.mp4FoldPtsLargeGaps??0}; проверено аудиоинтервалов возле складок: {status.mp4FoldAudioPtsSpanChecks??0}, подозрительных аудиоинтервалов (свыше 500 мс): {status.mp4FoldAudioPtsLargeGaps??0},
     максимальный разрыв: {status.mp4MaxFoldPtsGapMs??0} мс.
     Ноль проверок у складок означает отсутствие пригодных отмеченных точек, а не доказательство непрерывности.
     Даже успешные точки не доказывают сохранность каждого кадра.
   </p>}
   {status?.mp4TracksInspected&&<p role="status">Проверка сохранённого MP4: видеодорожка {status.mp4HasVideoTrack?"обнаружена":"не обнаружена"}, звуковая дорожка {status.mp4HasAudioTrack?"обнаружена":"не обнаружена"}. {status.mp4VideoWidth&&status.mp4VideoHeight?`Размер видеофайла: ${status.mp4VideoWidth}×${status.mp4VideoHeight}.`:""} Это проверка дорожек, а не каждого кадра или качества звука.</p>}
   {status?.mp4TracksInspected&&<p role="status">
     Выборочная проверка сэмплов MP4: видео {status.mp4VideoSamples??0}, звук {status.mp4AudioSamples??0};
     {status.mp4SampledFps!==undefined&&status.mp4SampledFps>0
       ? ` оценка FPS ${status.mp4SampledFps.toFixed(1)} (только проверенная часть файла);`
       : " FPS не подтверждён;"}
     {((status.mp4VideoTimestampRollbacks??0)>0||(status.mp4VideoTimestampDuplicates??0)>0)
       ? ` обнаружены откаты меток ${status.mp4VideoTimestampRollbacks??0} и повторы ${status.mp4VideoTimestampDuplicates??0}.`
       : " откатов/повторов меток в проверенной части не обнаружено."}
     {status.mp4VideoSampleLimitReached&&" Остальная часть файла не проверена."}
   </p>}
   {status?.mp4TracksInspected&&<p role="status">
     Проверка конца MP4: {status.mp4TailVideoSamples??0} видеосэмплов;
     {status.mp4TailSampledFps!==undefined&&status.mp4TailSampledFps>0
       ? ` оценка FPS в конце ${status.mp4TailSampledFps.toFixed(1)};`
       : " FPS конца не подтверждён;"}
     {status.mp4DurationMs&&status.mp4DurationMs>0 ? ` длительность MP4 ${(status.mp4DurationMs/1000).toFixed(1)} с;` : " длительность неизвестна;"}
     {status.mp4TailNearEnd ? " конец видеодорожки близок к заявленной длительности." :
       " совпадение последнего кадра с длительностью не подтверждено."}
     Проверены только ограниченные участки, не вся запись.
   </p>}
   {status&&["saved","saved_interrupted"].includes(status.state)&&!status.mp4TracksInspected&&<p role="status">Проверка видеодорожек недоступна: их наличие не подтверждено.</p>}
   {status&&["recording","paused","saved","saved_interrupted"].includes(status.state)&&<p role="status">
     Наблюдения стабилизации в ходе записи: EIS — {status.recordingEisFrames??0} кадров,
     OIS — {status.recordingOisFrames??0}, выключена — {status.recordingStabilizationOffFrames??0},
     неизвестно — {status.recordingStabilizationUnknownFrames??0}.
     Это данные CaptureResult, а не оценка визуальной плавности готового MP4.
   </p>}
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
   <div className="space-y-2 rounded-lg border border-border p-3">
     <Button variant="outline" onClick={()=>void readAudit()}>Показать историю нативных записей и складываний</Button>
     {auditError&&<p role="alert" className="text-destructive">{auditError}</p>}
     {auditHistory&&<Button variant="outline" onClick={()=>{
       const text=nativeAnonymizedAuditReport(auditHistory);
       void navigator.clipboard.writeText(text).then(()=>setAuditError("Обезличенный отчёт скопирован.")).catch(()=>setAuditError("Буфер обмена недоступен; отчёт не скопирован."));
     }}>Скопировать обезличенный отчёт о записи и складывании</Button>}
     {auditHistory&&<div className="space-y-2">
       <p>Последние {auditHistory.entries.length} записей (максимум {auditHistory.maxEntries}).
          Удалено старых записей из журнала: {auditHistory.omittedEarlier}.
          Это результаты проверок, а не подтверждение полного аппаратного тестирования.</p>
       {auditHistory.entries.slice().reverse().map((item,i)=><div key={String(item["captureId"]??i)}
          className="rounded border border-border p-2 text-sm">
         <p>Камера {String(item["cameraId"]??"неизвестно")} • {String(item["width"]??"?")}×{String(item["height"]??"?")} • {String(item["fps"]??"?")} FPS</p>
         <p>Результат: {String(item["state"]??"unknown")}; MP4: {String(item["savedBytes"]??0)} байт;
            наблюдений складывания: {String(item["foldPostureChanges"]??0)};
            точек возле складывания: {String(item["mp4FoldMatched"]??0)}/{String(item["mp4FoldProbes"]??0)}</p>
       </div>)}
     </div>}
   </div>
   {error&&<p role="alert" className="text-destructive">{error}</p>}
   <div className="flex flex-wrap gap-2">
    <Button variant="outline" disabled={busy||active||!camera} onClick={()=>void openPreview()}>Открыть видоискатель</Button>
    <Button disabled={busy||!camera||!mode.size||!mode.choices.includes(fps)||(active && status?.state!=="previewing")} onClick={()=>void start()}>Начать нативную запись</Button>
    <Button disabled={busy||!["recording","paused"].includes(status?.state??"")} variant="outline" onClick={()=>void changePause()}>{status?.state==="paused"?"Продолжить":"Пауза"}</Button>
    <Button disabled={busy||!active} variant="outline" onClick={()=>void stop()}>{status?.state==="previewing"?"Закрыть камеру":"Остановить"}</Button>
   </div>
 </section>;
}
