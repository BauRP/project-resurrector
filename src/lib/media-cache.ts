import { bounded } from "./async";
/** This DB contains only regenerable proxy video. Never delete originals. */
const CACHE_DB = "multicam-pov-preview-cache";
const CACHE_LIMIT_BYTES = 160 * 1024 * 1024;
const CACHE_LIMIT_ENTRIES = 48;
type ProxyMetadata = { id: string; size: number; touched: number };

export class BoundedDerivedCache<K, V> extends Map<K, V> {
  constructor(readonly maxEntries: number) { super(); }
  override get(key: K): V | undefined {
    const value=super.get(key);
    if(value!==undefined){super.delete(key);super.set(key,value);}
    return value;
  }
  override set(key:K,value:V):this {
    if(super.has(key))super.delete(key);
    super.set(key,value);
    while(this.size>this.maxEntries) {
      const first=this.keys().next();
      if(first.done)break;
      super.delete(first.value);
    }
    return this;
  }
}
export const analysisCache=new BoundedDerivedCache<string,{duration:number;peaks:number[];sourceKey?:string}>(128);
export const thumbCache=new BoundedDerivedCache<string,string[]>(64);

/** Version 2 adds size and LRU metadata. Legacy cache blobs are regenerable;
 * discard old v1 previews during schema upgrade to establish a real quota. */
export async function previewCache():Promise<IDBDatabase>{
  return bounded(new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(CACHE_DB,2);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains("proxies"))db.createObjectStore("proxies");
      if(!db.objectStoreNames.contains("proxy-meta")){
        db.createObjectStore("proxy-meta",{keyPath:"id"});
        request.transaction?.objectStore("proxies").clear();
      }
    };
    // A blocked open can succeed much later. Its success cannot reopen a
    // connection that the caller has already abandoned.
    let abandoned=false;
    request.onblocked=()=>{abandoned=true;reject(new Error("Кэш предпросмотра занят"));};
    request.onerror=()=>{abandoned=true;reject(request.error??new Error("Не удалось открыть кэш"));};
    request.onsuccess=()=>{
      const db=request.result;
      db.onversionchange=()=>db.close();
      if(abandoned){db.close();return;}
      resolve(db);
    };
  }),5000,"Preview cache",db=>db.close());
}

/** Pure LRU planner used by IndexedDB and tests; no user-owned data. */
export function chooseProxyEvictions(existing:readonly ProxyMetadata[],incoming:ProxyMetadata,
  byteLimit=CACHE_LIMIT_BYTES,countLimit=CACHE_LIMIT_ENTRIES):string[]{
  const ordered=[...existing.filter(x=>x.id!==incoming.id),incoming]
    .sort((a,b)=>a.touched-b.touched);
  const victims:string[]=[];
  let total=ordered.reduce((a,b)=>a+b.size,0);
  while(ordered.length>countLimit||total>byteLimit){
    const item=ordered.shift();
    if(!item)break;
    total-=item.size;
    victims.push(item.id);
  }
  return victims;
}
/** Stop optional proxy cache IO when Editor unmounts. A Promise timeout alone
 * does not abort an active IndexedDB transaction on stalled Android WebView.
 * This only touches regenerable preview blobs; user clips live in another DB.
 */
export async function readProxy(id: string, signal?: AbortSignal): Promise<Blob | null> {
  if (signal?.aborted) return null;
  const db = await previewCache();
  try {
    if (signal?.aborted) return null;
    return await new Promise<Blob | null>((resolve, reject) => {
      let tx: IDBTransaction;
      let get: IDBRequest;
      try {
        tx = db.transaction(["proxies", "proxy-meta"], "readwrite");
        get = tx.objectStore("proxies").get(id);
      } catch (error) { reject(error); return; }

      let settled = false;
      let value: Blob | null = null;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        get.onsuccess = null;
        get.onerror = null;
        tx.oncomplete = null;
        tx.onerror = null;
        tx.onabort = null;
      };
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error !== undefined) reject(error);
        else resolve(value);
      };
      const cancel = () => {
        // Report completion before a synchronous OEM onabort can override it.
        finish(new Error("Proxy cache read cancelled"));
        try { tx.abort(); } catch { /* The transaction already completed. */ }
      };
      const timer = setTimeout(() => {
        finish(new Error("Read proxy: timeout"));
        try { tx.abort(); } catch { /* Already completed. */ }
      }, 5000);
      get.onsuccess = () => {
        if (signal?.aborted) { cancel(); return; }
        try {
          if (get.result instanceof Blob) {
            value = get.result;
            tx.objectStore("proxy-meta").put({
              id, size: value.size, touched: Date.now(),
            } satisfies ProxyMetadata);
          }
        } catch (error) { finish(error); try { tx.abort(); } catch { /* Not active. */ } }
      };
      get.onerror = () => finish(get.error ?? new Error("Proxy cache read failed"));
      tx.oncomplete = () => finish();
      tx.onerror = () => finish(tx.error ?? new Error("Proxy cache transaction failed"));
      tx.onabort = () => finish(tx.error ?? new Error("Proxy cache transaction aborted"));
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  } finally { db.close(); }
}
/** The optional proxy write must not survive a closed Editor or hold a
 * stuck WebView transaction after its deadline. Original recorded clips
 * belong to a different database and are never affected by this operation.
 */
