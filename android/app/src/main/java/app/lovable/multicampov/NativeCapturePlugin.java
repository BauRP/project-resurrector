package app.lovable.multicampov;

import android.Manifest;
import android.content.Intent;
import android.graphics.SurfaceTexture;
import android.graphics.Rect;
import android.view.View;
import com.getcapacitor.JSObject;
import java.lang.ref.WeakReference;
import android.view.TextureView;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.webkit.WebView;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(name="NativeCapture", permissions={
 @Permission(alias="camera",strings={Manifest.permission.CAMERA}),
 @Permission(alias="microphone",strings={Manifest.permission.RECORD_AUDIO})
})
public class NativeCapturePlugin extends Plugin {
 private TextureView directView;
 private String directOwner;
 // Weak owner prevents a destroyed Activity from retaining a camera overlay.
 private static volatile WeakReference<NativeCapturePlugin> visiblePreview =
     new WeakReference<>(null);
 static void onFoldGeometryChanged() {
   NativeCapturePlugin plugin=visiblePreview.get();
   if(plugin==null||plugin.getActivity()==null)return;
   plugin.getActivity().runOnUiThread(plugin::hidePreviewCrossingCurrentFold);
 }
 // Activity/WebView may resize without a new FoldingFeature.
 // Observe both native containers; never leave a TextureView over controls.
 private View directWatchWeb,directWatchRoot;
 private View.OnLayoutChangeListener directBoundsListener;
 private void clearPreviewBoundsWatch() {
   if(directBoundsListener!=null){
     if(directWatchWeb!=null)directWatchWeb.removeOnLayoutChangeListener(directBoundsListener);
     if(directWatchRoot!=null)directWatchRoot.removeOnLayoutChangeListener(directBoundsListener);
   }
   directBoundsListener=null;directWatchWeb=null;directWatchRoot=null;
 }
 private void ensurePreviewBoundsWatch(WebView web,FrameLayout root) {
   if(directBoundsListener!=null && directWatchWeb==web && directWatchRoot==root)return;
   clearPreviewBoundsWatch();
   directBoundsListener=(view,left,top,right,bottom,oldLeft,oldTop,oldRight,oldBottom)->{
     if(left!=oldLeft||top!=oldTop||right!=oldRight||bottom!=oldBottom)
       hidePreviewCrossingCurrentFold();
   };
   directWatchWeb=web;directWatchRoot=root;
   web.addOnLayoutChangeListener(directBoundsListener);
   root.addOnLayoutChangeListener(directBoundsListener);
 }
 private void hidePreviewCrossingCurrentFold() {
   TextureView view=directView;
   if(view==null||view.getParent()==null)return;
   WebView web=getBridge()==null?null:getBridge().getWebView();
   View root=getActivity()==null?null:getActivity().findViewById(android.R.id.content);
   if(web==null||root==null){invalidatePreviewForLayout("window_unavailable");return;}
   View decor=getActivity().getWindow().getDecorView();
   int[] pos=new int[2],decorPos=new int[2],webPos=new int[2],rootPos=new int[2];
   view.getLocationInWindow(pos);
   decor.getLocationInWindow(decorPos);
   web.getLocationInWindow(webPos);
   root.getLocationInWindow(rootPos);
   int width=view.getWidth(),height=view.getHeight();
   if(width<=0||height<=0){
     FrameLayout.LayoutParams params=(FrameLayout.LayoutParams)view.getLayoutParams();
     width=params.width;height=params.height;
   }
   Rect viewWindow=new Rect(pos[0],pos[1],pos[0]+width,pos[1]+height);
   Rect webWindow=new Rect(webPos[0],webPos[1],
       webPos[0]+web.getWidth(),webPos[1]+web.getHeight());
   Rect rootWindow=new Rect(rootPos[0],rootPos[1],
       rootPos[0]+root.getWidth(),rootPos[1]+root.getHeight());
   boolean inside=width>0&&height>0&&web.getWidth()>0&&web.getHeight()>0&&
       root.getWidth()>0&&root.getHeight()>0&&
       webWindow.contains(viewWindow)&&rootWindow.contains(viewWindow);
   Rect relativeToDecor=new Rect(viewWindow);
   relativeToDecor.offset(-decorPos[0],-decorPos[1]);
   if(!inside||DisplayTopologyPlugin.isUnsafeDirectPreviewWindowRect(relativeToDecor))
     invalidatePreviewForLayout(!inside?"window_bounds":"fold_hinge");
 }
 // Android may detach the direct TextureView independently of the JS
 // command queue (WindowManager hinge, keyboard, split-screen, Activity).
 // Notify only on NATIVE safety invalidation, not intentional UI hide.
 private void invalidatePreviewForLayout(String reason) {
   String invalidatedOwner=directOwner;
   if(invalidatedOwner==null || directView==null)return;
   detachDirectView();
   JSObject event=new JSObject();
   event.put("ownerId",invalidatedOwner);
   event.put("reason",reason);
   notifyListeners("directPreviewInvalidated",event);
 }
 private void detachDirectView() {
   clearPreviewBoundsWatch();
   String old=directOwner;
   directOwner=null;
   if(visiblePreview.get()==this)visiblePreview.clear();
   if(old!=null)NativeCaptureService.setDirectPreviewTexture(old,null);
   if(directView!=null){
     ViewGroup parent=(ViewGroup)directView.getParent();
     if(parent!=null)parent.removeView(directView);
     directView=null;
   }
 }
 @PluginMethod public void setDirectPreview(PluginCall call) {
   String owner=call.getString("ownerId");
   Boolean enabled=call.getBoolean("visible",false);
   if(owner==null||owner.isEmpty()||owner.length()>128){call.reject("Invalid native preview owner");return;}
   getActivity().runOnUiThread(()->{
     if(!Boolean.TRUE.equals(enabled)){
       if(owner.equals(directOwner))detachDirectView();
       JSObject ack=new JSObject();ack.put("visible",false);
       call.resolve(ack);return;
     }
     if(NativeCaptureService.isRunning() &&
         !"previewing".equals(NativeCaptureService.status(getContext()).getString("state"))){
       call.reject("Direct preview cannot overlay active video recording");return;
     }
     Double x=call.getDouble("left"),y=call.getDouble("top"),
       w=call.getDouble("width"),h=call.getDouble("height");
     if(x==null||y==null||w==null||h==null||
       !Double.isFinite(x)||!Double.isFinite(y)||!Double.isFinite(w)||!Double.isFinite(h)||
       w<80||h<80||w>5000||h>5000||x<0||y<0){
       call.reject("Invalid preview viewport");return;
     }
     WebView web=getBridge().getWebView();
     if(web==null){call.reject("WebView not available");return;}
     // Client coordinates are relative to the actual measured WebView,
     // rather than full device pixels on a foldable or split-screen window.
     Double viewportWidth=call.getDouble("viewportWidth");
     Double viewportHeight=call.getDouble("viewportHeight");
     if(viewportWidth==null||viewportHeight==null||
        !Double.isFinite(viewportWidth)||!Double.isFinite(viewportHeight)||
        viewportWidth<=0||viewportHeight<=0){
       call.reject("Invalid WebView viewport size");return;
     }
     // WebView CSS X/Y are independent scales in multi-window, rotated
     // foldable, keyboard and letterboxed layouts. Scaling Y with the X
     // ratio can position the native TextureView over controls or a hinge.
     float cssScaleX=web.getWidth()/viewportWidth.floatValue();
     float cssScaleY=web.getHeight()/viewportHeight.floatValue();
     if(!Float.isFinite(cssScaleX)||!Float.isFinite(cssScaleY)||
         cssScaleX<=0||cssScaleY<=0){
       call.reject("Invalid WebView viewport scale");return;
     }
     FrameLayout root=(FrameLayout)getActivity().findViewById(android.R.id.content);
     if(root==null){call.reject("Root view unavailable");return;}
     // getLeft()/getTop() are relative to the *immediate* parent, which may
     // not be the Activity root in a foldable/resizable Capacitor layout.
     // Both locations must use the SAME window coordinate system.
     int[] webLocation=new int[2],rootLocation=new int[2];
     web.getLocationInWindow(webLocation);
     root.getLocationInWindow(rootLocation);
     int webX=webLocation[0]-rootLocation[0];
     int webY=webLocation[1]-rootLocation[1];
     int px=Math.round(x.floatValue()*cssScaleX)+webX;
     int py=Math.round(y.floatValue()*cssScaleY)+webY;
     int pw=Math.round(w.floatValue()*cssScaleX),ph=Math.round(h.floatValue()*cssScaleY);
     if(pw<1||ph<1||px<webX||py<webY||
        px+pw>webX+web.getWidth()+2||
        py+ph>webY+web.getHeight()+2||
        px<0||py<0||px+pw>root.getWidth()+2||py+ph>root.getHeight()+2){
       call.reject("Native preview outside measured WebView/Activity bounds");return;
     }
     int[] decorLocation=new int[2];
     getActivity().getWindow().getDecorView().getLocationInWindow(decorLocation);
     int originX=rootLocation[0]-decorLocation[0],originY=rootLocation[1]-decorLocation[1];
     Rect requestedWindowRect=new Rect(px+originX,py+originY,
       px+originX+pw,py+originY+ph);
     if(DisplayTopologyPlugin.isUnsafeDirectPreviewWindowRect(requestedWindowRect)){
       // A cover/hinge transition is expected while the Activity is moving.
       // Keep direct preview enabled, but never promise a visible overlay.
       // A later real fold/resize event can retry this *without* reopening
       // or stopping Camera2.
       if(owner.equals(directOwner))invalidatePreviewForLayout("fold_hinge");
       JSObject ack=new JSObject();
       ack.put("visible",false);
       ack.put("reason","topology_pending_or_hinge");
       call.resolve(ack);
       return;
     }
     if(directView!=null&&!owner.equals(directOwner))detachDirectView();
     if(directView==null){
       directOwner=owner;
       directView=new TextureView(getContext());
       directView.setOpaque(true);
       // TextureView lives ABOVE the WebView; JS clicks below it never arrive.
       // Route touches from the real Android surface to the same Camera2
       // controller used by JPEG preview, never opening another camera.
       directView.setOnTouchListener((view,event)->{
         if(event.getActionMasked()!=MotionEvent.ACTION_UP)return true;
         if(view.getWidth()<=0||view.getHeight()<=0)return true;
         final float nx=event.getX()/view.getWidth();
         final float ny=event.getY()/view.getHeight();
         if(Float.isFinite(nx)&&Float.isFinite(ny)&&nx>=0f&&nx<=1f&&ny>=0f&&ny<=1f)
           NativeCaptureService.tapToMeter(nx,ny,accepted->{});
         return true;
       });
       directView.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){
         @Override public void onSurfaceTextureAvailable(SurfaceTexture texture,int width,int height){
           if(owner.equals(directOwner))NativeCaptureService.setDirectPreviewTexture(owner,texture);
         }
         @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture,int width,int height){}
         @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture){
           NativeCaptureService.setDirectPreviewTexture(owner,null);
           // The OS may destroy a surface without a WindowManager posture
           // callback (display handoff, GPU loss, Activity resize). Only
           // invalidate this owner's actual TextureView and let the JS
           // bounded recovery decide whether a safe pane remains available.
           if(owner.equals(directOwner) && directView!=null)
             directView.post(()->{
               if(owner.equals(directOwner) && directView!=null &&
                   !directView.isAvailable())
                 invalidatePreviewForLayout("surface_destroyed");
             });
           return true;
         }
         @Override public void onSurfaceTextureUpdated(SurfaceTexture texture){}
       });
       FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(pw,ph);
       lp.leftMargin=px;lp.topMargin=py;
       root.addView(directView,lp);
     }else{
       FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)directView.getLayoutParams();
       lp.width=pw;lp.height=ph;lp.leftMargin=px;lp.topMargin=py;
       directView.setLayoutParams(lp);
     }
     // The overlay is a native Activity view: a fold can move across it
     // without any new JS show request. Recheck on EVERY native fold event.
     visiblePreview=new WeakReference<>(this);
     ensurePreviewBoundsWatch(web,root);
     hidePreviewCrossingCurrentFold();
     // Native geometry can become unsafe between JS measurement and
     // UI-thread show; never acknowledge a detached surface as visible.
     JSObject ack=new JSObject();
     ack.put("visible",owner.equals(directOwner)&&directView!=null&&
         directView.getParent()!=null);
     call.resolve(ack);
   });
 }
 @Override protected void handleOnDestroy(){
   getActivity().runOnUiThread(this::detachDirectView);
   super.handleOnDestroy();
 }
 @PluginMethod public void setPreviewVisible(PluginCall call) {
  String ownerId=call.getString("ownerId");
  if(ownerId==null || ownerId.isEmpty()){
   call.reject("Требуется идентификатор текущего видоискателя");return;
  }
  NativeCaptureService.setPreviewConsumerVisible(
   Boolean.TRUE.equals(call.getBoolean("visible",false)),ownerId);
  call.resolve();
 }
 @PluginMethod public void previewFrame(PluginCall call) {
  call.resolve(NativeCaptureService.previewFrame());
 }
 @PluginMethod public void setControls(PluginCall call) {
  Double zoom=call.getDouble("zoom");
  Integer exposure=call.getInt("exposureIndex");
  if(zoom==null||exposure==null ||
    !NativeCaptureService.updateControls(zoom.floatValue(),exposure,
       applied->{
        if(applied)call.resolve(NativeCaptureService.status(getContext()));
        else call.reject("Camera2 отклонил увеличение или экспозицию");
       })){
    call.reject("Увеличение или экспозиция недоступны для этого Camera2 режима");
  }
 }
 @PluginMethod public void setTorch(PluginCall call) {
  Boolean enabled=call.getBoolean("enabled");
  if(enabled==null || !NativeCaptureService.updateTorch(enabled,
     applied->{
      if(applied)call.resolve(NativeCaptureService.status(getContext()));
      else call.reject("Camera2 не подтвердил включение фонарика");
     })){
    call.reject("Фонарик недоступен для выбранной Camera2 камеры");
  }
 }
 @PluginMethod public void setFocus(PluginCall call) {
  Boolean manual=call.getBoolean("manual");
  Double distance=call.getDouble("diopters",0.0);
  if(manual==null||distance==null ||
      !NativeCaptureService.setFocus(manual,distance.floatValue(),applied->{
        if(applied)call.resolve(NativeCaptureService.status(getContext()));
        else call.reject("Camera2 не принял выбранную фокусировку");
      })){
    call.reject("Ручной или автоматический фокус не поддерживается объективом");
  }
 }
 @PluginMethod public void tapToMeter(PluginCall call) {
  Double x=call.getDouble("x"), y=call.getDouble("y");
  if(x==null||y==null||!NativeCaptureService.tapToMeter(x.floatValue(),y.floatValue(),
     applied->{
      if(applied)call.resolve(NativeCaptureService.status(getContext()));
      else call.reject("Camera2 не принял точку фокусировки/экспозамера");
     })){
    call.reject("Фокусировка или экспозамер по касанию недоступны для текущей камеры");
  }
 }
 @PluginMethod public void retryGalleryPublication(PluginCall call){
   new Thread(()->{
     boolean success=NativeCaptureService.retryGalleryPublication(getContext());
     if(success)call.resolve(NativeCaptureService.status(getContext()));
     else call.reject("Повторная публикация недоступна или файл не подтверждён");
   },"Gallery-Publish-Retry").start();
 }
 @PluginMethod public void auditHistory(PluginCall call){
   NativeCaptureService.recoverAbandonedRecording(getContext());
   call.resolve(NativeCaptureAuditStore.history(getContext()));
 }
 @PluginMethod public void status(PluginCall call){
   NativeCaptureService.recoverAbandonedRecording(getContext());
  call.resolve(NativeCaptureService.status(getContext()));
 }
 @PluginMethod public void startPreview(PluginCall call) {
  if(getPermissionState("camera")!=com.getcapacitor.PermissionState.GRANTED){
   call.reject("Разрешите камеру для предпросмотра");return;
  }
  if(NativeCaptureService.isRunning()){
   call.reject("Камера уже занята нативной сессией");return;
  }
  String id=call.getString("cameraId");
  if(id==null||id.isEmpty()){call.reject("Выберите объектив");return;}
  Intent intent=new Intent(getContext(),NativeCaptureService.class);
  intent.setAction(NativeCaptureService.ACTION_PREVIEW);
  intent.putExtra("cameraId",id);
  try{ContextCompat.startForegroundService(getContext(),intent);
   call.resolve(NativeCaptureService.status(getContext()));
  }catch(Exception error){call.reject("Не удалось открыть предпросмотр: "+error.getMessage());}
 }
 @PluginMethod public void start(PluginCall call){
  boolean audio=Boolean.TRUE.equals(call.getBoolean("audio",false));
  if(getPermissionState("camera")!=com.getcapacitor.PermissionState.GRANTED ||
    (audio && getPermissionState("microphone")!=com.getcapacitor.PermissionState.GRANTED)){
   call.reject("Разрешите камеру и, если нужен звук, микрофон в Android.");return;
  }
  String currentState=NativeCaptureService.status(getContext()).getString("state");
  if(NativeCaptureService.isRunning() && !"previewing".equals(currentState)){
   call.reject("Нативная запись уже работает");return;
  }
  String id=call.getString("cameraId");
  int width=call.getInt("width",1920),height=call.getInt("height",1080),fps=call.getInt("fps",30);
  if(id==null||id.isEmpty()||width<160||height<120||width>3840||height>2160||fps<15||fps>60){
   call.reject("Недопустимый нативный режим");return;
  }
  Intent intent=new Intent(getContext(),NativeCaptureService.class);
  intent.setAction(NativeCaptureService.ACTION_START);
  intent.putExtra("cameraId",id);intent.putExtra("width",width);
  intent.putExtra("height",height);intent.putExtra("fps",fps);intent.putExtra("audio",audio);
  try{
   ContextCompat.startForegroundService(getContext(),intent);
   call.resolve(NativeCaptureService.status(getContext()));
  }catch(Exception error){call.reject("Служба записи недоступна: "+error.getMessage());}
 }
 @PluginMethod public void pause(PluginCall call) {
  if (!NativeCaptureService.isRunning()) {call.reject("Нативная запись не активна");return;}
  Intent intent=new Intent(getContext(),NativeCaptureService.class);
  intent.setAction(NativeCaptureService.ACTION_PAUSE);
  try {getContext().startService(intent);call.resolve(NativeCaptureService.status(getContext()));}
  catch(Exception error){call.reject("Пауза недоступна: "+error.getMessage());}
 }
 @PluginMethod public void resume(PluginCall call) {
  if (!NativeCaptureService.isRunning()) {call.reject("Нативная запись не активна");return;}
  Intent intent=new Intent(getContext(),NativeCaptureService.class);
  intent.setAction(NativeCaptureService.ACTION_RESUME);
  try {getContext().startService(intent);call.resolve(NativeCaptureService.status(getContext()));}
  catch(Exception error){call.reject("Продолжение недоступно: "+error.getMessage());}
 }
 @PluginMethod public void stop(PluginCall call){
  if(!NativeCaptureService.isRunning()){call.resolve(NativeCaptureService.status(getContext()));return;}
  Intent intent=new Intent(getContext(),NativeCaptureService.class);
  intent.setAction(NativeCaptureService.ACTION_STOP);
  try{getContext().startService(intent);call.resolve(NativeCaptureService.status(getContext()));}
  catch(Exception error){call.reject("Не удалось остановить запись: "+error.getMessage());}
 }
}
