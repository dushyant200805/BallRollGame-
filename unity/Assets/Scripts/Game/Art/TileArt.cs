// Ball Roll — board art drawn in code (port of js/game/renderer.js): wooden tiles with grain,
// walnut tiles with brass screws, stone blocks, start socket, goal hole with flag, glowing pipes,
// the tray, slots, the ball skins and UI shapes. Every sprite is built once and cached.
using System.Collections.Generic;
using BallRoll.Core;
using UnityEngine;

namespace BallRoll.Art
{
    public enum Glow { Normal, Connected, Complete }

    public static class TileArt
    {
        public const int Size = 128; // texture size of one tile

        static readonly Dictionary<string, Sprite> cache = new Dictionary<string, Sprite>();

        static Sprite Cached(string key, System.Func<Sprite> make)
        {
            if (!cache.TryGetValue(key, out var s)) { s = make(); cache[key] = s; }
            return s;
        }

        static readonly Dictionary<string, string[]> Wood = new Dictionary<string, string[]>
        {
            { "maple", new[] { "#f6d197", "#d9964f", "#9a5e2a" } },
            { "walnut", new[] { "#a86b3c", "#6f3f1d", "#3d220f" } },
            { "start", new[] { "#c8f0d6", "#5cc58e", "#2c7a52" } },
            { "end", new[] { "#ffe9a8", "#f0b23a", "#9b6614" } },
            { "stone", new[] { "#b8c0c8", "#77818c", "#4a525b" } },
        };

        public static string KindOf(Tile t) =>
            t.Type == TileType.Block ? "stone" : t.Type == TileType.Start ? "start" : t.Type == TileType.End ? "end" : t.Fixed ? "walnut" : "maple";

        // ---------------- tiles ----------------
        /// <summary>Tile body (no pipe). `variant` changes the grain so neighbours don't look identical.</summary>
        public static Sprite Body(string kind, int variant) => Cached($"body:{kind}:{variant % 6}", () =>
        {
            var p = new Painter(Size, Size);
            var pal = Wood[kind];
            Color c0 = Painter.Hex(pal[0]), c1 = Painter.Hex(pal[1]), grain = Painter.Hex(pal[2]);
            float pad = Size * 0.05f, w = Size - pad * 2, r = Size * 0.17f;
            int id = variant % 6 + 1;
            p.RoundRect(pad, pad, w, w, r, (x, y) =>
            {
                float t = Mathf.Clamp01(((x - pad) * 0.4f + (y - pad)) / (w * 1.4f));
                var c = Color.Lerp(c0, c1, t);
                if (kind == "stone") return c;
                // wood grain: 5 wavy lines
                float g = 0;
                for (int i = 0; i < 5; i++)
                {
                    float baseY = pad + ((i + 0.5f + (id * 0.37f) % 1f) / 5f) * w;
                    float amp = w * (0.03f + ((id * (i + 3)) % 7) / 140f);
                    float k = (x - pad) / w * 12f;
                    float ly = baseY + Mathf.Sin(id * 1.7f + i + k * 0.7f) * amp;
                    g = Mathf.Max(g, Painter.Cover(Mathf.Abs(y - ly) - Mathf.Max(1f, w * 0.012f)));
                }
                return Color.Lerp(c, grain, g * 0.16f);
            });
            if (kind == "stone")
            {
                var speck = Painter.Hex("rgba(40,46,54,0.35)");
                for (int i = 0; i < 14; i++)
                    p.Circle(pad + ((id * 31 + i * 57) % 97) / 97f * w, pad + ((id * 17 + i * 89) % 101) / 101f * w, w * (0.015f + (i % 3) * 0.01f), speck);
                var crack = Painter.Hex("rgba(30,34,40,0.45)");
                float lw = Mathf.Max(1, w * 0.02f);
                p.Line(pad + w * 0.2f, pad + w * 0.15f, pad + w * 0.42f, pad + w * 0.45f, lw, crack);
                p.Line(pad + w * 0.42f, pad + w * 0.45f, pad + w * 0.35f, pad + w * 0.7f, lw, crack);
                p.Line(pad + w * 0.42f, pad + w * 0.45f, pad + w * 0.72f, pad + w * 0.55f, lw, crack);
            }
            // bevel: light top edge, dark bottom edge
            p.RoundRectRing(pad + 1.5f, pad + 1.5f, w - 3, w - 3, r * 0.9f, Mathf.Max(1.5f, Size * 0.03f), (x, y) =>
            {
                float t = (y - pad) / w;
                return t < 0.5f ? new Color(1, 1, 1, 0.55f * (1 - t * 2)) : new Color(0, 0, 0, 0.35f * (t - 0.5f) * 2);
            });
            if (kind == "walnut")
            {
                float off = w * 0.14f, rad = Mathf.Max(2, w * 0.05f);
                Color hi = Painter.Hex("#fff1b8"), lo = Painter.Hex("#a37b28"), slot = Painter.Hex("rgba(60,40,10,0.7)");
                foreach (var (dx, dy) in new[] { (off, off), (w - off, off), (off, w - off), (w - off, w - off) })
                {
                    float cx = pad + dx, cy = pad + dy;
                    p.Circle(cx, cy, rad, (x, y) => Color.Lerp(hi, lo, Mathf.Clamp01(new Vector2(x - (cx - rad * 0.3f), y - (cy - rad * 0.3f)).magnitude / (rad * 1.2f))));
                    p.Line(cx - rad * 0.6f, cy, cx + rad * 0.6f, cy, 1.2f, slot);
                }
            }
            return p.ToSprite();
        });

