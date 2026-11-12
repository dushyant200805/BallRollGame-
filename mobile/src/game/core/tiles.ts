/** Tile factories and the level token format (port of js/core/tiles.js).
 *
 * Level grid token format (space separated, one string per row):
 *   .   empty slot            #   fixed stone block      o   movable plain block
 *   -   pipe E-W              |   pipe N-S
 *   L   pipe N-E              J   pipe N-W
 *   7   pipe S-W              F   pipe S-E
 *   suffix * on a pipe = fixed (cannot slide), e.g. "-*"
 *   Sx  start, ball exits towards x (n/e/s/w)
 *   Ex  end, ball enters from side x (n/e/s/w)
 */
import { DIR, TILE, Tile, dirByBit, dirByName } from './constants';

const PIPE_TOKENS: Record<string, number> = {
  '-': DIR.E | DIR.W,
  '|': DIR.N | DIR.S,
  L: DIR.N | DIR.E,
  J: DIR.N | DIR.W,
  '7': DIR.S | DIR.W,
  F: DIR.S | DIR.E,
  o: 0,
};
const MASK_TO_TOKEN: Record<number, string> = {};
Object.keys(PIPE_TOKENS).forEach((k) => {
  MASK_TO_TOKEN[PIPE_TOKENS[k]] = k;
});

export const Tiles = {
  empty: (): Tile => ({ t: TILE.EMPTY, o: 0, f: false }),
  block: (): Tile => ({ t: TILE.BLOCK, o: 0, f: true }),
  pipe: (mask: number, fixed = false): Tile => ({ t: TILE.PIPE, o: mask, f: !!fixed }),
  start: (exitBit: number): Tile => ({ t: TILE.START, o: exitBit, f: true }),
  end: (entryBit: number): Tile => ({ t: TILE.END, o: entryBit, f: true }),

  isMovable: (tile: Tile | null | undefined): boolean => !!tile && tile.t === TILE.PIPE && !tile.f,
  isEmpty: (tile: Tile | null | undefined): boolean => !!tile && tile.t === TILE.EMPTY,

  STRAIGHTS: [DIR.E | DIR.W, DIR.N | DIR.S],
  CURVES: [DIR.N | DIR.E, DIR.N | DIR.W, DIR.S | DIR.W, DIR.S | DIR.E],

  parseToken(token: string): Tile {
    if (token === '.') return Tiles.empty();
    if (token === '#') return Tiles.block();
    const head = token[0];
    if (head === 'S' || head === 'E') {
      const d = dirByName(token[1]);
      if (!d) throw new Error('Bad start/end token: ' + token);
      return head === 'S' ? Tiles.start(d.bit) : Tiles.end(d.bit);
    }
    if (head in PIPE_TOKENS) return Tiles.pipe(PIPE_TOKENS[head], token[1] === '*');
    throw new Error('Unknown tile token: ' + token);
  },

  toToken(tile: Tile): string {
    switch (tile.t) {
      case TILE.EMPTY:
        return '.';
      case TILE.BLOCK:
        return '#';
      case TILE.START:
        return 'S' + dirByBit(tile.o)!.name;
      case TILE.END:
        return 'E' + dirByBit(tile.o)!.name;
      case TILE.PIPE: {
        const tok = MASK_TO_TOKEN[tile.o];
        if (tok === undefined) throw new Error('Unsupported pipe mask: ' + tile.o);
        return tile.f ? tok + '*' : tok;
      }
      default:
        throw new Error('Unknown tile type: ' + (tile as Tile).t);
    }
  },
};
