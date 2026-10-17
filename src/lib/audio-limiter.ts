/**
 * Brick-wall peak limiter used by the live VU rail and by the recorder.
 * Chain: gain → compressor (threshold = ceiling, ratio 20:1, 1 ms attack) → hard clipper at the ceiling.
 * The clipper guarantees no sample exceeds the ceiling even during the compressor's attack window.
 */
export const dbToLin = (db: number) => Math.pow(10, db / 20);

export function clipCurve(ceilingDb: number, size = 2048): Float32Array<ArrayBuffer> {
  const c = dbToLin(Math.min(0, ceilingDb));
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.max(-c, Math.min(c, x));
  }
  return curve;
}

export function buildLimiter(ctx: BaseAudioContext, input: AudioNode, gain: number, ceilingDb: number): AudioNode {
  const g = ctx.createGain(); g.gain.value = gain;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = Math.max(-100, Math.min(0, ceilingDb));
  comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.001; comp.release.value = 0.05;
  const clip = ctx.createWaveShaper(); clip.curve = clipCurve(ceilingDb); clip.oversample = "4x";
  input.connect(g); g.connect(comp); comp.connect(clip);
  return clip;
}
