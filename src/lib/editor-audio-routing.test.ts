import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {sharedEditorVideoAudioIds} from "./editor-audio-routing";

describe("single decoder for original video + original audio in Editor",()=>{
  const visible=[{id:"camera1",mediaId:"recording1",reverse:false}];
  const audible=[{id:"camera1",kind:"video" as const}];
  it("shares a single original decoder for visible audible video",()=>{
    expect([...sharedEditorVideoAudioIds(visible,audible,{})]).toEqual(["camera1"]);
    const editor=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
    expect(editor).toContain("const sharedVideoAudioIds = useMemo(");
    expect(editor).toContain("!sharedVideoAudioIds.has(i.id)");
    expect(editor).toContain("audioEnabled={sharedVideoAudioIds.has(i.id)}");
    const player=readFileSync("src/components/multicam/EditorVideoLayer.tsx","utf8");
    expect(player).toContain("v.muted=!audioEnabled");
    expect(player).toContain("muted={!audioEnabled} playsInline");
  });
  it("keeps ORIGINAL audio separately whenever preview uses a silent proxy",()=>{
    expect(sharedEditorVideoAudioIds(visible,audible,{recording1:"blob:silent-proxy"}).size).toBe(0);
  });
  it("preserves sound of hidden/unselected video, standalone audio, mute and detached audio",()=>{
    expect(sharedEditorVideoAudioIds([] ,audible,{}).size).toBe(0);
    expect(sharedEditorVideoAudioIds(visible,[],{}).size).toBe(0);
    expect(sharedEditorVideoAudioIds(visible,[{id:"a1",kind:"audio"}],{}).size).toBe(0);
    expect(sharedEditorVideoAudioIds([{...visible[0]!,reverse:true}],audible,{}).size).toBe(0);
  });
  it("deduplicates two simultaneous original-video sound lanes without touching other audio",()=>{
    const layers=[...visible,{id:"camera2",mediaId:"recording2",reverse:false}];
    const sounds=[...audible,{id:"camera2",kind:"video" as const},{id:"voice",kind:"audio" as const}];
    expect([...sharedEditorVideoAudioIds(layers,sounds,{})]).toEqual(["camera1","camera2"]);
    expect([...sharedEditorVideoAudioIds(layers,sounds,{recording2:"blob:proxy"})]).toEqual(["camera1"]);
    const editor=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
    expect(editor).toContain('src={mediaById.get(i.mediaId)?.url}');
    expect(editor).toContain("{activeAudible.map((i) => <audio");
    expect(editor).toContain("for (const i of audible)");
  });
});
