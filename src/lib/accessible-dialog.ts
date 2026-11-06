/** Keyboard and screen-reader containment for WebView overlay dialogs.
 * Native fullscreen folds can move the pane, but the user must still be
 * able to reach the close button using TalkBack or a physical keyboard.
 */
const SELECTOR='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function dialogTabStops(container:HTMLElement):HTMLElement[]{
  return Array.from(container.querySelectorAll<HTMLElement>(SELECTOR))
    .filter(element=>element.getAttribute("aria-hidden")!=="true" &&
      element.getAttribute("tabindex")!=="-1" &&
      !element.hasAttribute("hidden") && element.getClientRects().length>0);
}
export function activateAccessibleDialog(
  container:HTMLElement,onClose:()=>void,
):()=>void{
  const previous=document.activeElement instanceof HTMLElement?
    document.activeElement:null;
  const initial=dialogTabStops(container)[0]??container;
  initial.focus();
  const onKeyDown=(event:KeyboardEvent)=>{
    if(event.key==="Escape"){
      event.preventDefault();event.stopPropagation();onClose();return;
    }
    if(event.key!=="Tab")return;
    const items=dialogTabStops(container);
    if(!items.length){event.preventDefault();container.focus();return;}
    const first=items[0]!,last=items[items.length-1]!;
    const focused=document.activeElement;
    if(event.shiftKey && (focused===first || !container.contains(focused))){
      event.preventDefault();last.focus();
    }else if(!event.shiftKey && (focused===last || !container.contains(focused))){
      event.preventDefault();first.focus();
    }
  };
  document.addEventListener("keydown",onKeyDown);
  return ()=>{
    document.removeEventListener("keydown",onKeyDown);
    if(previous?.isConnected)previous.focus();
  };
}
