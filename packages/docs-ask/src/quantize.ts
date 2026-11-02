/**
 * int8 storage for unit vectors. A 384-dim float32 vector is 1536 bytes; the
 * int8 form plus one scale is 388. Cosine over the dequantized vector stays
 * within ~1e-3 of the float result, far below the gap between neighbours.
 */
export interface Quantized {
  q: Int8Array;
  /** float = q * scale */
  scale: number;
}

export function quantize(vec: ArrayLike<number>): Quantized {
  let max = 0;
  for (let i = 0; i < vec.length; i++) max = Math.max(max, Math.abs(vec[i]!));
  const scale = max === 0 ? 1 : max / 127;
  const q = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) q[i] = Math.round(vec[i]! / scale);
  return { q, scale };
}

export function dequantize({ q, scale }: Quantized): Float32Array {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i]! * scale;
  return out;
}

export function toBase64(q: Int8Array): string {
  const bytes = new Uint8Array(q.buffer, q.byteOffset, q.byteLength);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export function fromBase64(b64: string): Int8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    return new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const s = atob(b64);
  const q = new Int8Array(s.length);
  for (let i = 0; i < s.length; i++) q[i] = (s.charCodeAt(i) << 24) >> 24;
  return q;
}
