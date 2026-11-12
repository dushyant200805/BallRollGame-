/* Ball Path — particle effects (confetti, sparkles, dust) drawn on the board canvas. */
(function (BP) {
  'use strict';

  const CONFETTI = ['#ff5d6c', '#ffd447', '#36d1c4', '#7c6cff', '#4cc38a', '#ff9f43'];

  class ParticleSystem {
    constructor() { this.items = []; }

    get active() { return this.items.length > 0; }

    burst(x, y, { count = 60, speed = 420, colors = CONFETTI, gravity = 900, life = 1.6, size = 8, shape = 'rect' } = {}) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.35 + Math.random() * 0.65);
        this.items.push({
          x, y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - speed * 0.45,
          g: gravity,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 14,
          size: size * (0.6 + Math.random() * 0.7),
          color: colors[(Math.random() * colors.length) | 0],
          life, max: life, shape,
        });
      }
    }

    sparkle(x, y, count = 12, color = '#fff6c9') {
      this.burst(x, y, { count, speed: 140, colors: [color, '#ffffff'], gravity: 0, life: 0.6, size: 4, shape: 'dot' });
    }

    dust(x, y, count = 6) {
      this.burst(x, y, { count, speed: 60, colors: ['rgba(255,236,200,0.7)'], gravity: -20, life: 0.4, size: 5, shape: 'dot' });
    }

    clear() { this.items.length = 0; }

    update(dt) {
      for (const p of this.items) {
        p.vy += p.g * dt;
        p.vx *= 1 - 0.9 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.life -= dt;
      }
      this.items = this.items.filter((p) => p.life > 0);
    }

    draw(ctx) {
      for (const p of this.items) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max * 0.4)));
        ctx.fillStyle = p.color;
        if (p.shape === 'dot') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  BP.ParticleSystem = ParticleSystem;
})(window.BP = window.BP || {});
