/** Serialize Activity TextureView operations while preserving caller errors.
 * A rejected native show must not poison subsequent hide/release operations.
 */
export function createSerializedAsyncActions() {
 let chain:Promise<void>=Promise.resolve();
 return (action:()=>Promise<void>):Promise<void>=>{
   const current=chain.then(action);
   chain=current.catch(()=>undefined);
   return current;
 };
}
