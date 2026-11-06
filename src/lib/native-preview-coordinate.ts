/** Converts a tap from an object-contain <img> box into unrotated Camera2
 * stream coordinates. Returns null for letterbox margins or invalid data.
 * Caller passes the displayed img rectangle (not device viewport) and the
 * original JPEG dimensions. Hinge and pane offsets are removed by using
 * local client coordinates; native Camera2 then maps to active sensor crop.
 */
export function previewTapPoint(
  clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number},
  sourceWidth:number,sourceHeight:number,
):{x:number;y:number}|null {
  if(![clientX,clientY,rect.left,rect.top,rect.width,rect.height,sourceWidth,sourceHeight]
    .every(Number.isFinite)||rect.width<=0||rect.height<=0||sourceWidth<=0||sourceHeight<=0)return null;
  const scale=Math.min(rect.width/sourceWidth,rect.height/sourceHeight);
  const width=sourceWidth*scale,height=sourceHeight*scale;
  const left=rect.left+(rect.width-width)/2,top=rect.top+(rect.height-height)/2;
  const x=(clientX-left)/width,y=(clientY-top)/height;
  if(x<0||x>1||y<0||y>1)return null;
  return {x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))};
}