export async function writeProxy(id:string,blob:Blob,signal?:AbortSignal):Promise<void>{
  if(blob.size>CACHE_LIMIT_BYTES)return;
  if(signal?.aborted)throw new Error("Proxy cancelled");
  const db=await previewCache();
  try{
    if(signal?.aborted)throw new Error("Proxy cancelled");
    await new Promise<void>((resolve,reject)=>{
      let tx:IDBTransaction;
      let get:IDBRequest;
      try{
        tx=db.transaction(["proxies","proxy-meta"],"readwrite");
        get=tx.objectStore("proxy-meta").getAll();
      }catch(error){reject(error);return;}
      let settled=false;
      let timer:ReturnType<typeof setTimeout>|null=null;
      const cleanup=()=>{
        if(timer!==null)clearTimeout(timer);
        signal?.removeEventListener("abort",onAbort);
        get.onsuccess=null;get.onerror=null;
        tx.oncomplete=null;tx.onerror=null;tx.onabort=null;
      };
      const finish=(error?:unknown)=>{
        if(settled)return;
        settled=true;
        cleanup();
        if(error!==undefined)reject(error);else resolve();
      };
      const cancel=(reason:string)=>{
        finish(new Error(reason));
        try{tx.abort();}catch{/* already committed or closed */}
      };
      const onAbort=()=>cancel("Proxy cancelled");
      get.onsuccess=()=>{
        if(signal?.aborted){onAbort();return;}
        try{
          const previews=tx.objectStore("proxies");
          const meta=tx.objectStore("proxy-meta");
          const next:ProxyMetadata={id,size:blob.size,touched:Date.now()};
          const evicted=chooseProxyEvictions(get.result as ProxyMetadata[],next);
          if(!evicted.includes(id)){
            previews.put(blob,id);
            meta.put(next);
          }
          for(const victim of evicted){previews.delete(victim);meta.delete(victim);}
        }catch(error){
          finish(error);
          try{tx.abort();}catch{/* transaction already closed */}
        }
      };
      get.onerror=()=>finish(get.error??new Error("Не удалось прочитать метаданные кэша"));
      tx.oncomplete=()=>finish();
      tx.onerror=()=>finish(tx.error??new Error("Не удалось сохранить превью"));
      tx.onabort=()=>finish(tx.error??new Error("Запись кэша прервана"));
      signal?.addEventListener("abort",onAbort,{once:true});
      timer=setTimeout(()=>cancel("Save proxy: timeout"),7000);
      if(signal?.aborted)onAbort();
    });
  }finally{db.close();}
}
/** Read only tiny LRU metadata, never the video Blob contents. A hung WebView
 * must abort the real IDB cursor transaction, not merely reject a Promise.
 */
export async function cacheBytes():Promise<number>{
  const db=await previewCache();
  try{
    return await new Promise<number>((resolve,reject)=>{
      let tx:IDBTransaction;
      let req:IDBRequest<IDBCursorWithValue|null>;
      try{
        tx=db.transaction("proxy-meta","readonly");
        req=tx.objectStore("proxy-meta").openCursor();
      }catch(error){reject(error);return;}
      let settled=false;
      let size=0;
      const cleanup=()=>{
        clearTimeout(timer);
        req.onsuccess=null;req.onerror=null;
        tx.oncomplete=null;tx.onerror=null;tx.onabort=null;
      };
      const finish=(error?:unknown)=>{
        if(settled)return;
        settled=true;
        cleanup();
        if(error!==undefined)reject(error);else resolve(size);
      };
      const cancel=(reason:string)=>{
        finish(new Error(reason));
        try{tx.abort();}catch{/* IDB transaction finished or disconnected */}
      };
      const timer=setTimeout(()=>cancel("Measure cache: timeout"),5000);
      req.onsuccess=()=>{
        if(settled)return;
        try{
          const cur=req.result;
          if(!cur)return;
          size+=(cur.value as ProxyMetadata).size;
          cur.continue();
        }catch(error){
          finish(error);
          try{tx.abort();}catch{/* Already closing */}
        }
      };
      req.onerror=()=>finish(req.error??new Error("Не удалось прочитать размер кэша"));
      tx.oncomplete=()=>finish();
      tx.onerror=()=>finish(tx.error??new Error("Не удалось измерить кэш"));
      tx.onabort=()=>finish(tx.error??new Error("Измерение кэша прервано"));
    });
  }finally{db.close();}
}
/** Clear only disposable previews, and commit them as one transaction.
 * On a lost Android WebView callback, cancel that transaction instead of
 * allowing a background deletion to continue after Settings reports failure.
 */
export async function clearPreviewCache():Promise<number>{
  const db=await previewCache();
  try{
    await new Promise<void>((resolve,reject)=>{
      let tx:IDBTransaction;
      try{
        tx=db.transaction(["proxies","proxy-meta"],"readwrite");
        tx.objectStore("proxies").clear();
        tx.objectStore("proxy-meta").clear();
      }catch(error){reject(error);return;}
      let settled=false;
      const cleanup=()=>{
        clearTimeout(timer);
        tx.oncomplete=null;tx.onerror=null;tx.onabort=null;
      };
      const finish=(error?:unknown)=>{
        if(settled)return;
        settled=true;
        cleanup();
        if(error!==undefined)reject(error);else resolve();
      };
      const timer=setTimeout(()=>{
        // A transaction that just committed cannot be rolled back. Report
        // uncertainty rather than claiming that user videos were deleted.
        finish(new Error("Clear previews: timeout"));
        try{tx.abort();}catch{/* already committed */}
      },7000);
      tx.oncomplete=()=>finish();
      tx.onerror=()=>finish(tx.error??new Error("Не удалось очистить кэш"));
      tx.onabort=()=>finish(tx.error??new Error("Очистка кэша прервана"));
    });
  }finally{db.close();}
  // Do not announce a completed cache reset until IndexedDB committed.
  analysisCache.clear();thumbCache.clear();
  window.dispatchEvent(new Event("multicam-preview-cache-cleared"));
  return 0;
}
