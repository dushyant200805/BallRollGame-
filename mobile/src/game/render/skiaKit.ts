/** Small helpers over the Skia imperative API so the drawing code reads like the original Canvas 2D code. */
import {
  BlurStyle,
  ClipOp,
  PaintStyle,
  Skia,
  StrokeCap,
  TileMode,
  type SkCanvas,
  type SkColor,
  type SkPaint,
  type SkPath,
  type SkRRect,
} from '@shopify/react-native-skia';

const colorCache = new Map<string, SkColor>();
export function color(c: string): SkColor {
  let v = colorCache.get(c);
  if (!v) {
    v = Skia.Color(c);
    colorCache.set(c, v);
  }
  return v;
}

export function fillPaint(c: string | null, alpha = 1): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Fill);
  if (c) p.setColor(color(c));
  if (alpha !== 1) p.setAlphaf(alpha);
  return p;
}

export function strokePaint(c: string | null, width: number, cap: StrokeCap = StrokeCap.Butt): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(width);
  p.setStrokeCap(cap);
  if (c) p.setColor(color(c));
  return p;
}

export function blur(p: SkPaint, sigma: number): SkPaint {
  p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, Math.max(0.1, sigma), true));
  return p;
}

export function linear(x0: number, y0: number, x1: number, y1: number, colors: string[], pos: number[] | null = null) {
  return Skia.Shader.MakeLinearGradient({ x: x0, y: y0 }, { x: x1, y: y1 }, colors.map(color), pos, TileMode.Clamp);
}

/** Equivalent of Canvas 2D createRadialGradient(x0, y0, r0, x1, y1, r1). */
export function radial2(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, colors: string[], pos: number[] | null = null) {
  return Skia.Shader.MakeTwoPointConicalGradient({ x: x0, y: y0 }, r0, { x: x1, y: y1 }, r1, colors.map(color), pos, TileMode.Clamp);
}

export function rrect(x: number, y: number, w: number, h: number, r: number): SkRRect {
  return Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);
}

export function clipRRect(canvas: SkCanvas, rr: SkRRect) {
  canvas.clipRRect(rr, ClipOp.Intersect, true);
}

export function path(): SkPath {
  return Skia.Path.Make();
}

export { StrokeCap };
