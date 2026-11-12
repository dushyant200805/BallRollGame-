/** Pipe geometry shared by the renderer (drawing pipes) and the ball (rolling along them).
 * Port of js/game/geometry.js. A pipe segment inside a cell runs from the entry edge midpoint
 * to the exit edge midpoint: a straight line for opposite edges, a quarter arc otherwise.
 * inBit = 0 means "starts at the cell centre" (start tile); outBit = 0 means "ends at the centre".
 */
import type { SkPath } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { DIR, opposite } from '../core/constants';

export interface Pt {
  x: number;
  y: number;
}

export function edgePoint(x0: number, y0: number, s: number, bit: number): Pt {
  switch (bit) {
    case DIR.N:
      return { x: x0 + s / 2, y: y0 };
    case DIR.E:
      return { x: x0 + s, y: y0 + s / 2 };
    case DIR.S:
      return { x: x0 + s / 2, y: y0 + s };
    case DIR.W:
      return { x: x0, y: y0 + s / 2 };
    default:
      return { x: x0 + s / 2, y: y0 + s / 2 };
  }
}

const isCurve = (a: number, b: number) => !!a && !!b && opposite(a) !== b;

function corner(x0: number, y0: number, s: number, a: number, b: number): Pt {
  const m = a | b;
  return { x: m & DIR.E ? x0 + s : x0, y: m & DIR.N ? y0 : y0 + s };
}

function arcAngles(x0: number, y0: number, s: number, a: number, b: number) {
  const c = corner(x0, y0, s, a, b);
  const pa = edgePoint(x0, y0, s, a);
  const pb = edgePoint(x0, y0, s, b);
  const a1 = Math.atan2(pa.y - c.y, pa.x - c.x);
  const a2 = Math.atan2(pb.y - c.y, pb.x - c.x);
  let diff = a2 - a1;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff <= -Math.PI) diff += Math.PI * 2;
  return { c, a1, diff };
}

const DEG = 180 / Math.PI;

export function segmentLength(inBit: number, outBit: number, s: number): number {
  if (!inBit || !outBit) return s / 2;
  return isCurve(inBit, outBit) ? (Math.PI * s) / 4 : s;
}

/** Point at fraction t (0..1) along the segment. */
export function segmentPoint(x0: number, y0: number, s: number, inBit: number, outBit: number, t: number): Pt {
  if (isCurve(inBit, outBit)) {
    const { c, a1, diff } = arcAngles(x0, y0, s, inBit, outBit);
    const ang = a1 + diff * t;
    return { x: c.x + Math.cos(ang) * (s / 2), y: c.y + Math.sin(ang) * (s / 2) };
  }
  const p0 = edgePoint(x0, y0, s, inBit);
  const p1 = edgePoint(x0, y0, s, outBit);
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
}

/** A pipe's centreline as a Skia path. */
export function pipePath(x0: number, y0: number, s: number, a: number, b: number): SkPath {
  const path = Skia.Path.Make();
  if (isCurve(a, b)) {
    const { c, a1, diff } = arcAngles(x0, y0, s, a, b);
    const r = s / 2;
    path.addArc(Skia.XYWHRect(c.x - r, c.y - r, r * 2, r * 2), a1 * DEG, diff * DEG);
  } else {
    const p0 = edgePoint(x0, y0, s, a);
    const p1 = edgePoint(x0, y0, s, b);
    path.moveTo(p0.x, p0.y);
    path.lineTo(p1.x, p1.y);
  }
  return path;
}

/** Split a 2-opening mask into its two bits. */
export function splitMask(mask: number): number[] {
  const bits: number[] = [];
  [DIR.N, DIR.E, DIR.S, DIR.W].forEach((b) => {
    if (mask & b) bits.push(b);
  });
  return bits;
}
