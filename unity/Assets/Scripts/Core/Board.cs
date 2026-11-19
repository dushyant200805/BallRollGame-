// Ball Roll — board grid, move validation and application. Port of js/core/board.js.
using System;
using System.Collections.Generic;
using System.Text;

namespace BallRoll.Core
{
    /// <summary>A slide: the tile at (X, Y) moves one cell in Dir to (ToX, ToY).</summary>
    [Serializable]
    public struct Move
    {
        public int X, Y, Dir, ToX, ToY;
        public Move(int x, int y, int dir, int toX = 0, int toY = 0) { X = x; Y = y; Dir = dir; ToX = toX; ToY = toY; }
        public override string ToString() => $"({X},{Y})->{Dir}";
    }

    public sealed class Board
    {
        public readonly int W, H;
        public readonly Tile[] Cells; // index = y * W + x

        public Board(int w, int h, Tile[] cells) { W = w; H = h; Cells = cells; }

        public static Board FromRows(IList<string> rows)
        {
            int h = rows.Count;
            var parsed = new List<string[]>();
            foreach (var r in rows) parsed.Add(r.Trim().Split((char[])null, StringSplitOptions.RemoveEmptyEntries));
            int w = parsed[0].Length;
            var cells = new Tile[w * h];
            for (int y = 0; y < h; y++)
            {
                if (parsed[y].Length != w) throw new FormatException($"Row {y} has {parsed[y].Length} cells, expected {w}");
                for (int x = 0; x < w; x++) cells[y * w + x] = Tiles.Parse(parsed[y][x]);
            }
            var b = new Board(w, h, cells);
            b.ValidateStructure();
            return b;
        }

        public string[] ToRows()
        {
            var rows = new string[H];
            var sb = new StringBuilder();
            for (int y = 0; y < H; y++)
            {
                sb.Clear();
                for (int x = 0; x < W; x++)
                {
                    if (x > 0) sb.Append(' ');
                    sb.Append(Tiles.ToToken(Get(x, y)));
                }
                rows[y] = sb.ToString();
            }
            return rows;
        }

        public void ValidateStructure()
        {
            int starts = 0, ends = 0, empties = 0;
            foreach (var c in Cells)
            {
                if (c.Type == TileType.Start) starts++;
                else if (c.Type == TileType.End) ends++;
                else if (c.Type == TileType.Empty) empties++;
            }
            if (starts != 1) throw new FormatException("Board needs exactly one start, found " + starts);
            if (ends != 1) throw new FormatException("Board needs exactly one end, found " + ends);
            if (empties < 1) throw new FormatException("Board needs at least one empty slot");
        }

        public Board Clone() => new Board(W, H, (Tile[])Cells.Clone());

        public bool InBounds(int x, int y) => x >= 0 && y >= 0 && x < W && y < H;
        public Tile Get(int x, int y) => Cells[y * W + x];
        public bool TryGet(int x, int y, out Tile t)
        {
            if (InBounds(x, y)) { t = Cells[y * W + x]; return true; }
            t = default;
            return false;
        }
        public void Set(int x, int y, Tile t) => Cells[y * W + x] = t;

        public bool Find(TileType type, out int fx, out int fy)
        {
            for (int i = 0; i < Cells.Length; i++)
                if (Cells[i].Type == type) { fx = i % W; fy = i / W; return true; }
            fx = fy = -1;
            return false;
        }

        bool MovableAt(int x, int y) => TryGet(x, y, out var t) && t.IsMovable;
        bool EmptyAt(int x, int y) => TryGet(x, y, out var t) && t.IsEmpty;

        /// <summary>Directions the tile at (x, y) may legally slide.</summary>
        public List<int> MovableDirs(int x, int y)
        {
            var list = new List<int>();
            if (!MovableAt(x, y)) return list;
            foreach (var d in Dir.All) if (EmptyAt(x + d.Dx, y + d.Dy)) list.Add(d.Bit);
            return list;
        }

        public bool CanMove(int x, int y, int dirBit)
        {
            if (!Dir.TryByBit(dirBit, out var d)) return false;
            return MovableAt(x, y) && EmptyAt(x + d.Dx, y + d.Dy);
        }

        /// <summary>Slide tile (x, y) one cell in dirBit. Returns false if illegal.</summary>
        public bool TryMove(int x, int y, int dirBit, out Move move)
        {
            move = default;
            if (!CanMove(x, y, dirBit)) return false;
            var d = Dir.ByBit(dirBit);
            int nx = x + d.Dx, ny = y + d.Dy;
            Set(nx, ny, Get(x, y));
            Set(x, y, Tile.Empty());
            move = new Move(x, y, dirBit, nx, ny);
            return true;
        }

        /// <summary>Every legal move (same order as the JS version: empties row by row, N/E/S/W).</summary>
        public List<Move> LegalMoves()
        {
            var moves = new List<Move>();
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    if (!Get(x, y).IsEmpty) continue;
                    foreach (var d in Dir.All)
                    {
                        int sx = x - d.Dx, sy = y - d.Dy;
                        if (MovableAt(sx, sy)) moves.Add(new Move(sx, sy, d.Bit));
                    }
                }
            return moves;
        }

        /// <summary>Compact state key: fixed cells never move, so only movable/empty content matters.</summary>
        public string Key()
        {
            var chars = new char[Cells.Length];
            for (int i = 0; i < Cells.Length; i++)
            {
                var c = Cells[i];
                chars[i] = c.Type == TileType.Empty ? '.' : c.IsMovable ? (char)(65 + c.Openings) : '#';
            }
            return new string(chars);
        }
    }
}
