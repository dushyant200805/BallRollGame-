// Ball Roll — directions, tile types and the level token format.
// Port of js/core/constants.js + js/core/tiles.js (pure C#, no Unity dependencies).
//
// Level grid token format (space separated, one string per row):
//   .   empty slot            #   fixed stone block      o   movable plain block
//   -   pipe E-W              |   pipe N-S
//   L   pipe N-E              J   pipe N-W
//   7   pipe S-W              F   pipe S-E
//   suffix * on a pipe = fixed (cannot slide), e.g. "-*"
//   Sx  start, ball exits towards x (n/e/s/w)
//   Ex  end, ball enters from side x (n/e/s/w)
using System;
using System.Collections.Generic;

namespace BallRoll.Core
{
    /// <summary>Direction bitmask: a pipe's openings are stored as an OR of these bits.</summary>
    public static class Dir
    {
        public const int N = 1, E = 2, S = 4, W = 8;

        public struct Info
        {
            public int Bit, Dx, Dy;
            public char Name;
            public Info(int bit, int dx, int dy, char name) { Bit = bit; Dx = dx; Dy = dy; Name = name; }
        }

        /// <summary>N, E, S, W in this order (the order matters for deterministic generation).</summary>
        public static readonly Info[] All =
        {
            new Info(N, 0, -1, 'n'), new Info(E, 1, 0, 'e'), new Info(S, 0, 1, 's'), new Info(W, -1, 0, 'w'),
        };

        public static bool TryByBit(int bit, out Info info)
        {
            foreach (var d in All) if (d.Bit == bit) { info = d; return true; }
            info = default;
            return false;
        }

        public static Info ByBit(int bit)
        {
            if (TryByBit(bit, out var d)) return d;
            throw new ArgumentException("Bad direction bit " + bit);
        }

        public static bool TryByName(char name, out Info info)
        {
            foreach (var d in All) if (d.Name == name) { info = d; return true; }
            info = default;
            return false;
        }

        public static int Opposite(int bit) => bit switch { N => S, E => W, S => N, W => E, _ => 0 };

        public static int BitCount(int mask) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
    }

    public enum TileType { Empty, Pipe, Start, End, Block }

    /// <summary>One board cell. Immutable value; boards copy it freely.</summary>
    public readonly struct Tile : IEquatable<Tile>
    {
        public readonly TileType Type;
        public readonly int Openings; // pipe openings / start exit / end entry
        public readonly bool Fixed;

        public Tile(TileType type, int openings, bool fix) { Type = type; Openings = openings; Fixed = fix; }

        public static Tile Empty() => new Tile(TileType.Empty, 0, false);
        public static Tile Block() => new Tile(TileType.Block, 0, true);
        public static Tile Pipe(int mask, bool fix = false) => new Tile(TileType.Pipe, mask, fix);
        public static Tile Start(int exitBit) => new Tile(TileType.Start, exitBit, true);
        public static Tile End(int entryBit) => new Tile(TileType.End, entryBit, true);

        public bool IsMovable => Type == TileType.Pipe && !Fixed;
        public bool IsEmpty => Type == TileType.Empty;

        public bool Equals(Tile o) => Type == o.Type && Openings == o.Openings && Fixed == o.Fixed;
        public override bool Equals(object obj) => obj is Tile t && Equals(t);
        public override int GetHashCode() => ((int)Type * 31 + Openings) * 2 + (Fixed ? 1 : 0);
        public override string ToString() => Tiles.ToToken(this);
    }

    public static class Tiles
    {
        static readonly Dictionary<char, int> PipeTokens = new Dictionary<char, int>
        {
            { '-', Dir.E | Dir.W }, { '|', Dir.N | Dir.S }, { 'L', Dir.N | Dir.E },
            { 'J', Dir.N | Dir.W }, { '7', Dir.S | Dir.W }, { 'F', Dir.S | Dir.E }, { 'o', 0 },
        };

        public static readonly int[] Straights = { Dir.E | Dir.W, Dir.N | Dir.S };
        public static readonly int[] Curves = { Dir.N | Dir.E, Dir.N | Dir.W, Dir.S | Dir.W, Dir.S | Dir.E };

        public static Tile Parse(string token)
        {
            if (token == ".") return Tile.Empty();
            if (token == "#") return Tile.Block();
            char head = token[0];
            if (head == 'S' || head == 'E')
            {
                if (token.Length < 2 || !Dir.TryByName(token[1], out var d)) throw new FormatException("Bad start/end token: " + token);
                return head == 'S' ? Tile.Start(d.Bit) : Tile.End(d.Bit);
            }
            if (PipeTokens.TryGetValue(head, out int mask)) return Tile.Pipe(mask, token.Length > 1 && token[1] == '*');
            throw new FormatException("Unknown tile token: " + token);
        }

        public static string ToToken(Tile t)
        {
            switch (t.Type)
            {
                case TileType.Empty: return ".";
                case TileType.Block: return "#";
                case TileType.Start: return "S" + Dir.ByBit(t.Openings).Name;
                case TileType.End: return "E" + Dir.ByBit(t.Openings).Name;
                default:
                    foreach (var kv in PipeTokens)
                        if (kv.Value == t.Openings) return t.Fixed ? kv.Key + "*" : kv.Key.ToString();
                    throw new FormatException("Unsupported pipe mask: " + t.Openings);
            }
        }
    }
}
