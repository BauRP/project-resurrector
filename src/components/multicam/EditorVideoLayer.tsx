import { useEffect, useRef } from "react";

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
  style: React.CSSProperties;
  zIndex: number;
  label: string;
}
export function EditorVideoLayer({source,timelineTime,start,inPoint,outPoint,speed,
  reverse,playing,style,zIndex,label}:EditorVideoLayerProps) {
  const ref=useRef<HTMLVideoElement>(null);
  const target=()=> {
    const frame=(timelineTime-start)*speed;
    return Math.max(inPoint,Math.min(outPoint-.012,reverse?outPoint-frame:inPoint+frame));
  };
  useEffect(()=>{
    const v=ref.current;
    if(!v)return;
    // A source change is a new decoder session: discard old playback first.
    v.pause();
    v.src=source;v.load();
    const onReady=()=>{const to=target();if(Number.isFinite(to)){
      try{v.currentTime=to;}catch{/* codec not ready yet */}
    }};
    v.addEventListener("loadedmetadata",onReady);
    return ()=>{v.removeEventListener("loadedmetadata",onReady);v.pause();
      v.removeAttribute("src");v.load();};
    // source is the only signal for decoder ownership
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[source]);
  useEffect(()=>{
    const v=ref.current;
    if(!v)return;
    v.muted=true;
    const to=target();
    if(!Number.isFinite(to))return;
    if(playing&&!reverse){
      if(v.playbackRate!==speed)v.playbackRate=speed;
      if(v.paused){
        try{v.currentTime=to;}catch{/* wait until metadata */}
        void v.play().catch(()=>undefined);
      }else if(!v.seeking&&Math.abs(v.currentTime-to)>.28)v.currentTime=to;
    }else{
      if(!v.paused)v.pause();
      if(v.readyState>=1&&!v.seeking&&Math.abs(v.currentTime-to)>.04)v.currentTime=to;
    }
  },[timelineTime,start,inPoint,outPoint,speed,reverse,playing]);
  return <video ref={ref} muted playsInline preload="metadata"
    aria-label={label}
    className="absolute inset-0 h-full w-full object-cover"
    style={{...style,zIndex,pointerEvents:"none"}} />;
}