        /// <summary>Soft drop shadow under a tile.</summary>
        public static Sprite Shadow() => Cached("shadow", () =>
        {
            var p = new Painter(Size, Size);
            float pad = Size * 0.05f;
            p.RoundRect(pad, pad, Size - pad * 2, Size - pad * 2, Size * 0.17f, new Color(0, 0, 0, 0.38f));
            return p.ToSprite();
        });

        /// <summary>Empty slot in the tray.</summary>
        public static Sprite Slot() => Cached("slot", () =>
        {
            var p = new Painter(Size, Size);
            float pad = Size * 0.06f, w = Size - pad * 2;
            p.RoundRect(pad, pad, w, w, Size * 0.15f, Painter.Hex("#21140a"));
            p.RoundRectRing(pad, pad, w, w, Size * 0.15f, 1.5f, (_, __) => new Color(0, 0, 0, 0.5f));
            return p.ToSprite();
        });

        // ---------------- pipes ----------------
        static readonly Color GrooveC = Painter.Hex("rgba(60,32,12,0.55)");

        static Color TubeColor(Glow g) => g == Glow.Complete ? Painter.Hex("#ffcc33") : g == Glow.Connected ? Painter.Hex("#3fd6c8") : Painter.Hex("#c9d2da");
        static Color TubeHi(Glow g) => g == Glow.Complete ? Painter.Hex("rgba(255,250,215,0.9)") : g == Glow.Connected ? Painter.Hex("rgba(225,255,252,0.85)") : Painter.Hex("rgba(255,255,255,0.65)");

        static Vector2 EdgeMid(int bit, float s) =>
            bit == Dir.N ? new Vector2(s / 2, 0) : bit == Dir.S ? new Vector2(s / 2, s) : bit == Dir.E ? new Vector2(s, s / 2) : new Vector2(0, s / 2);

        /// <summary>Distance from p to the centre line of a pipe joining sides a and b (0 = centre).</summary>
        public static float PipeDistance(Vector2 p, int a, int b, float s)
        {
            var c = new Vector2(s / 2, s / 2);
            if (a == 0 || b == 0) return SegDist(p, c, EdgeMid(a | b, s));
            if (Dir.Opposite(a) == b) return SegDist(p, EdgeMid(a, s), EdgeMid(b, s));
            float cx = ((a | b) & Dir.E) != 0 ? s : 0, cy = ((a | b) & Dir.S) != 0 ? s : 0;
            return Mathf.Abs((p - new Vector2(cx, cy)).magnitude - s / 2);
        }

        static float SegDist(Vector2 p, Vector2 a, Vector2 b)
        {
            var ab = b - a;
            float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / ab.sqrMagnitude);
            return (p - (a + ab * t)).magnitude;
        }

