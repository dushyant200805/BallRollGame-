/** Shared constants: directions and tile types (port of js/core/constants.js). */

/** Direction bitmask: a pipe's openings are stored as an OR of these bits. */
export const DIR = { N: 1, E: 2, S: 4, W: 8 } as const;
export type DirBit = 1 | 2 | 4 | 8;

export interface Dir {
  bit: DirBit;
  dx: number;
  dy: number;
  name: 'n' | 'e' | 's' | 'w';
}

export const DIRS: readonly Dir[] = [
  { bit: 1, dx: 0, dy: -1, name: 'n' },
  { bit: 2, dx: 1, dy: 0, name: 'e' },
  { bit: 4, dx: 0, dy: 1, name: 's' },
  { bit: 8, dx: -1, dy: 0, name: 'w' },
];

const DIR_BY_BIT: Record<number, Dir> = { 1: DIRS[0], 2: DIRS[1], 4: DIRS[2], 8: DIRS[3] };
const DIR_BY_NAME: Record<string, Dir> = { n: DIRS[0], e: DIRS[1], s: DIRS[2], w: DIRS[3] };
const OPPOSITE: Record<number, DirBit> = { 1: 4, 2: 8, 4: 1, 8: 2 };

export const dirByBit = (bit: number): Dir | undefined => DIR_BY_BIT[bit];
export const dirByName = (name: string): Dir | undefined => DIR_BY_NAME[name];
export const opposite = (bit: number): DirBit => OPPOSITE[bit];
export const bitCount = (mask: number): number =>
  (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);

export const TILE = {
  EMPTY: 'empty', // open slot tiles can slide into
  PIPE: 'pipe', //   pipe piece (openings mask may be 0 = plain wooden block)
  START: 'start', // ball spawns here, one exit
  END: 'end', //     destination, one entry
  BLOCK: 'block', // immovable stone
} as const;
export type TileType = (typeof TILE)[keyof typeof TILE];

/** t = type, o = openings mask (pipes) or exit/entry bit (start/end), f = fixed. */
export interface Tile {
  t: TileType;
  o: number;
  f: boolean;
}

export interface Move {
  x: number;
  y: number;
  dir: DirBit;
}

export interface MoveRecord extends Move {
  toX: number;
  toY: number;
}

export type GameMode = 'classic' | 'challenge' | 'timetrial' | 'daily';
export type LevelMode = Exclude<GameMode, 'daily'>;
