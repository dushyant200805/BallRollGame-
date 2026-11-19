// Ball Roll — the puzzle board (uGUI): wooden tray, tiles, glowing pipes, touch drag/tap to slide,
// slide animation, rolling ball, hint and fail markers. Port of the board parts of
// js/game/renderer.js, input-controller.js and ball-controller.js.
using System;
using System.Collections;
using System.Collections.Generic;
using BallRoll.Art;
using BallRoll.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace BallRoll
{
    public sealed class BoardView : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        sealed class TileGo
        {
            public RectTransform Root;
            public Image Shadow, Body, Pipe, Deco;
            public Tile Tile;
            public int Variant;
        }

        public Func<bool> CanInteract = () => true;
        public Action<Move> OnMoved;
        public Action<int, int> OnInvalid;
        public Action OnLimit;
        public BallSkin Skin;

        GameSession session;
        RectTransform rt, layer, ballRt, hintRt, arrowRt, failRt;
        Image tray, ballImg;
        TileGo[] tiles;
        int n;
        float side, frame, cell;
        bool busy;            // a slide animation is running
        public bool Rolling { get; private set; }
        string[] trayColors = { "#8a5530", "#4b2a13" };

        // ---------- setup ----------
        public void Build(GameSession s, string[] trayCols)
        {
            session = s;
            if (trayCols != null && trayCols.Length == 2) trayColors = trayCols;
            rt = (RectTransform)transform;
            foreach (Transform c in rt) Destroy(c.gameObject);
            n = s.Board.W;

            tray = new GameObject("Tray", typeof(RectTransform), typeof(Image)).GetComponent<Image>();
            tray.transform.SetParent(rt, false);
            tray.sprite = TileArt.Tray(trayColors);
            tray.type = Image.Type.Sliced;
            UI.UIKit.Stretch(tray.rectTransform);
            tray.raycastTarget = true; // receives the drags

            layer = UI.UIKit.Rect("Tiles", rt);
            UI.UIKit.Stretch(layer);

            Layout();
            // slots first, then tiles on top
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    var slot = MakeImage("Slot", layer, TileArt.Slot());
                    Position(slot.rectTransform, x, y);
                }
            tiles = new TileGo[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    var t = s.Board.Get(x, y);
                    if (t.IsEmpty) continue;
                    tiles[y * n + x] = MakeTile(t, x, y, (x * 7 + y * 13) % 6);
                }

            hintRt = MakeImage("Hint", rt, TileArt.HintRing()).rectTransform;
            arrowRt = MakeImage("Arrow", rt, TileArt.Arrow()).rectTransform;
            failRt = MakeImage("Fail", rt, TileArt.FailMark()).rectTransform;
            hintRt.gameObject.SetActive(false);
            arrowRt.gameObject.SetActive(false);
            failRt.gameObject.SetActive(false);

            ballImg = MakeImage("Ball", rt, Skin != null ? TileArt.Ball(Skin) : TileArt.Disc());
            ballRt = ballImg.rectTransform;
            ResetBall();
            RefreshGlow();
        }

        void Layout()
        {
            side = Mathf.Min(rt.rect.width, rt.rect.height);
            if (side <= 0) side = 900;
            frame = Mathf.Max(10, side * 0.035f);
            cell = (side - frame * 2) / n;
        }

        Image MakeImage(string name, RectTransform parent, Sprite sprite)
        {
            var img = new GameObject(name, typeof(RectTransform), typeof(Image)).GetComponent<Image>();
            img.transform.SetParent(parent, false);
            img.sprite = sprite;
            img.raycastTarget = false;
            img.rectTransform.sizeDelta = new Vector2(cell, cell);
            return img;
        }

        TileGo MakeTile(Tile t, int x, int y, int variant)
        {
            var g = new TileGo { Tile = t, Variant = variant };
            g.Root = UI.UIKit.Rect("Tile", layer);
            g.Root.sizeDelta = new Vector2(cell, cell);
            g.Shadow = MakeImage("Shadow", g.Root, TileArt.Shadow());
            g.Shadow.rectTransform.anchoredPosition = new Vector2(0, -cell * 0.035f);
            g.Body = MakeImage("Body", g.Root, TileArt.Body(TileArt.KindOf(t), variant));
            g.Pipe = MakeImage("Pipe", g.Root, null);
            g.Deco = MakeImage("Deco", g.Root, null);
            Position(g.Root, x, y);
            return g;
        }

        /// <summary>Centre of cell (x, y) in board-local coordinates (y down in the grid).</summary>
        public Vector2 Center(int x, int y) => new Vector2(-side / 2 + frame + cell * (x + 0.5f), side / 2 - frame - cell * (y + 0.5f));

        void Position(RectTransform r, int x, int y)
        {
            r.anchorMin = r.anchorMax = new Vector2(0.5f, 0.5f);
            r.anchoredPosition = Center(x, y);
        }

        // ---------- glow ----------
        public void RefreshGlow()
        {
            var tr = session.Connection;
            var onPath = new HashSet<int>();
            foreach (var st in tr.Path) onPath.Add(st.Y * n + st.X);
            for (int i = 0; i < tiles.Length; i++)
            {
                var g = tiles[i];
                if (g == null) continue;
                var glow = onPath.Contains(i) ? (tr.Ok ? Glow.Complete : Glow.Connected) : Glow.Normal;
                var t = g.Tile;
                g.Pipe.enabled = g.Deco.enabled = false;
                if (t.Type == TileType.Pipe && t.Openings != 0)
                {
                    int a = t.Openings & -t.Openings, b = t.Openings & ~a;
                    g.Pipe.sprite = TileArt.Pipe(a, b, glow);
                    g.Pipe.enabled = true;
                }
                else if (t.Type == TileType.Start)
                {
                    g.Pipe.sprite = TileArt.Pipe(0, t.Openings, tr.Ok ? Glow.Complete : Glow.Connected);
                    g.Deco.sprite = TileArt.Socket();
                    g.Pipe.enabled = g.Deco.enabled = true;
                }
                else if (t.Type == TileType.End)
                {
                    g.Pipe.sprite = TileArt.Pipe(t.Openings, 0, onPath.Contains(i) ? glow : Glow.Normal);
                    g.Deco.sprite = TileArt.Hole(tr.Ok);
                    g.Pipe.enabled = g.Deco.enabled = true;
                }
            }
        }

        // ---------- input ----------
        Vector2 downPos;
        int downX = -1, downY = -1;
        bool dragMoved;

        bool CellAt(Vector2 screen, PointerEventData e, out int x, out int y, out Vector2 local)
        {
            RectTransformUtility.ScreenPointToLocalPointInRectangle(rt, screen, e.pressEventCamera, out local);
            float gx = (local.x + side / 2 - frame) / cell, gy = (side / 2 - frame - local.y) / cell;
            x = Mathf.FloorToInt(gx); y = Mathf.FloorToInt(gy);
            return x >= 0 && y >= 0 && x < n && y < n;
        }

        public void OnPointerDown(PointerEventData e)
        {
            dragMoved = false;
            downX = -1;
            if (!CanInteract() || busy || Rolling) return;
            if (CellAt(e.position, e, out int x, out int y, out var local)) { downX = x; downY = y; downPos = local; }
        }

        public void OnDrag(PointerEventData e)
        {
            if (downX < 0 || dragMoved || busy) return;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(rt, e.position, e.pressEventCamera, out var local);
            var d = local - downPos;
            if (d.magnitude < cell * 0.22f) return;
            dragMoved = true;
            int dir = Mathf.Abs(d.x) > Mathf.Abs(d.y) ? (d.x > 0 ? Dir.E : Dir.W) : (d.y > 0 ? Dir.N : Dir.S);
            TrySlide(downX, downY, dir);
        }

        public void OnPointerUp(PointerEventData e)
        {
            if (downX < 0 || dragMoved || busy) return;
            // a tap slides the tile if it has exactly one way to go
            var dirs = session.Board.MovableDirs(downX, downY);
            if (dirs.Count == 1) TrySlide(downX, downY, dirs[0]);
            else OnInvalid?.Invoke(downX, downY);
        }

        void TrySlide(int x, int y, int dir)
        {
            if (!CanInteract()) return;
            if (!session.TryMove(x, y, dir, out var m, out var why))
            {
                if (why == "limit") OnLimit?.Invoke();
                else OnInvalid?.Invoke(x, y);
                return;
            }
            ClearMarks();
            StartCoroutine(AnimateMove(m));
        }

        /// <summary>Animate a move that has already been applied to the session board (also used by undo).</summary>
        public void ShowMove(Move m)
        {
            ClearMarks();
            StartCoroutine(AnimateMove(m, false));
        }

        IEnumerator AnimateMove(Move m, bool notify = true)
        {
            busy = true;
            var g = tiles[m.Y * n + m.X];
            tiles[m.Y * n + m.X] = null;
            tiles[m.ToY * n + m.ToX] = g;
            if (g != null)
            {
                Vector2 a = Center(m.X, m.Y), b = Center(m.ToX, m.ToY);
                float t = 0, dur = 0.13f;
                while (t < dur)
                {
                    t += Time.deltaTime;
                    float k = 1 - Mathf.Pow(1 - Mathf.Clamp01(t / dur), 3);
                    g.Root.anchoredPosition = Vector2.LerpUnclamped(a, b, k);
                    yield return null;
                }
                g.Root.anchoredPosition = b;
            }
            busy = false;
            RefreshGlow();
            if (notify) OnMoved?.Invoke(m);
        }

        /// <summary>Rebuild tile visuals from the session board (restart / restore).</summary>
        public void Sync()
        {
            StopAllCoroutines();
            busy = false;
            Rolling = false;
            foreach (var g in tiles) if (g != null) Destroy(g.Root.gameObject);
            tiles = new TileGo[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    var t = session.Board.Get(x, y);
                    if (!t.IsEmpty) tiles[y * n + x] = MakeTile(t, x, y, (x * 7 + y * 13) % 6);
                }
            ballRt.SetAsLastSibling();
            ClearMarks();
            ResetBall();
            RefreshGlow();
        }

        // ---------- hint / fail ----------
        Coroutine hintCo;

        public void ShowHint(Move m)
        {
            ClearMarks();
            hintCo = StartCoroutine(HintPulse(m));
        }

        IEnumerator HintPulse(Move m)
        {
            var c = Center(m.X, m.Y);
            hintRt.gameObject.SetActive(true);
            arrowRt.gameObject.SetActive(true);
            hintRt.sizeDelta = new Vector2(cell, cell);
            hintRt.anchoredPosition = c;
            arrowRt.sizeDelta = new Vector2(cell * 0.45f, cell * 0.45f);
            var d = Dir.ByBit(m.Dir);
            arrowRt.localRotation = Quaternion.Euler(0, 0, -Mathf.Atan2(d.Dy, d.Dx) * Mathf.Rad2Deg);
            float t = 0;
            while (t < 4f)
            {
                t += Time.deltaTime;
                float pulse = 0.5f + 0.5f * Mathf.Sin(t * 7f);
                arrowRt.anchoredPosition = c + new Vector2(d.Dx, -d.Dy) * cell * (0.55f + pulse * 0.12f);
                hintRt.GetComponent<Image>().color = new Color(1, 1, 1, 0.55f + pulse * 0.45f);
                yield return null;
            }
            hintRt.gameObject.SetActive(false);
            arrowRt.gameObject.SetActive(false);
        }

        public void ClearMarks()
        {
            if (hintCo != null) StopCoroutine(hintCo);
            hintRt.gameObject.SetActive(false);
            arrowRt.gameObject.SetActive(false);
            failRt.gameObject.SetActive(false);
        }

        // ---------- ball ----------
        public void ResetBall()
        {
            session.Initial.Find(TileType.Start, out int sx, out int sy);
            ballRt.sizeDelta = new Vector2(cell, cell);
            ballRt.anchoredPosition = Center(sx, sy);
            ballRt.localScale = Vector3.one;
            ballRt.localRotation = Quaternion.identity;
            ballImg.color = Color.white;
            ballRt.SetAsLastSibling();
        }

        /// <summary>Point along the pipe of a cell, from side `inBit` (0 = centre) to side `outBit` (0 = centre).</summary>
        Vector2 PipePoint(int x, int y, int inBit, int outBit, float t)
        {
            var c = Center(x, y);
            Vector2 Side(int bit) => bit == 0 ? Vector2.zero : bit == Dir.N ? new Vector2(0, cell / 2) : bit == Dir.S ? new Vector2(0, -cell / 2) : bit == Dir.E ? new Vector2(cell / 2, 0) : new Vector2(-cell / 2, 0);
            if (inBit == 0 || outBit == 0 || Dir.Opposite(inBit) == outBit) return c + Vector2.Lerp(Side(inBit), Side(outBit), t);
            // quarter circle around the shared corner
            int both = inBit | outBit;
            var corner = new Vector2((both & Dir.E) != 0 ? cell / 2 : -cell / 2, (both & Dir.N) != 0 ? cell / 2 : -cell / 2);
            Vector2 a = Side(inBit) - corner, b = Side(outBit) - corner;
            float aa = Mathf.Atan2(a.y, a.x), ab = Mathf.Atan2(b.y, b.x);
            float delta = Mathf.DeltaAngle(aa * Mathf.Rad2Deg, ab * Mathf.Rad2Deg) * Mathf.Deg2Rad;
            float ang = aa + delta * t;
            return c + corner + new Vector2(Mathf.Cos(ang), Mathf.Sin(ang)) * (cell / 2);
        }

        /// <summary>Roll the ball along a trace. onDone(ok) when it reaches the goal or the path breaks.</summary>
        public void Roll(TraceResult trace, bool reduced, Action<float> intensity, Action onArrive, Action<TraceResult> onBreak, Action<bool> onDone)
        {
            ClearMarks();
            StartCoroutine(RollCo(trace, reduced, intensity, onArrive, onBreak, onDone));
        }

        IEnumerator RollCo(TraceResult trace, bool reduced, Action<float> intensity, Action onArrive, Action<TraceResult> onBreak, Action<bool> onDone)
        {
            Rolling = true;
            ResetBall();
            float speed = reduced ? 12f : 4f, top = reduced ? 12f : 7.5f; // cells per second
            float rot = 0;
            for (int i = 0; i < trace.Path.Count; i++)
            {
                var st = trace.Path[i];
                bool last = i == trace.Path.Count - 1;
                int inBit = st.InBit, outBit = last && trace.Ok ? 0 : st.OutBit;
                if (last && !trace.Ok) outBit = st.OutBit; // roll to the edge, then fall/bump
                float len = (inBit != 0 && outBit != 0 && Dir.Opposite(inBit) != outBit) ? Mathf.PI / 4 : (inBit == 0 || outBit == 0 ? 0.5f : 1f);
                float t = 0;
                while (t < 1)
                {
                    speed = Mathf.MoveTowards(speed, top, Time.deltaTime * 6f);
                    t += Time.deltaTime * speed / Mathf.Max(0.2f, len);
                    var p = PipePoint(st.X, st.Y, inBit, outBit, Mathf.Clamp01(t));
                    rot -= Time.deltaTime * speed * 360f;
                    ballRt.anchoredPosition = p;
                    ballRt.localRotation = Quaternion.Euler(0, 0, rot);
                    intensity?.Invoke(speed / top);
                    yield return null;
                }
            }
            if (trace.Ok)
            {
                onArrive?.Invoke();
                // sink into the hole
                float t = 0;
                while (t < 0.35f) { t += Time.deltaTime; ballRt.localScale = Vector3.one * Mathf.Lerp(1, 0.55f, t / 0.35f); yield return null; }
                Rolling = false;
                onDone?.Invoke(true);
                yield break;
            }
            onBreak?.Invoke(trace);
            // show the fail marker where the path breaks, then drop/bump
            bool drop = trace.Fail == FailReason.Gap || trace.Fail == FailReason.Edge;
            failRt.gameObject.SetActive(true);
            failRt.sizeDelta = new Vector2(cell, cell);
            failRt.SetAsLastSibling();
            var lastStep = trace.Path[trace.Path.Count - 1];
            failRt.anchoredPosition = trace.FailX >= 0 && trace.FailX < n && trace.FailY >= 0 && trace.FailY < n
                ? Center(trace.FailX, trace.FailY)
                : PipePoint(lastStep.X, lastStep.Y, lastStep.InBit, lastStep.OutBit, 1);
            float k = 0;
            while (k < 0.45f)
            {
                k += Time.deltaTime;
                if (drop) { ballRt.localScale = Vector3.one * Mathf.Lerp(1, 0.2f, k / 0.45f); ballImg.color = new Color(1, 1, 1, 1 - k / 0.45f); }
                else ballRt.anchoredPosition += new Vector2(Mathf.Sin(k * 60) * 2, 0);
                yield return null;
            }
            yield return new WaitForSeconds(0.3f);
            Rolling = false;
            onDone?.Invoke(false);
        }
    }
}
