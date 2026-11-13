import { useEffect, useRef, type CSSProperties } from "react";
import { shouldCorrectPlayingVideo } from "@/lib/editor-video-sync";

/** Each video layer has its own decoder. One shared <video> can only display
 * one of the simultaneous timeline sources, so never reuse it for overlays.
 * No getUserMedia/camera permissions and no background/network dependencies.
 */
export interface EditorVideoLayerProps {
  source: string;
  timelineTime: number;
  start: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  reverse: boolean;
  playing: boolean;
  style: CSSProperties;
  zIndex: number;
  label: string;
}
export function EditorVideoLayer({source,timelineTime,start,inPoint,outPoint,speed,
  reverse,playing,style,zIndex,label}:EditorVideoLayerProps) {
  const ref=useRef<HTMLVideoElement>(null);
  const previousTarget=useRef<number|null>(null);
  const lastCorrection=useRef(Number.NEGATIVE_INFINITY);
  const lastPlayAttempt=useRef(Number.NEGATIVE_INFINITY);
  const pendingPlay=useRef<Promise<void>|null>(null);
  const target=()=> {
    const frame=(timelineTime-start)*speed;
    return Math.max(inPoint,Math.min(outPoint-.012,reverse?outPoint-frame:inPoint+frame));
  };
  useEffect(()=>{
    const v=ref.current;
    if(!v)return;
    previousTarget.current=null;
    lastCorrection.current=Number.NEGATIVE_INFINITY;
    lastPlayAttempt.current=Number.NEGATIVE_INFINITY;
    pendingPlay.current=null;
    // A source change is a new decoder session: discard old playback first.
    v.pause();
    // A cached WebView video can dispatch loadedmetadata during load().
    // Install the handler first to retain the correct initial timeline frame.
    const onReady=()=>{const to=target();if(Number.isFinite(to)){
      try{v.currentTime=to;}catch{/* codec not ready yet */}
    }};
    v.addEventListener("loadedmetadata",onReady);
    v.src=source;v.load();
    return ()=>{v.removeEventListener("loadedmetadata",onReady);v.pause();
      pendingPlay.current=null;
      v.removeAttribute("src");v.load();};
    // source is the only signal for decoder ownership
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[source]);
  useEffect(()=>{
    const v=ref.current;
    if(!v||!source)return;
    v.muted=true;
    const to=target();
    if(!Number.isFinite(to))return;
    const prior=previousTarget.current;
    previousTarget.current=to;
    const now=performance.now();
    if(playing&&!reverse){
      if(v.playbackRate!==speed)v.playbackRate=speed;
      if(v.paused){
        // A pending HTMLVideoElement.play() may take several frames on a slow
        // Android decoder. Do not start a new promise and seek each frame.
        if(!pendingPlay.current&&now-lastPlayAttempt.current>=500){
          lastPlayAttempt.current=now;
          if(!v.seeking){
            try{v.currentTime=to;}catch{/* wait until metadata */}
          }
          try{
            const request=Promise.resolve(v.play()).then(
              ()=>{if(pendingPlay.current===request)pendingPlay.current=null;},
              ()=>{if(pendingPlay.current===request)pendingPlay.current=null;},
            );
            pendingPlay.current=request;
          }catch{/* decoder not ready; retry after cooldown */}
        }
      }else if(shouldCorrectPlayingVideo(v.currentTime,to,prior,v.seeking,now,lastCorrection.current)){
        try{v.currentTime=to;lastCorrection.current=now;}catch{/* codec unavailable */}
      }
    }else{
      if(!v.paused)v.pause();
      if(v.readyState>=1&&!v.seeking&&Math.abs(v.currentTime-to)>.04){
        try{v.currentTime=to;}catch{/* decoder not ready */}
      }
    }
  },[timelineTime,start,inPoint,outPoint,speed,reverse,playing,source]);
  return <video ref={ref} muted playsInline preload="metadata"
    aria-label={label}
    className="absolute inset-0 h-full w-full object-cover"
    style={{...style,zIndex,pointerEvents:"none"}} />;
}
