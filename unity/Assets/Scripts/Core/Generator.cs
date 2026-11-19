// Ball Roll — level generator. Port of js/core/generator.js; the random calls happen in exactly
// the same order, so a seed gives the same puzzle as the JS version (used for the Daily puzzle).
//
// Builds a solved board around a random self-avoiding pipe path, fills the rest with decoys,
// blocks and empty slots, then scrambles it with legal slides only (always solvable). A BFS then
// measures the true minimum number of moves (par); attempts outside the par range are rejected.
using System.Collections.Generic;

namespace BallRoll.Core
{
    public sealed class GeneratorConfig
    {
        public int Size, PathMin, PathMax, Empties, Blocks, FixedOnPath, Scramble, ParMin, ParMax;
        public double DecoyRatio = 0.6, FixedDecoyChance = 0;
        public int MaxNodes = 400000, MaxAttempts = 300;
    }

    public sealed class GeneratedLevel
    {
        public string[] Rows;
        public int Par;
        public List<Move> Solution;
        public int Attempt;
    }

    public static class Generator
    {
        struct P { public int X, Y; public P(int x, int y) { X = x; Y = y; } }

        static int DirBetween(P a, P b)
        {
            foreach (var d in Dir.All) if (a.X + d.Dx == b.X && a.Y + d.Dy == b.Y) return d.Bit;
            return 0;
        }

        static List<P> RandomPath(Rng rng, int w, int h, int minLen, int maxLen)
        {
            int target = rng.Int(minLen, maxLen);
            for (int tries = 0; tries < 40; tries++)
            {
                var start = new P(rng.Int(0, w - 1), rng.Int(0, h - 1));
                var visited = new HashSet<int> { start.Y * w + start.X };
                var path = new List<P> { start };
                int budget = 4000;

                bool Dfs()
                {
                    if (path.Count == target) return true;
                    if (--budget <= 0) return false;
                    var cur = path[path.Count - 1];
                    var options = rng.Shuffle(new List<Dir.Info>(Dir.All));
                    foreach (var d in options)
                    {
                        int nx = cur.X + d.Dx, ny = cur.Y + d.Dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        int k = ny * w + nx;
                        if (visited.Contains(k)) continue;
                        // keep the path from touching itself sideways
                        int touches = 0;
                        foreach (var d2 in Dir.All)
                        {
                            int ax = nx + d2.Dx, ay = ny + d2.Dy;
                            if (ax >= 0 && ay >= 0 && ax < w && ay < h && visited.Contains(ay * w + ax) && !(ax == cur.X && ay == cur.Y)) touches++;
                        }
                        if (touches > 0) continue;
                        visited.Add(k);
                        path.Add(new P(nx, ny));
                        if (Dfs()) return true;
                        path.RemoveAt(path.Count - 1);
                        visited.Remove(k);
                    }
                    return false;
                }

                if (Dfs()) return path;
            }
            return null;
        }

        public static Board BuildSolved(Rng rng, GeneratorConfig cfg)
        {
            int w = cfg.Size, h = cfg.Size;
            var path = RandomPath(rng, w, h, cfg.PathMin, cfg.PathMax);
            if (path == null) return null;
            var cells = new Tile?[w * h];
            int Idx(P p) => p.Y * w + p.X;
            int last = path.Count - 1;

            cells[Idx(path[0])] = Tile.Start(DirBetween(path[0], path[1]));
            cells[Idx(path[last])] = Tile.End(DirBetween(path[last], path[last - 1]));

            var middle = new List<int>();
            for (int i = 1; i < last; i++) middle.Add(i);
            var shuffled = rng.Shuffle(new List<int>(middle));
            var fixedSet = new HashSet<int>(shuffled.GetRange(0, System.Math.Min(cfg.FixedOnPath, shuffled.Count)));
            for (int i = 1; i < last; i++)
            {
                int mask = DirBetween(path[i], path[i - 1]) | DirBetween(path[i], path[i + 1]);
                cells[Idx(path[i])] = Tile.Pipe(mask, fixedSet.Contains(i));
            }

            var free = new List<int>();
            for (int i = 0; i < cells.Length; i++) if (!cells[i].HasValue) free.Add(i);
            if (free.Count < cfg.Empties + cfg.Blocks + 1) return null;
            rng.Shuffle(free);
            int p = 0;
            for (int i = 0; i < cfg.Empties; i++) cells[free[p++]] = Tile.Empty();
            for (int i = 0; i < cfg.Blocks; i++) cells[free[p++]] = Tile.Block();
            var allPipes = new List<int>(Tiles.Straights);
            allPipes.AddRange(Tiles.Curves);
            while (p < free.Count)
            {
                int i = free[p++];
                if (rng.Chance(cfg.DecoyRatio))
                {
                    int mask = rng.Pick(allPipes);          // same argument order as the JS version
                    bool fix = rng.Chance(cfg.FixedDecoyChance);
                    cells[i] = Tile.Pipe(mask, fix);
                }
                else cells[i] = Tile.Pipe(0);
            }
            var final = new Tile[cells.Length];
            for (int i = 0; i < cells.Length; i++) final[i] = cells[i].Value;
            return new Board(w, h, final);
        }

        public static Board Scramble(Rng rng, Board board, int count)
        {
            var seen = new HashSet<string> { board.Key() };
            Move? last = null;
            for (int i = 0; i < count; i++)
            {
                var moves = board.LegalMoves().FindAll(m =>
                    !(last.HasValue && m.X == last.Value.ToX && m.Y == last.Value.ToY && m.Dir == Dir.Opposite(last.Value.Dir)));
                if (moves.Count == 0) break;
                rng.Shuffle(moves);
                Move? chosen = null;
                foreach (var m in moves)
                {
                    var b2 = board.Clone();
                    b2.TryMove(m.X, m.Y, m.Dir, out _);
                    if (!seen.Contains(b2.Key())) { chosen = m; break; }
                }
                var c = chosen ?? moves[0];
                board.TryMove(c.X, c.Y, c.Dir, out var done);
                last = done;
                seen.Add(board.Key());
            }
            return board;
        }

        public static GeneratedLevel Generate(GeneratorConfig cfg, string seed)
        {
            for (int attempt = 0; attempt < cfg.MaxAttempts; attempt++)
            {
                var rng = new Rng(seed + ":" + attempt);
                var board = BuildSolved(rng, cfg);
                if (board == null) continue;
                Scramble(rng, board, cfg.Scramble);
                if (Pathfinding.Trace(board).Ok) continue; // scramble left it solved
                var res = Pathfinding.Solve(board, cfg.MaxNodes);
                if (res.Moves == null) continue;
                int par = res.Moves.Count;
                if (par < cfg.ParMin || par > cfg.ParMax) continue;
                return new GeneratedLevel { Rows = board.ToRows(), Par = par, Solution = res.Moves, Attempt = attempt };
            }
            return null;
        }
    }
}
