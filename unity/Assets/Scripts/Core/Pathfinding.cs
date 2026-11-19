// Ball Roll — path tracing and BFS solver. Port of js/core/pathfinding.js.
//   Trace(): follows the pipe network from the start tile and reports where the ball goes.
//   Solve(): breadth-first search over board states for the shortest sequence of slides that
//            connects start to end (hints, par, solvability).
using System;
using System.Collections.Generic;

namespace BallRoll.Core
{
    public struct PathStep
    {
        public int X, Y, InBit, OutBit;
        public PathStep(int x, int y, int inBit, int outBit) { X = x; Y = y; InBit = inBit; OutBit = outBit; }
    }

    public enum FailReason { None, Edge, WrongSide, Gap, Blocked, Loop }

    public sealed class TraceResult
    {
        public bool Ok;
        public List<PathStep> Path = new List<PathStep>();
        public FailReason Fail;
        public int FailX, FailY;
    }

    public sealed class SolveResult
    {
        /// <summary>null = no solution found (unsolvable, or search budget exhausted).</summary>
        public List<Move> Moves;
        public int Explored;
        public bool Exhausted;
    }

    public static class Pathfinding
    {
        public static TraceResult TraceWith(int w, int h, Func<int, int, Tile> getTile, int sx, int sy)
        {
            var res = new TraceResult();
            var startTile = getTile(sx, sy);
            res.Path.Add(new PathStep(sx, sy, 0, startTile.Openings));
            int x = sx, y = sy, outBit = startTile.Openings;
            int maxSteps = w * h + 1;
            for (int step = 0; step < maxSteps; step++)
            {
                var d = Dir.ByBit(outBit);
                int nx = x + d.Dx, ny = y + d.Dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) return Failed(res, nx, ny, FailReason.Edge);
                var tile = getTile(nx, ny);
                int need = Dir.Opposite(outBit);
                if (tile.Type == TileType.End)
                {
                    if (tile.Openings == need)
                    {
                        res.Path.Add(new PathStep(nx, ny, need, 0));
                        res.Ok = true;
                        return res;
                    }
                    return Failed(res, nx, ny, FailReason.WrongSide);
                }
                if (tile.Type == TileType.Pipe && (tile.Openings & need) != 0 && Dir.BitCount(tile.Openings) == 2)
                {
                    int next = tile.Openings & ~need;
                    res.Path.Add(new PathStep(nx, ny, need, next));
                    x = nx; y = ny; outBit = next;
                    continue;
                }
                return Failed(res, nx, ny, tile.Type == TileType.Empty ? FailReason.Gap : FailReason.Blocked);
            }
            return Failed(res, x, y, FailReason.Loop);
        }

        static TraceResult Failed(TraceResult r, int x, int y, FailReason why)
        {
            r.Ok = false; r.Fail = why; r.FailX = x; r.FailY = y;
            return r;
        }

        public static TraceResult Trace(Board b)
        {
            b.Find(TileType.Start, out int sx, out int sy);
            return TraceWith(b.W, b.H, b.Get, sx, sy);
        }

        static readonly Tile EmptyTile = Tile.Empty();
        static readonly Tile[] PipeCache = BuildPipeCache();
        static Tile[] BuildPipeCache()
        {
            var a = new Tile[16];
            for (int m = 0; m < 16; m++) a[m] = Tile.Pipe(m);
            return a;
        }

        struct Parent { public string Prev; public Move Move; }

        public static SolveResult Solve(Board board, int maxNodes = 250000)
        {
            int w = board.W, h = board.H, n = w * h;
            var fixedCells = board.Cells;
            board.Find(TileType.Start, out int sx, out int sy);

            Func<int, int, Tile> TileFrom(string key) => (x, y) =>
            {
                int i = y * w + x;
                char c = key[i];
                if (c == '.') return EmptyTile;
                if (c == '#') return fixedCells[i];
                return PipeCache[c - 65];
            };
            bool IsGoal(string key) => TraceWith(w, h, TileFrom(key), sx, sy).Ok;

            string startKey = board.Key();
            if (IsGoal(startKey)) return new SolveResult { Moves = new List<Move>(), Explored = 1 };

            var parent = new Dictionary<string, Parent?> { { startKey, null } };
            var queue = new List<string> { startKey };
            int head = 0;

            List<Move> Rebuild(string key)
            {
                var moves = new List<Move>();
                var k = key;
                while (parent[k].HasValue)
                {
                    var p = parent[k].Value;
                    moves.Add(p.Move);
                    k = p.Prev;
                }
                moves.Reverse();
                return moves;
            }

            var buf = new char[n];
            while (head < queue.Count)
            {
                string key = queue[head++];
                for (int i = 0; i < n; i++)
                {
                    if (key[i] != '.') continue;
                    int ex = i % w, ey = i / w;
                    foreach (var d in Dir.All)
                    {
                        int px = ex - d.Dx, py = ey - d.Dy;
                        if (px < 0 || py < 0 || px >= w || py >= h) continue;
                        int si = py * w + px;
                        char sc = key[si];
                        if (sc == '.' || sc == '#') continue;
                        key.CopyTo(0, buf, 0, n);
                        buf[i] = buf[si];
                        buf[si] = '.';
                        string nk = new string(buf);
                        if (parent.ContainsKey(nk)) continue;
                        parent[nk] = new Parent { Prev = key, Move = new Move(px, py, d.Bit) };
                        if (IsGoal(nk)) return new SolveResult { Moves = Rebuild(nk), Explored = parent.Count };
                        if (parent.Count >= maxNodes) return new SolveResult { Moves = null, Explored = parent.Count, Exhausted = true };
                        queue.Add(nk);
                    }
                }
            }
            return new SolveResult { Moves = null, Explored = parent.Count }; // provably unsolvable
        }
    }
}
