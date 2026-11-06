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
export const analysisCache=new BoundedDerivedCache<string,{duration:number;peaks:number[]}>(128);
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
    request.onblocked=()=>reject(new Error("Кэш предпросмотра занят"));
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result;
      db.onversionchange=()=>db.close();
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
export async function readProxy(id:string):Promise<Blob|null>{
  const db=await previewCache();
  try {
    return await bounded(new Promise<Blob|null>((resolve,reject)=>{
      const tx=db.transaction(["proxies","proxy-meta"],"readwrite");
      const get=tx.objectStore("proxies").get(id);
      let value:Blob|null=null;
      get.onsuccess=()=>{
        if(get.result instanceof Blob){
          value=get.result;
          tx.objectStore("proxy-meta").put({id,size:value.size,touched:Date.now()} satisfies ProxyMetadata);
        }
      };
      tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error??new Error("Чтение кэша прервано"));
    }),5000,"Read proxy");
  }finally{db.close();}
}
export async function writeProxy(id:string,blob:Blob,signal?:AbortSignal):Promise<void>{
  // Do not persist oversized disposable previews. The original still plays.
  if(blob.size>CACHE_LIMIT_BYTES)return;
  const db=await previewCache();
  try {
    await bounded(new Promise<void>((resolve,reject)=>{
      if(signal?.aborted){reject(new Error("Proxy cancelled"));return;}
      const tx=db.transaction(["proxies","proxy-meta"],"readwrite");
      const previews=tx.objectStore("proxies");
      const meta=tx.objectStore("proxy-meta");
      const onAbort=()=>{try{tx.abort();}catch{/* commit already finished */}};
      signal?.addEventListener("abort",onAbort,{once:true});
      const detach=()=>signal?.removeEventListener("abort",onAbort);
      const get=meta.getAll();
      get.onsuccess=()=>{
        if(signal?.aborted){onAbort();return;}
        const next:ProxyMetadata={id,size:blob.size,touched:Date.now()};
        const evicted=chooseProxyEvictions(get.result as ProxyMetadata[],next);
        if(!evicted.includes(id)){
          previews.put(blob,id);
          meta.put(next);
        }
        for(const victim of evicted){previews.delete(victim);meta.delete(victim);}
      };
      tx.oncomplete=()=>{detach();resolve();};
      tx.onerror=()=>{detach();reject(tx.error);};
      tx.onabort=()=>{detach();reject(tx.error??new Error("Запись кэша прервана"));};
    }),7000,"Save proxy");
  }finally{db.close();}
}
export async function cacheBytes():Promise<number>{
  const db=await previewCache();
  try{
    return await bounded(new Promise<number>((resolve,reject)=>{
      const tx=db.transaction("proxy-meta","readonly");
      let size=0;
      const req=tx.objectStore("proxy-meta").openCursor();
      req.onsuccess=()=>{
        const cur=req.result;
        if(!cur)return;
        size+=(cur.value as ProxyMetadata).size;
        cur.continue();
      };
      tx.oncomplete=()=>resolve(size);
      tx.onerror=()=>reject(tx.error);
    }),5000,"Measure cache");
  }finally{db.close();}
}
export async function clearPreviewCache():Promise<number>{
  const db=await previewCache();
  try{
    await bounded(new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(["proxies","proxy-meta"],"readwrite");
      tx.objectStore("proxies").clear();
      tx.objectStore("proxy-meta").clear();
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error??new Error("Очистка кэша прервана"));
    }),7000,"Clear previews");
  }finally{db.close();}
  analysisCache.clear();thumbCache.clear();
  window.dispatchEvent(new Event("multicam-preview-cache-cleared"));
  return 0;
}
