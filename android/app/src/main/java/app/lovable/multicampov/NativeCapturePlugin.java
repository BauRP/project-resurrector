package app.lovable.multicampov;

import android.Manifest;
import android.content.Intent;
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
 @PluginMethod public void setPreviewVisible(PluginCall call) {
  NativeCaptureService.setPreviewConsumerVisible(Boolean.TRUE.equals(call.getBoolean("visible",false)));
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
 @PluginMethod public void status(PluginCall call){
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
