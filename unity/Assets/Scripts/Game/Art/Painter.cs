// Ball Roll — tiny CPU rasterizer used to draw the game's art in code (anti-aliased signed-distance
// shapes, gradients), the same way the web/React Native versions draw it. Textures are built once
// and cached, so there are no image files to ship or replace.
using UnityEngine;

namespace BallRoll.Art
{
    public sealed class Painter
    {
        public readonly int W, H;
        readonly Color[] px;

        public Painter(int w, int h) { W = w; H = h; px = new Color[w * h]; }

        public static Color Hex(string hex, float alpha = 1f)
        {
            if (string.IsNullOrEmpty(hex)) return new Color(0, 0, 0, 0);
            if (hex.StartsWith("rgba"))
            {
                var parts = hex.Substring(5, hex.Length - 6).Split(',');
                return new Color(float.Parse(parts[0]) / 255f, float.Parse(parts[1]) / 255f, float.Parse(parts[2]) / 255f,
                    float.Parse(parts[3], System.Globalization.CultureInfo.InvariantCulture) * alpha);
            }
            ColorUtility.TryParseHtmlString(hex, out var c);
            c.a *= alpha;
            return c;
        }

        /// <summary>Alpha-blend `c` with coverage `a` onto pixel (x, y) (y = 0 is the TOP row).</summary>
        public void Blend(int x, int y, Color c, float a)
        {
            if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
            a *= c.a;
            if (a <= 0) return;
            int i = (H - 1 - y) * W + x;
            var d = px[i];
            float outA = a + d.a * (1 - a);
            if (outA <= 0) return;
            px[i] = new Color(
                (c.r * a + d.r * d.a * (1 - a)) / outA,
                (c.g * a + d.g * d.a * (1 - a)) / outA,
                (c.b * a + d.b * d.a * (1 - a)) / outA,
                outA);
        }

        /// <summary>Coverage from a signed distance (negative inside), 1px anti-aliasing.</summary>
        public static float Cover(float sd) => Mathf.Clamp01(0.5f - sd);

        public static float RoundRectSd(float px, float py, float x, float y, float w, float h, float r)
        {
            float cx = x + w / 2, cy = y + h / 2;
            float qx = Mathf.Abs(px - cx) - (w / 2 - r), qy = Mathf.Abs(py - cy) - (h / 2 - r);
            float outside = new Vector2(Mathf.Max(qx, 0), Mathf.Max(qy, 0)).magnitude;
            return outside + Mathf.Min(Mathf.Max(qx, qy), 0) - r;
        }

        public delegate Color Shader(float x, float y);

        /// <summary>Fill a rounded rect with a per-pixel colour function.</summary>
        public void RoundRect(float x, float y, float w, float h, float r, Shader shade)
        {
            int x0 = Mathf.Max(0, (int)(x - 1)), x1 = Mathf.Min(W - 1, (int)(x + w + 1));
            int y0 = Mathf.Max(0, (int)(y - 1)), y1 = Mathf.Min(H - 1, (int)(y + h + 1));
            for (int j = y0; j <= y1; j++)
                for (int i = x0; i <= x1; i++)
                {
                    float sd = RoundRectSd(i + 0.5f, j + 0.5f, x, y, w, h, r);
                    float a = Cover(sd);
                    if (a > 0) Blend(i, j, shade(i + 0.5f, j + 0.5f), a);
                }
        }

        public void RoundRect(float x, float y, float w, float h, float r, Color c) => RoundRect(x, y, w, h, r, (_, __) => c);

        /// <summary>Stroke the outline of a rounded rect with a per-pixel colour.</summary>
        public void RoundRectRing(float x, float y, float w, float h, float r, float width, Shader shade)
        {
            for (int j = 0; j < H; j++)
                for (int i = 0; i < W; i++)
                {
                    float sd = Mathf.Abs(RoundRectSd(i + 0.5f, j + 0.5f, x, y, w, h, r)) - width / 2;
                    float a = Cover(sd);
                    if (a > 0) Blend(i, j, shade(i + 0.5f, j + 0.5f), a);
                }
        }

