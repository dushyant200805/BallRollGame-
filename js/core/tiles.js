/* Ball Path — Tile manager: tile factories and the level token format.
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
(function (BP) {
  'use strict';
  const { DIR, TILE } = BP;

  const PIPE_TOKENS = {
    '-': DIR.E | DIR.W,
    '|': DIR.N | DIR.S,
    'L': DIR.N | DIR.E,
    'J': DIR.N | DIR.W,
    '7': DIR.S | DIR.W,
    'F': DIR.S | DIR.E,
    'o': 0,
  };
  const MASK_TO_TOKEN = {};
  Object.keys(PIPE_TOKENS).forEach((k) => { MASK_TO_TOKEN[PIPE_TOKENS[k]] = k; });

  const Tiles = {
    empty: () => ({ t: TILE.EMPTY, o: 0, f: false }),
    block: () => ({ t: TILE.BLOCK, o: 0, f: true }),
    pipe: (mask, fixed = false) => ({ t: TILE.PIPE, o: mask, f: !!fixed }),
    start: (exitBit) => ({ t: TILE.START, o: exitBit, f: true }),
    end: (entryBit) => ({ t: TILE.END, o: entryBit, f: true }),

    isMovable: (tile) => !!tile && tile.t === TILE.PIPE && !tile.f,
    isEmpty: (tile) => !!tile && tile.t === TILE.EMPTY,

    STRAIGHTS: [DIR.E | DIR.W, DIR.N | DIR.S],
    CURVES: [DIR.N | DIR.E, DIR.N | DIR.W, DIR.S | DIR.W, DIR.S | DIR.E],

    parseToken(token) {
      if (token === '.') return Tiles.empty();
      if (token === '#') return Tiles.block();
      const head = token[0];
      if (head === 'S' || head === 'E') {
        const d = BP.dirByName(token[1]);
        if (!d) throw new Error('Bad start/end token: ' + token);
        return head === 'S' ? Tiles.start(d.bit) : Tiles.end(d.bit);
      }
      if (head in PIPE_TOKENS) {
        return Tiles.pipe(PIPE_TOKENS[head], token[1] === '*');
      }
      throw new Error('Unknown tile token: ' + token);
    },

    toToken(tile) {
      switch (tile.t) {
        case TILE.EMPTY: return '.';
        case TILE.BLOCK: return '#';
        case TILE.START: return 'S' + BP.dirByBit(tile.o).name;
        case TILE.END: return 'E' + BP.dirByBit(tile.o).name;
        case TILE.PIPE: {
          const tok = MASK_TO_TOKEN[tile.o];
          if (tok === undefined) throw new Error('Unsupported pipe mask: ' + tile.o);
          return tile.f ? tok + '*' : tok;
        }
        default: throw new Error('Unknown tile type: ' + tile.t);
      }
    },
  };

  BP.Tiles = Tiles;
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