        /// <summary>Pipe overlay (transparent outside the tube). a/b = side bits, 0 for a stub to the centre.</summary>
        public static Sprite Pipe(int a, int b, Glow glow) => Cached($"pipe:{a}:{b}:{glow}", () =>
        {
            float s = Size;
            var p = new Painter(Size, Size);
            Color tube = TubeColor(glow), hi = TubeHi(glow);
            float groove = s * 0.18f, half = s * 0.12f, core = s * 0.03f;
            p.Each((i, j) =>
            {
                float d = PipeDistance(new Vector2(i + 0.5f, j + 0.5f), a, b, s);
                if (glow != Glow.Normal && d < s * 0.26f) p.Blend(i, j, tube, 0.28f * (1 - d / (s * 0.26f)));
                p.Blend(i, j, GrooveC, Painter.Cover(d - groove));
                float cov = Painter.Cover(d - half);
                if (cov > 0)
                {
                    float shade = 1f - 0.35f * Mathf.Pow(d / half, 2);
                    p.Blend(i, j, new Color(tube.r * shade, tube.g * shade, tube.b * shade, 1), cov);
                }
                p.Blend(i, j, hi, Painter.Cover(d - core));
            });
            return p.ToSprite();
        });

        /// <summary>Green socket the ball starts in.</summary>
        public static Sprite Socket() => Cached("socket", () =>
        {
            var p = new Painter(Size, Size);
            float c = Size / 2f;
            p.Circle(c, c, Size * 0.24f, Painter.Hex("#1f6b47"));
            p.Ring(c, c, Size * 0.24f, Size * 0.045f, Painter.Hex("#e6fff0"));
            return p.ToSprite();
        });

        /// <summary>Goal hole with its little flag.</summary>
        public static Sprite Hole(bool complete) => Cached($"hole:{complete}", () =>
        {
            var p = new Painter(Size, Size);
            float s = Size, c = s / 2;
            if (complete) p.Circle(c, c, s * 0.33f, Painter.Hex("rgba(255,214,70,0.45)"));
            Color dark = Color.black, rim = Painter.Hex("#3a2408");
            p.Circle(c, c, s * 0.21f, (x, y) => Color.Lerp(dark, rim, Mathf.Clamp01(new Vector2(x - c, y - (c - s * 0.04f)).magnitude / (s * 0.22f))));
            p.Ring(c, c, s * 0.21f, s * 0.05f, Painter.Hex("#ffe48a"));
            p.Line(c + s * 0.02f, c, c + s * 0.02f, c - s * 0.34f, Mathf.Max(1.5f, s * 0.025f), Painter.Hex("#5b3a12"));
            p.Polygon(new[] { new Vector2(c + s * 0.02f, c - s * 0.34f), new Vector2(c + s * 0.2f, c - s * 0.28f), new Vector2(c + s * 0.02f, c - s * 0.21f) }, Painter.Hex("#ff5d6c"));
            return p.ToSprite();
        });

        /// <summary>Pulsing ring + arrow showing the hint move (arrow points right; rotate it).</summary>
        public static Sprite HintRing() => Cached("hint", () =>
        {
            var p = new Painter(Size, Size);
            p.RoundRectRing(Size * 0.05f, Size * 0.05f, Size * 0.9f, Size * 0.9f, Size * 0.2f, Size * 0.06f, (_, __) => Painter.Hex("#ffe066"));
            return p.ToSprite();
        });

        public static Sprite Arrow() => Cached("arrow", () =>
        {
            var p = new Painter(64, 64);
            p.Polygon(new[] { new Vector2(58, 32), new Vector2(14, 6), new Vector2(14, 58) }, Painter.Hex("#7a5600"));
            p.Polygon(new[] { new Vector2(52, 32), new Vector2(18, 13), new Vector2(18, 51) }, Painter.Hex("#ffe066"));
            return p.ToSprite();
        });

        public static Sprite FailMark() => Cached("fail", () =>
        {
            var p = new Painter(Size, Size);
            float c = Size / 2f, r = Size * 0.3f;
            p.Circle(c, c, r, Painter.Hex("rgba(255,70,90,0.28)"));
            p.Ring(c, c, r, Size * 0.05f, Painter.Hex("#ff4d63"));
            float k = r * 0.45f;
            p.Line(c - k, c - k, c + k, c + k, Size * 0.05f, Painter.Hex("#ff4d63"));
            p.Line(c + k, c - k, c - k, c + k, Size * 0.05f, Painter.Hex("#ff4d63"));
            return p.ToSprite();
        });

        // ---------------- tray ----------------
        public static Sprite Tray(string[] colors) => Cached("tray:" + string.Join(",", colors), () =>
        {
            const int S = 256;
            var p = new Painter(S, S);
            Color a = Painter.Hex(colors[0]), b = Painter.Hex(colors[1]);
            p.RoundRect(0, 0, S, S, S * 0.05f, (x, y) => Color.Lerp(a, b, y / S));
            p.RoundRectRing(1, 1, S - 2, S - 2, S * 0.05f, 2, (_, __) => Painter.Hex("rgba(255,220,170,0.25)"));
            return p.ToSprite(new Vector4(24, 24, 24, 24));
        });

