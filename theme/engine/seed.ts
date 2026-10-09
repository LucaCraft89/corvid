// Seed derivation from wallpaper/image pixels (ARGB ints) using MCU quantizer + scorer.
import { QuantizerCelebi, Score, hexFromArgb } from '@material/material-color-utilities';
import { DEFAULT_SEED } from './scheme.ts';

/** Pick a seed color from image pixels (ARGB ints, alpha ignored below 255). */
export function seedFromPixels(argbPixels: number[], fallback = DEFAULT_SEED): string {
  const opaque = argbPixels.filter((p) => ((p >>> 24) & 0xff) === 255);
  if (opaque.length === 0) return fallback;
  const quantized = QuantizerCelebi.quantize(opaque, 128);
  const ranked = Score.score(quantized, { desired: 1 });
  return ranked.length ? hexFromArgb(ranked[0]!).toLowerCase() : fallback;
}