        public void Circle(float cx, float cy, float r, Shader shade)
        {
            int x0 = Mathf.Max(0, (int)(cx - r - 1)), x1 = Mathf.Min(W - 1, (int)(cx + r + 1));
            int y0 = Mathf.Max(0, (int)(cy - r - 1)), y1 = Mathf.Min(H - 1, (int)(cy + r + 1));
            for (int j = y0; j <= y1; j++)
                for (int i = x0; i <= x1; i++)
                {
                    float d = new Vector2(i + 0.5f - cx, j + 0.5f - cy).magnitude - r;
                    float a = Cover(d);
                    if (a > 0) Blend(i, j, shade(i + 0.5f, j + 0.5f), a);
                }
        }

        public void Circle(float cx, float cy, float r, Color c) => Circle(cx, cy, r, (_, __) => c);

        public void Ring(float cx, float cy, float r, float width, Color c)
        {
            int x0 = Mathf.Max(0, (int)(cx - r - width)), x1 = Mathf.Min(W - 1, (int)(cx + r + width));
            int y0 = Mathf.Max(0, (int)(cy - r - width)), y1 = Mathf.Min(H - 1, (int)(cy + r + width));
            for (int j = y0; j <= y1; j++)
                for (int i = x0; i <= x1; i++)
                {
                    float d = Mathf.Abs(new Vector2(i + 0.5f - cx, j + 0.5f - cy).magnitude - r) - width / 2;
                    float a = Cover(d);
                    if (a > 0) Blend(i, j, c, a);
                }
        }

        public void Line(float ax, float ay, float bx, float by, float width, Color c)
        {
            int x0 = Mathf.Max(0, (int)(Mathf.Min(ax, bx) - width)), x1 = Mathf.Min(W - 1, (int)(Mathf.Max(ax, bx) + width));
            int y0 = Mathf.Max(0, (int)(Mathf.Min(ay, by) - width)), y1 = Mathf.Min(H - 1, (int)(Mathf.Max(ay, by) + width));
            var a = new Vector2(ax, ay);
            var ab = new Vector2(bx - ax, by - ay);
            float len2 = Mathf.Max(1e-5f, ab.sqrMagnitude);
            for (int j = y0; j <= y1; j++)
                for (int i = x0; i <= x1; i++)
                {
                    var p = new Vector2(i + 0.5f, j + 0.5f);
                    float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / len2);
                    float d = (p - (a + ab * t)).magnitude - width / 2;
                    float cov = Cover(d);
                    if (cov > 0) Blend(i, j, c, cov);
                }
        }

        public void Polygon(Vector2[] pts, Color c)
        {
            float minX = float.MaxValue, minY = float.MaxValue, maxX = float.MinValue, maxY = float.MinValue;
            foreach (var p in pts) { minX = Mathf.Min(minX, p.x); maxX = Mathf.Max(maxX, p.x); minY = Mathf.Min(minY, p.y); maxY = Mathf.Max(maxY, p.y); }
            for (int j = Mathf.Max(0, (int)minY - 1); j <= Mathf.Min(H - 1, (int)maxY + 1); j++)
                for (int i = Mathf.Max(0, (int)minX - 1); i <= Mathf.Min(W - 1, (int)maxX + 1); i++)
                {
                    // 4x supersampling of an even-odd point test
                    float cov = 0;
                    for (int s = 0; s < 4; s++)
                    {
                        float x = i + 0.25f + 0.5f * (s & 1), y = j + 0.25f + 0.5f * (s >> 1);
                        bool inside = false;
                        for (int k = 0, m = pts.Length - 1; k < pts.Length; m = k++)
                            if ((pts[k].y > y) != (pts[m].y > y) && x < (pts[m].x - pts[k].x) * (y - pts[k].y) / (pts[m].y - pts[k].y) + pts[k].x) inside = !inside;
                        if (inside) cov += 0.25f;
                    }
                    if (cov > 0) Blend(i, j, c, cov);
                }
        }

        /// <summary>Apply a per-pixel function to every pixel (for custom shapes such as pipes).</summary>
        public void Each(System.Action<int, int> f)
        {
            for (int j = 0; j < H; j++)
                for (int i = 0; i < W; i++) f(i, j);
        }

        public Texture2D ToTexture(bool mip = false)
        {
            var t = new Texture2D(W, H, TextureFormat.RGBA32, mip) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            // store premultiplied-free colours; fully transparent pixels keep a neighbour-ish colour of black
            t.SetPixels(px);
            t.Apply(mip, true);
            return t;
        }

        public Sprite ToSprite(Vector4 border = default)
        {
            var t = ToTexture();
            return Sprite.Create(t, new Rect(0, 0, W, H), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, border);
        }
    }
}
