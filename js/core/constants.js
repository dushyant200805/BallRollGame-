/* Ball Path — shared constants (directions, tile types). */
(function (BP) {
  'use strict';

  // Direction bitmask: a pipe's openings are stored as an OR of these bits.
  const DIR = Object.freeze({ N: 1, E: 2, S: 4, W: 8 });

  const DIRS = Object.freeze([
    Object.freeze({ bit: DIR.N, dx: 0, dy: -1, name: 'n' }),
    Object.freeze({ bit: DIR.E, dx: 1, dy: 0, name: 'e' }),
    Object.freeze({ bit: DIR.S, dx: 0, dy: 1, name: 's' }),
    Object.freeze({ bit: DIR.W, dx: -1, dy: 0, name: 'w' }),
  ]);

  const DIR_BY_BIT = { 1: DIRS[0], 2: DIRS[1], 4: DIRS[2], 8: DIRS[3] };
  const DIR_BY_NAME = { n: DIRS[0], e: DIRS[1], s: DIRS[2], w: DIRS[3] };
  const OPPOSITE = { 1: 4, 2: 8, 4: 1, 8: 2 };

  const TILE = Object.freeze({
    EMPTY: 'empty', // open slot tiles can slide into
    PIPE: 'pipe',   // pipe piece (openings mask may be 0 = plain wooden block)
    START: 'start', // ball spawns here, one exit
    END: 'end',     // destination, one entry
    BLOCK: 'block', // immovable stone
  });

  BP.DIR = DIR;
  BP.DIRS = DIRS;
  BP.dirByBit = (bit) => DIR_BY_BIT[bit];
  BP.dirByName = (name) => DIR_BY_NAME[name];
  BP.opposite = (bit) => OPPOSITE[bit];
  BP.bitCount = (mask) => ((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1));
  BP.TILE = TILE;
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
