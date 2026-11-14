/**
 * One cancellation-aware deadline shared by the local single-clip and
 * sequential video encoders. Closing Editor or an Activity must immediately
 * interrupt waiting for WebView metadata/seek/playback, not wait 4-12 seconds
 * for a timeout while an old MediaCodec instance still owns resources.
 * This rejects only the WAIT; the callers still release their own decoders.
 */
export async function awaitEditorExportStep<T>(
  task:Promise<T>, deadlineMs:number, signal:AbortSignal, timeoutMessage:string,
):Promise<T> {
  if(signal.aborted)throw Error("Экспорт отменён");
  if(!Number.isFinite(deadlineMs)||deadlineMs<=0)throw Error("Недопустимое время ожидания экспорта");
  let timer:ReturnType<typeof setTimeout>|null=null;
  const interrupted=()=>new Error("Экспорт отменён");
  let rejectAbort!: (reason:Error)=>void;
  const abortPromise=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const onAbort=()=>rejectAbort(interrupted());
  signal.addEventListener("abort",onAbort,{once:true});
  const timeout=new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(Error(timeoutMessage)),deadlineMs);
  });
  try{
    if(signal.aborted)throw interrupted();
    return await Promise.race([task,abortPromise,timeout]);
  }finally{
    if(timer!==null)clearTimeout(timer);
    signal.removeEventListener("abort",onAbort);
  }
}
