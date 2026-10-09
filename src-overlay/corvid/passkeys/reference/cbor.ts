// Minimal CBOR encoder: only what the WebAuthn authenticator emits (uint, nint, bstr, tstr, map, array).
export type Cbor = number | Uint8Array | string | Cbor[] | Map<number | string, Cbor>;

function head(major: number, n: number, out: number[]) {
  if (n < 24) out.push((major << 5) | n);
  else if (n < 256) out.push((major << 5) | 24, n);
  else if (n < 65536) out.push((major << 5) | 25, n >> 8, n & 255);
  else throw new Error('cbor: length too large for this encoder');
}

export function cborEncode(v: Cbor, out: number[] = []): Uint8Array {
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error('cbor: ints only');
    if (v >= 0) head(0, v, out); else head(1, -1 - v, out);
  } else if (typeof v === 'string') {
    const b = new TextEncoder().encode(v); head(3, b.length, out); for (const x of b) out.push(x);
  } else if (v instanceof Uint8Array) {
    head(2, v.length, out); for (const x of v) out.push(x);
  } else if (Array.isArray(v)) {
    head(4, v.length, out); v.forEach(x => cborEncode(x, out));
  } else {
    head(5, v.size, out);
    for (const [k, x] of v) { cborEncode(k, out); cborEncode(x, out); }
  }
  return Uint8Array.from(out);
}
