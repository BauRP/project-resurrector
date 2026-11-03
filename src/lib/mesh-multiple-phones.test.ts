import { afterEach, describe, expect, it } from "vitest";
import { Mesh } from "./mesh";
import { RemoteRecordGuard } from "./remote-record-guard";
import type { MulticamState } from "./multicam-store";
import type { MeshMessage } from "./mesh";

/** Two linked fake transport objects deliver real serialized messages to
 * independent production Mesh instances. This tests the orchestration layer,
 * not physical Wi-Fi/ICE reliability or frame-level synchronization.
 */
function linkedChannels(): [RTCDataChannel, RTCDataChannel] {
  type Channel = {
    readyState: "open" | "closed";
    onopen: (()=>void) | null;
    onmessage: ((event:{data:string})=>void) | null;
    onclose: (()=>void) | null;
    send: (data:string)=>void;
    close: ()=>void;
  };
  const a:Channel={
    readyState:"open",onopen:null,onmessage:null,onclose:null,
    send(data){if(this.readyState==="open" && b.readyState==="open")b.onmessage?.({data});},
    close(){if(this.readyState==="closed")return;this.readyState="closed";this.onclose?.();},
  };
  const b:Channel={
    readyState:"open",onopen:null,onmessage:null,onclose:null,
    send(data){if(this.readyState==="open" && a.readyState==="open")a.onmessage?.({data});},
    close(){if(this.readyState==="closed")return;this.readyState="closed";this.onclose?.();},
  };
  return [a as unknown as RTCDataChannel,b as unknown as RTCDataChannel];
}
const link=(a:Mesh,b:Mesh)=>{
  const [one,two]=linkedChannels();
  (a as unknown as {wire:(c:RTCDataChannel)=>void}).wire(one);
  (b as unknown as {wire:(c:RTCDataChannel)=>void}).wire(two);
  return [one,two] as const;
};

const all:Mesh[]=[];
const node=(id:string)=>{
  const mesh=new Mesh();
  mesh.selfId=id;
  all.push(mesh);
  return mesh;
};
afterEach(()=>{
  all.splice(0).forEach(m=>m.leave());
});

describe("independent two-camera director commands over actual Mesh message routing",()=>{
  it("keeps each camera receipt independent when the other recorder fails or disconnects",async()=>{
    const director=node("director"),first=node("cam_one"),second=node("cam_two");
    const [directorOne]=link(director,first);
    const [directorTwo]=link(director,second);
    await first.sendTelemetry();
    await second.sendTelemetry();
    await director.sendTelemetry();

    expect(director.peers.size).toBe(2);
    expect(first.peers.has("director")).toBe(true);
    expect(second.peers.has("director")).toBe(true);

    const firstGuard=new RemoteRecordGuard(),secondGuard=new RemoteRecordGuard();
    const base=():Pick<MulticamState,"role"|"tab"|"captureKind"|"recording"|"recordingPhase">=>({
      role:"slave",tab:"camera",captureKind:"video",recording:false,recordingPhase:"idle",
    });
    let stateOne=base(),stateTwo=base();
    let oneCommands=0,twoCommands=0;
    const cameraReceiver=(
      camera:Mesh,guard:RemoteRecordGuard,
      update:(patch:ReturnType<RemoteRecordGuard["accept"]>)=>void,
    )=>camera.onMessage(message=>{
      if(message.type!=="record")return;
      const state=camera===first?stateOne:stateTwo;
      const patch=guard.accept(message,state,camera.peers.has(message.from));
      if(!patch)return;
      update(patch);
      camera.send({type:"record-result",from:camera.selfId,to:message.from,
        at:message.at,status:"received"});
    });
    const offOne=cameraReceiver(first,firstGuard,p=>{
      oneCommands++;stateOne={...stateOne,...p};
    });
    const offTwo=cameraReceiver(second,secondGuard,p=>{
      twoCommands++;stateTwo={...stateTwo,...p};
    });
    try{
      // Before START there is no valid request for a camera to acknowledge.
      first.send({type:"record-result",from:first.selfId,to:director.selfId,
        at:99,status:"saved"});
      expect(director.peers.get("cam_one")?.recordStatus).toBeUndefined();
      director.send({type:"record",from:director.selfId,on:true,at:100});
      expect([oneCommands,twoCommands]).toEqual([1,1]);
      expect(director.peers.get("cam_one")?.recordStatus).toBe("received");
      expect(director.peers.get("cam_two")?.recordStatus).toBe("received");

      first.send({type:"record-result",from:first.selfId,to:director.selfId,
        at:100,status:"recording"});
      second.send({type:"record-result",from:second.selfId,to:director.selfId,
        at:100,status:"recording"});
      expect(director.peers.get("cam_one")?.recording).toBe(true);
      expect(director.peers.get("cam_two")?.recording).toBe(true);

      first.send({type:"record-result",from:first.selfId,to:director.selfId,
        at:100,status:"saved"});
      second.send({type:"record-result",from:second.selfId,to:director.selfId,
        at:100,status:"error"});
      first.send({type:"record-result",from:first.selfId,to:director.selfId,
        at:100,status:"received"});
      expect(director.peers.get("cam_one")?.recordStatus).toBe("saved");
      expect(director.peers.get("cam_two")?.recordStatus).toBe("error");
      // A new command retires the old saved/error badges for BOTH cameras.
      director.send({type:"record",from:director.selfId,on:false,at:101});
      expect(director.peers.get("cam_one")?.recordStatus).toBeUndefined();
      expect(director.peers.get("cam_two")?.recordStatus).toBeUndefined();
      first.send({type:"record-result",from:first.selfId,to:director.selfId,
        at:100,status:"saved"});
      expect(director.peers.get("cam_one")?.recordStatus).toBeUndefined();

      directorTwo.close();
      expect(director.peers.has("cam_two")).toBe(false);
      expect(director.peers.get("cam_one")?.recordStatus).toBe("saved");
      expect((directorOne as RTCDataChannel).readyState).toBe("open");
    }finally{offOne();offTwo();}
  });
});
