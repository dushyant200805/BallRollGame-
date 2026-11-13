/** Draws a ball skin with React Native Skia. Port of the web js/game/ball-painter.js, so a
 * skin looks the same on both platforms. `rot` is the rolling angle (radians) and (hx, hy)
 * the heading: bands, dots and sweeps move as if painted on a rolling sphere.
 */
import { ClipOp, Skia, TileMode, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import type { BallSkin } from '../data/ballSkins';
import { color, fillPaint, radial2 } from './skiaKit';

const DEG = 180 / Math.PI;

export function drawBall(c: SkCanvas, skin: BallSkin, x: number, y: number, rad: number, rot = 0.6, hx = 1, hy = 0, alpha = 1) {
  if (rad <= 0.5 || alpha <= 0.02) return;
  const heading = Math.atan2(hy, hx) * DEG;
  const layer = Skia.Paint();
  layer.setAlphaf(alpha);
  c.saveLayer(layer);

  // glow halo behind the ball
  if (skin.halo) {
    const [col, size] = skin.halo;
    const halo = fillPaint(null);
    halo.setShader(radial2(x, y, rad * 0.6, x, y, rad * size, [col, 'rgba(0,0,0,0)']));
    c.drawCircle(x, y, rad * size, halo);
  }

  // contact shadow
  c.drawOval(Skia.XYWHRect(x + rad * 0.15 - rad * 0.95, y + rad * 0.55 - rad * 0.5, rad * 1.9, rad), fillPaint('rgba(0,0,0,0.35)'));

  // body
  const body = fillPaint(null);
  body.setShader(radial2(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad, skin.body, [0, 0.45, 1]));
  if (skin.alpha) body.setAlphaf(skin.alpha);
  c.drawCircle(x, y, rad, body);

  // surface patterns, clipped to the ball
  c.save();
  const clip = Skia.Path.Make();
  clip.addCircle(x, y, rad);
  c.clipPath(clip, ClipOp.Intersect, true);

  if (skin.sweep) {
    const sweep = fillPaint(null, 0.55);
    const colors = skin.sweep.map(color);
    const pos = skin.sweep.map((_, i) => i / (skin.sweep!.length - 1));
    const m = Skia.Matrix();
    m.translate(x, y);
    m.rotate(rot * 0.5);
    m.translate(-x, -y);
    sweep.setShader(Skia.Shader.MakeSweepGradient(x, y, colors, pos, TileMode.Clamp, m));
    c.drawRect(Skia.XYWHRect(x - rad, y - rad, rad * 2, rad * 2), sweep);
  }

  // rolling bands: stripes that sweep across the ball along the heading
  for (const band of skin.bands || []) {
    for (let b = 0; b < band.count * 2; b++) {
      const ph = rot + (b * Math.PI) / band.count;
      const vis = Math.sin(ph);
      if (vis <= 0) continue;
      const along = Math.cos(ph) * rad * 0.8;
      const ew = rad * band.width * vis + 0.5;
      const eh = rad * 0.95;
      c.save();
      c.translate(x + hx * along, y + hy * along);
      c.rotate(heading, 0, 0);
      c.drawOval(Skia.XYWHRect(-ew, -eh, ew * 2, eh * 2), fillPaint(band.color, vis));
      c.restore();
    }
  }

  // rolling dots (football patches, stone flecks, galaxy stars, embers)
  (skin.dots || []).forEach((dot, set) => {
    for (let i = 0; i < dot.n; i++) {
      const ph = rot + (i * Math.PI * 2) / dot.n + set * 0.7;
      const vis = Math.sin(ph);
      if (vis <= 0) continue;
      const along = Math.cos(ph) * rad * 0.75;
      const side = ((i % 3) - 1) * rad * 0.45;
      const px = x + hx * along - hy * side;
      const py = y + hy * along + hx * side;
      c.drawCircle(px, py, rad * dot.r * (0.55 + 0.45 * vis), fillPaint(dot.color, Math.min(1, vis * 1.4)));
    }
  });
  c.restore();

  // twinkles: little four-point sparkles that blink as the ball rolls
  for (const tw of skin.twinkle || []) {
    for (let i = 0; i < tw.n; i++) {
      const a = (i / tw.n) * Math.PI * 2 + 0.4;
      const tx = x + Math.cos(a) * rad * 0.5;
      const ty = y + Math.sin(a) * rad * 0.5;
      const k = Math.max(0, Math.sin(rot * 2 + i * 1.9));
      if (k < 0.05) continue;
      const s = rad * 0.22 * k;
      const p = Skia.Path.Make();
      p.moveTo(tx, ty - s); p.lineTo(tx + s * 0.25, ty - s * 0.25); p.lineTo(tx + s, ty);
      p.lineTo(tx + s * 0.25, ty + s * 0.25); p.lineTo(tx, ty + s); p.lineTo(tx - s * 0.25, ty + s * 0.25);
      p.lineTo(tx - s, ty); p.lineTo(tx - s * 0.25, ty - s * 0.25);
      p.close();
      c.drawPath(p, fillPaint(tw.color, k));
    }
  }

  // specular highlight
  c.save();
  c.translate(x - rad * 0.38, y - rad * 0.42);
  c.rotate(-0.6 * DEG, 0, 0);
  c.drawOval(Skia.XYWHRect(-rad * 0.26, -rad * 0.16, rad * 0.52, rad * 0.32), fillPaint('#ffffff', skin.spec == null ? 0.8 : skin.spec));
  c.restore();
  c.restore(); // layer
}

/** A still picture of a skin for the Ball Collection cards (size × size points). */
export function ballPicture(skin: BallSkin, size: number, rot = 0.6): SkPicture {
  const rec = Skia.PictureRecorder();
  const c = rec.beginRecording(Skia.XYWHRect(0, 0, size, size));
  drawBall(c, skin, size / 2, size / 2 - size * 0.04, size * 0.33, rot, 1, 0, 1);
  return rec.finishRecordingAsPicture();
}
