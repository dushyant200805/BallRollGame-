/* Ball Path — draws a ball skin (js/data/ball-skins.js) on a Canvas 2D context.
 * Used by the rolling ball on the board and by the Ball Collection previews.
 * `rot` is the rolling angle (radians) and (hx, hy) the heading, so bands, dots and
 * sweeps move as if painted on a rolling sphere.
 */
(function (BP) {
  'use strict';

  function drawBall(ctx, skin, x, y, rad, rot = 0.6, hx = 1, hy = 0, alpha = 1) {
    if (rad <= 0.5 || alpha <= 0.02) return;
    const heading = Math.atan2(hy, hx);
    ctx.save();
    ctx.globalAlpha = alpha;

    // glow halo behind the ball
    if (skin.halo) {
      const [color, size] = skin.halo;
      const g = ctx.createRadialGradient(x, y, rad * 0.6, x, y, rad * size);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad * size, 0, Math.PI * 2);
      ctx.fill();
    }

    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + rad * 0.15, y + rad * 0.55, rad * 0.95, rad * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.globalAlpha = alpha * (skin.alpha || 1);
    const body = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
    body.addColorStop(0, skin.body[0]);
    body.addColorStop(0.45, skin.body[1]);
    body.addColorStop(1, skin.body[2]);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;

    // surface patterns, clipped to the ball
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.clip();

    if (skin.sweep && ctx.createConicGradient) {
      const g = ctx.createConicGradient(rot * 0.5, x, y);
      skin.sweep.forEach((c, i) => g.addColorStop(i / (skin.sweep.length - 1), c));
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      ctx.globalAlpha = alpha;
    }

    // rolling bands: stripes that sweep across the ball along the heading
    (skin.bands || []).forEach((band) => {
      for (let b = 0; b < band.count * 2; b++) {
        const ph = rot + (b * Math.PI) / band.count;
        const vis = Math.sin(ph);
        if (vis <= 0) continue;
        const along = Math.cos(ph) * rad * 0.8;
        ctx.save();
        ctx.translate(x + hx * along, y + hy * along);
        ctx.rotate(heading);
        ctx.globalAlpha = alpha * vis;
        ctx.fillStyle = band.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, rad * band.width * vis + 0.5, rad * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

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
        ctx.globalAlpha = alpha * Math.min(1, vis * 1.4);
        ctx.fillStyle = dot.color;
        ctx.beginPath();
        ctx.arc(px, py, rad * dot.r * (0.55 + 0.45 * vis), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = alpha;
    ctx.restore();

    // twinkles: little four-point sparkles that blink as the ball rolls
    (skin.twinkle || []).forEach((tw) => {
      for (let i = 0; i < tw.n; i++) {
        const a = (i / tw.n) * Math.PI * 2 + 0.4;
        const tx = x + Math.cos(a) * rad * 0.5;
        const ty = y + Math.sin(a) * rad * 0.5;
        const k = Math.max(0, Math.sin(rot * 2 + i * 1.9));
        if (k < 0.05) continue;
        const s = rad * 0.22 * k;
        ctx.globalAlpha = alpha * k;
        ctx.fillStyle = tw.color;
        ctx.beginPath();
        ctx.moveTo(tx, ty - s); ctx.lineTo(tx + s * 0.25, ty - s * 0.25); ctx.lineTo(tx + s, ty);
        ctx.lineTo(tx + s * 0.25, ty + s * 0.25); ctx.lineTo(tx, ty + s); ctx.lineTo(tx - s * 0.25, ty + s * 0.25);
        ctx.lineTo(tx - s, ty); ctx.lineTo(tx - s * 0.25, ty - s * 0.25);
        ctx.closePath();
        ctx.fill();
      }
    });

    // specular highlight
    ctx.globalAlpha = alpha * (skin.spec == null ? 0.8 : skin.spec);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x - rad * 0.38, y - rad * 0.42, rad * 0.26, rad * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  BP.BallPainter = { drawBall };
})(window.BP = window.BP || {});
