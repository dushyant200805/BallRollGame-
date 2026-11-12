/** Particle effects (confetti, sparkles) drawn on the board (port of js/game/fx.js). */
import type { SkCanvas } from '@shopify/react-native-skia';
import { fillPaint } from './skiaKit';

const CONFETTI = ['#ff5d6c', '#ffd447', '#36d1c4', '#7c6cff', '#4cc38a', '#ff9f43'];
const MAX_PARTICLES = 220;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  life: number;
  max: number;
  shape: 'rect' | 'dot';
}

export interface BurstOptions {
  count?: number;
  speed?: number;
  colors?: string[];
  gravity?: number;
  life?: number;
  size?: number;
  shape?: 'rect' | 'dot';
}

export class ParticleSystem {
  items: Particle[] = [];

  get active(): boolean {
    return this.items.length > 0;
  }

  burst(x: number, y: number, { count = 60, speed = 420, colors = CONFETTI, gravity = 900, life = 1.6, size = 8, shape = 'rect' }: BurstOptions = {}) {
    const room = Math.max(0, MAX_PARTICLES - this.items.length);
    for (let i = 0; i < Math.min(count, room); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.items.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.45,
        g: gravity,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 14,
        size: size * (0.6 + Math.random() * 0.7),
        color: colors[(Math.random() * colors.length) | 0],
        life,
        max: life,
        shape,
      });
    }
  }

  sparkle(x: number, y: number, count = 12, color = '#fff6c9') {
    this.burst(x, y, { count, speed: 140, colors: [color, '#ffffff'], gravity: 0, life: 0.6, size: 4, shape: 'dot' });
  }

  clear() {
    this.items.length = 0;
  }

  update(dt: number) {
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

  draw(canvas: SkCanvas) {
    for (const p of this.items) {
      const alpha = Math.max(0, Math.min(1, p.life / (p.max * 0.4)));
      const paint = fillPaint(p.color, alpha);
      if (p.shape === 'dot') {
        canvas.drawCircle(p.x, p.y, p.size / 2, paint);
      } else {
        canvas.save();
        canvas.translate(p.x, p.y);
        canvas.rotate((p.rot * 180) / Math.PI, 0, 0);
        canvas.drawRect({ x: -p.size / 2, y: -p.size / 4, width: p.size, height: p.size / 2 }, paint);
        canvas.restore();
      }
    }
  }
}