        // ---------------- ball ----------------
        public static Sprite Ball(BallSkin skin) => Cached("ball:" + skin.id, () =>
        {
            var p = new Painter(Size, Size);
            float c = Size / 2f, r = Size * 0.32f;
            if (!string.IsNullOrEmpty(skin.haloColor) && skin.haloSize > 0)
            {
                var halo = Painter.Hex(skin.haloColor);
                float hr = r * skin.haloSize;
                p.Circle(c, c, hr, (x, y) => { float t = new Vector2(x - c, y - c).magnitude / hr; return new Color(halo.r, halo.g, halo.b, halo.a * (1 - t)); });
            }
            Color c0 = Painter.Hex(skin.body[0]), c1 = Painter.Hex(skin.body[1]), c2 = Painter.Hex(skin.body[2]);
            float hx = c - r * 0.3f, hy = c - r * 0.35f;
            p.Circle(c, c, r, (x, y) =>
            {
                float t = Mathf.Clamp01(new Vector2(x - hx, y - hy).magnitude / (r * 1.5f));
                var col = t < 0.45f ? Color.Lerp(c0, c1, t / 0.45f) : Color.Lerp(c1, c2, (t - 0.45f) / 0.55f);
                col.a = skin.alpha;
                return col;
            });
            if (skin.bands != null)
                foreach (var band in skin.bands)
                {
                    var bc = Painter.Hex(band.color);
                    for (int k = 0; k < Mathf.Max(1, band.count); k++)
                    {
                        float off = (k - (band.count - 1) / 2f) * r * 0.55f;
                        p.Circle(c, c, r, (x, y) =>
                        {
                            float d = Mathf.Abs((x - c) * 0.8f - (y - c) * 0.6f - off);
                            float cov = Painter.Cover(d - r * band.width);
                            return new Color(bc.r, bc.g, bc.b, bc.a * cov);
                        });
                    }
                }
            if (skin.dots != null)
                foreach (var dot in skin.dots)
                {
                    var dc = Painter.Hex(dot.color);
                    for (int k = 0; k < dot.n; k++)
                    {
                        float ang = k * Mathf.PI * 2 / dot.n + 0.4f;
                        float rr = r * 0.55f * ((k % 2) == 0 ? 1f : 0.45f);
                        p.Circle(c + Mathf.Cos(ang) * rr, c + Mathf.Sin(ang) * rr, r * dot.r, dc);
                    }
                }
            p.Circle(c - r * 0.32f, c - r * 0.38f, r * 0.28f * Mathf.Max(0.3f, skin.spec), (x, y) =>
            {
                float t = new Vector2(x - (c - r * 0.32f), y - (c - r * 0.38f)).magnitude / (r * 0.28f);
                return new Color(1, 1, 1, 0.75f * skin.spec * (1 - t));
            });
            return p.ToSprite();
        });

        // ---------------- UI ----------------
        /// <summary>White rounded rectangle, 9-sliced (tint it with Image.color).</summary>
        public static Sprite Rounded(int radius = 28) => Cached("rounded:" + radius, () =>
        {
            int S = radius * 2 + 8;
            var p = new Painter(S, S);
            p.RoundRect(0, 0, S, S, radius, Color.white);
            return p.ToSprite(new Vector4(radius, radius, radius, radius));
        });

        public static Sprite Disc() => Cached("disc", () =>
        {
            var p = new Painter(Size, Size);
            p.Circle(Size / 2f, Size / 2f, Size / 2f - 1, Color.white);
            return p.ToSprite();
        });

        public static Sprite Star() => Cached("star", () =>
        {
            var p = new Painter(Size, Size);
            var pts = new Vector2[10];
            for (int i = 0; i < 10; i++)
            {
                float ang = -Mathf.PI / 2 + i * Mathf.PI / 5;
                float rad = (i % 2 == 0 ? 0.48f : 0.2f) * Size;
                pts[i] = new Vector2(Size / 2f + Mathf.Cos(ang) * rad, Size / 2f + Mathf.Sin(ang) * rad + Size * 0.03f);
            }
            p.Polygon(pts, Color.white);
            return p.ToSprite();
        });
    }
}
