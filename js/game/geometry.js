/* Ball Path — pipe geometry shared by the renderer (drawing pipes) and the ball (rolling along them).
 * A pipe segment inside a cell runs from the entry edge midpoint to the exit edge midpoint:
 * a straight line for opposite edges, a quarter arc around the shared corner otherwise.
 * inBit = 0 means "starts at the cell centre" (start tile); outBit = 0 means "ends at the centre" (end tile).
 */
(function (BP) {
  'use strict';
  const { DIR } = BP;

  function edgePoint(x0, y0, s, bit) {
    switch (bit) {
      case DIR.N: return { x: x0 + s / 2, y: y0 };
      case DIR.E: return { x: x0 + s, y: y0 + s / 2 };
      case DIR.S: return { x: x0 + s / 2, y: y0 + s };
      case DIR.W: return { x: x0, y: y0 + s / 2 };
      default: return { x: x0 + s / 2, y: y0 + s / 2 };
    }
  }

  function isCurve(a, b) { return a && b && BP.opposite(a) !== b; }

  function corner(x0, y0, s, a, b) {
    const m = a | b;
    return { x: m & DIR.E ? x0 + s : x0, y: m & DIR.N ? y0 : y0 + s };
  }

  function arcAngles(x0, y0, s, a, b) {
    const c = corner(x0, y0, s, a, b);
    const pa = edgePoint(x0, y0, s, a), pb = edgePoint(x0, y0, s, b);
    const a1 = Math.atan2(pa.y - c.y, pa.x - c.x);
    let a2 = Math.atan2(pb.y - c.y, pb.x - c.x);
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff <= -Math.PI) diff += Math.PI * 2;
    return { c, a1, diff };
  }

  const Geometry = {
    edgePoint,

    segmentLength(inBit, outBit, s) {
      if (!inBit || !outBit) return s / 2;
      return isCurve(inBit, outBit) ? (Math.PI * s) / 4 : s;
    },

    /** Point at fraction t (0..1) along the segment. */
    segmentPoint(x0, y0, s, inBit, outBit, t) {
      if (isCurve(inBit, outBit)) {
        const { c, a1, diff } = arcAngles(x0, y0, s, inBit, outBit);
        const ang = a1 + diff * t;
        return { x: c.x + Math.cos(ang) * (s / 2), y: c.y + Math.sin(ang) * (s / 2) };
      }
      const p0 = edgePoint(x0, y0, s, inBit);
      const p1 = edgePoint(x0, y0, s, outBit);
      return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
    },

    /** Add a pipe's centreline to the current canvas path. */
    tracePipe(ctx, x0, y0, s, a, b) {
      if (isCurve(a, b)) {
        const { c, a1, diff } = arcAngles(x0, y0, s, a, b);
        const p = edgePoint(x0, y0, s, a);
        ctx.moveTo(p.x, p.y);
        ctx.arc(c.x, c.y, s / 2, a1, a1 + diff, diff < 0);
      } else {
        const p0 = edgePoint(x0, y0, s, a), p1 = edgePoint(x0, y0, s, b);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
      }
    },

    /** Split a 2-opening mask into its two bits. */
    splitMask(mask) {
      const bits = [];
      [DIR.N, DIR.E, DIR.S, DIR.W].forEach((b) => { if (mask & b) bits.push(b); });
      return bits;
    },
  };

  BP.Geometry = Geometry;
})(window.BP = window.BP || {});
