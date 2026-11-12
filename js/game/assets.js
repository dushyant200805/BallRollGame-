/* Ball Path — image assets: loads the wooden tile renders, ball and star, and pre-builds
 * every tile look (rotations, bolted walnut, stone, start, goal) into cached canvases.
 * Tinting uses canvas blend modes only (no pixel reads), so it also works from file://.
 * Until the images arrive the renderer falls back to its procedural drawing.
 */
(function (BP) {
  'use strict';
  const { DIR } = BP;

  const BASE = 320; // sprite resolution (matches the processed tile images)
  const FILES = {
    v: 'assets/img/tile-straight-v.webp',
    h: 'assets/img/tile-straight-h.webp',
    nw: 'assets/img/tile-curve-nw.webp',
    sw: 'assets/img/tile-curve-sw.webp',
    blank: 'assets/img/tile-blank.webp',
    ball: 'assets/img/ball.webp',
    star: 'assets/img/star.webp',
  };

  const images = {};
  const sprites = new Map();
  let ready = false;

  function canvas() {
    const c = document.createElement('canvas');
    c.width = c.height = BASE;
    return c;
  }

  function flipped(img) {
    const c = canvas();
    const g = c.getContext('2d');
    g.translate(BASE, 0);
    g.scale(-1, 1);
    g.drawImage(img, 0, 0, BASE, BASE);
    return c;
  }

  /** Recolour wood with a blend mode while keeping the original alpha. */
  function tint(src, steps) {
    const c = canvas();
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, BASE, BASE);
    for (const [mode, color, alpha = 1] of steps) {
      g.globalCompositeOperation = mode;
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.fillRect(0, 0, BASE, BASE);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(src, 0, 0, BASE, BASE);
    return c;
  }

  const LOOKS = {
    maple: null,
    walnut: [['multiply', '#b98a68']],
    stone: [['saturation', '#808080'], ['multiply', '#c3ccd6']],
    start: [['hue', '#2fa864', 0.7], ['saturation', '#808080', 0.35]],
    end: [['hue', '#e9a91c', 0.55], ['saturation', '#808080', 0.2]],
  };

  /** Blank tile with a half pipe from the centre to one edge (start/goal stubs). */
  function stub(dirBit) {
    const c = canvas();
    const g = c.getContext('2d');
    g.drawImage(images.blank, 0, 0, BASE, BASE);
    const vertical = dirBit === DIR.N || dirBit === DIR.S;
    const src = vertical ? images.v : images.h;
    const half = BASE / 2, band = BASE * 0.17;
    g.save();
    g.beginPath();
    if (dirBit === DIR.E) g.rect(half, half - band, half, band * 2);
    if (dirBit === DIR.W) g.rect(0, half - band, half, band * 2);
    if (dirBit === DIR.N) g.rect(half - band, 0, band * 2, half);
    if (dirBit === DIR.S) g.rect(half - band, half, band * 2, half);
    g.clip();
    g.drawImage(src, 0, 0, BASE, BASE);
    g.restore();
    return c;
  }

  function pipeBase(mask) {
    switch (mask) {
      case DIR.E | DIR.W: return images.h;
      case DIR.N | DIR.S: return images.v;
      case DIR.N | DIR.W: return images.nw;
      case DIR.S | DIR.W: return images.sw;
      case DIR.N | DIR.E: return flipped(images.nw);
      case DIR.S | DIR.E: return flipped(images.sw);
      default: return images.blank;
    }
  }

  const Assets = {
    BASE,
    get ready() { return ready; },
    get images() { return images; },

    load() {
      const jobs = Object.entries(FILES).map(([key, url]) => new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => { images[key] = img; resolve(true); };
        img.onerror = () => resolve(false);
        img.src = url;
      }));
      return Promise.all(jobs).then((ok) => {
        ready = ok.every(Boolean);
        return ready;
      });
    },

    /**
     * Cached sprite for a tile.
     * @param {'pipe'|'start'|'end'|'block'} type
     * @param {number} mask  openings (pipe) or exit/entry bit (start/end)
     * @param {string} look  'maple' | 'walnut'
     */
    tile(type, mask, look = 'maple') {
      if (!ready) return null;
      const key = `${type}:${mask}:${look}`;
      let s = sprites.get(key);
      if (s) return s;
      if (type === 'pipe') {
        const base = pipeBase(mask);
        s = LOOKS[look] ? tint(base, LOOKS[look]) : base;
      } else if (type === 'block') {
        s = tint(images.blank, LOOKS.stone);
      } else if (type === 'start' || type === 'end') {
        s = tint(stub(mask), LOOKS[type]);
      }
      sprites.set(key, s);
      return s;
    },
  };

  BP.Assets = Assets;
})(window.BP = window.BP || {});
