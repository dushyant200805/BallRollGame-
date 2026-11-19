// Ball Roll — gameplay screen (phase 3): HUD (title, tier chip, moves, par / moves left, timer),
// the board, controls (Undo, Restart, Hint, Play), pause / win / fail dialogs and level flow.
// Port of the game parts of js/game/engine.js + js/ui/ui-manager.js. Menus come in phase 4.
using System.Collections;
using BallRoll.Art;
using BallRoll.Core;
using BallRoll.UI;
using UnityEngine;
using UnityEngine.UI;

namespace BallRoll
{
    public sealed class GameScreen : MonoBehaviour
    {
        static readonly string[] Modes = { "classic", "challenge", "timetrial" };

        RectTransform root, boardArea, overlay;
        BoardView board;
        Text title, chip, movesTxt, targetLbl, targetTxt, timeLbl, timeTxt, status, toast;
        Image chipBg, targetBox, timeBox;
        GameButton undoBtn, restartBtn, hintBtn, playBtn;

        string mode = "classic";
        int number = 1;
        LevelDef level;
        GameSession session;
        bool lastConnected;
        float hudTimer, toastTimer;
        bool reduced;

        // ---------- lifecycle ----------
        void Start()
        {
            Application.targetFrameRate = 60;
            Input.multiTouchEnabled = false;
            root = UIKit.CreateRoot("Game");
            BuildHud();
            mode = PlayerPrefs.GetString("bp.mode", "classic");
            number = Mathf.Clamp(PlayerPrefs.GetInt("bp.level", 1), 1, GameData.Count(mode));
            Sfx.StartMusic();
            StartCoroutine(StartNextFrame());
        }

        IEnumerator StartNextFrame()
        {
            yield return null; // let the canvas lay out so the board knows its size
            StartLevel(mode, number);
        }

        void Update()
        {
            if (session != null && overlay == null && !board.Rolling)
            {
                if (session.Tick(Time.deltaTime)) Lose("time");
                hudTimer += Time.deltaTime;
                if (hudTimer > 0.2f) { hudTimer = 0; UpdateTime(); }
            }
            if (toastTimer > 0 && (toastTimer -= Time.deltaTime) <= 0) toast.transform.parent.gameObject.SetActive(false);
        }

        void OnApplicationPause(bool paused)
        {
            if (paused && session != null && session.State == SessionState.Playing && overlay == null) Pause();
        }

        // ---------- HUD ----------
        void BuildHud()
        {
            // top bar
            var top = UIKit.Rect("Top", root);
            top.anchorMin = new Vector2(0, 1); top.anchorMax = new Vector2(1, 1); top.pivot = new Vector2(0.5f, 1);
            top.sizeDelta = new Vector2(-48, 150); top.anchoredPosition = new Vector2(0, -16);
            var pause = UIKit.Button(top, "II", new Color(1, 1, 1, 0.12f), new Color(0, 0, 0, 0.25f), Palette.Ink, Pause, 52);
            UIKit.Place((RectTransform)pause.transform, new Vector2(0, 0.5f), new Vector2(130, 130), new Vector2(65, 0));
            title = UIKit.Label(top, "Level 1", 64, Palette.Ink);
            UIKit.Place(title.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(700, 80), new Vector2(0, 22));
            chipBg = UIKit.Box(top, Painter.Hex("#4cc38a"), 24, "Chip");
            UIKit.Place(chipBg.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(360, 54), new Vector2(0, -42));
            chip = UIKit.Label(chipBg.rectTransform, "Beginner", 32, Color.white);
            UIKit.Stretch(chip.rectTransform);
            var snd = UIKit.Button(top, "Sound", new Color(1, 1, 1, 0.12f), new Color(0, 0, 0, 0.25f), Palette.Ink, null, 30);
            UIKit.Place((RectTransform)snd.transform, new Vector2(1, 0.5f), new Vector2(150, 130), new Vector2(-75, 0));
            snd.Init(snd.transform.Find("Face").GetComponent<Image>(), snd.Text, () =>
            {
                Sfx.SoundOn = !Sfx.SoundOn;
                snd.Text.text = Sfx.SoundOn ? "Sound" : "Muted";
                if (!Sfx.SoundOn) Sfx.StopRoll();
            });

            // stats
            var stats = UIKit.Rect("Stats", root);
            stats.anchorMin = new Vector2(0, 1); stats.anchorMax = new Vector2(1, 1); stats.pivot = new Vector2(0.5f, 1);
            stats.sizeDelta = new Vector2(-48, 140); stats.anchoredPosition = new Vector2(0, -186);
            movesTxt = Stat(stats, 0, "Moves", out _, out _);
            targetTxt = Stat(stats, 1, "Par", out targetLbl, out targetBox);
            timeTxt = Stat(stats, 2, "Time", out timeLbl, out timeBox);

            // board
            boardArea = UIKit.Rect("BoardArea", root);
            boardArea.anchorMin = new Vector2(0, 0); boardArea.anchorMax = new Vector2(1, 1);
            boardArea.offsetMin = new Vector2(24, 330); boardArea.offsetMax = new Vector2(-24, -350);
            var b = UIKit.Rect("Board", boardArea);
            b.anchorMin = b.anchorMax = new Vector2(0.5f, 0.5f);
            board = b.gameObject.AddComponent<BoardView>();
            board.CanInteract = () => session != null && session.CanInteract && overlay == null;
            board.OnMoved = OnMoved;
            board.OnInvalid = OnInvalid;
            board.OnLimit = () => { Sfx.Play("bump"); Toast("No moves left. Press Play to roll!"); };

            // status line
            status = UIKit.Label(root, "", 38, Palette.InkDim, TextAnchor.MiddleCenter, false);
            status.rectTransform.anchorMin = new Vector2(0, 0); status.rectTransform.anchorMax = new Vector2(1, 0);
            status.rectTransform.sizeDelta = new Vector2(-80, 110); status.rectTransform.anchoredPosition = new Vector2(0, 265);

            // controls
            var ctrls = UIKit.Rect("Controls", root);
            ctrls.anchorMin = new Vector2(0, 0); ctrls.anchorMax = new Vector2(1, 0); ctrls.pivot = new Vector2(0.5f, 0);
            ctrls.sizeDelta = new Vector2(-40, 190); ctrls.anchoredPosition = new Vector2(0, 30);
            var dim = new Color(1, 1, 1, 0.12f);
            undoBtn = Ctrl(ctrls, 0, "Undo", dim, new Color(0, 0, 0, 0.3f), Palette.Ink, Undo);
            restartBtn = Ctrl(ctrls, 1, "Restart", dim, new Color(0, 0, 0, 0.3f), Palette.Ink, Restart);
            hintBtn = Ctrl(ctrls, 2, "Hint", dim, new Color(0, 0, 0, 0.3f), Palette.Ink, Hint);
            playBtn = Ctrl(ctrls, 3, "Play", Painter.Hex("#4cc38a"), Painter.Hex("#1d8150"), Color.white, Roll);

            // toast
            var tb = UIKit.Box(root, new Color(0.04f, 0.08f, 0.13f, 0.92f), 30, "Toast");
            tb.rectTransform.anchorMin = tb.rectTransform.anchorMax = new Vector2(0.5f, 0);
            tb.rectTransform.sizeDelta = new Vector2(900, 120); tb.rectTransform.anchoredPosition = new Vector2(0, 420);
            toast = UIKit.Label(tb.rectTransform, "", 38, Palette.Ink, TextAnchor.MiddleCenter, false);
            UIKit.Stretch(toast.rectTransform, 24, 8, 24, 8);
            tb.raycastTarget = false;
            tb.gameObject.SetActive(false);
        }

        Text Stat(RectTransform parent, int i, string label, out Text lbl, out Image box)
        {
            box = UIKit.Box(parent, new Color(0, 0, 0, 0.25f), 28, "Stat");
            var r = box.rectTransform;
            r.anchorMin = new Vector2(i / 3f, 0); r.anchorMax = new Vector2((i + 1) / 3f, 1);
            r.offsetMin = new Vector2(8, 0); r.offsetMax = new Vector2(-8, 0);
            lbl = UIKit.Label(r, label, 30, Palette.InkDim, TextAnchor.MiddleCenter, false);
            UIKit.Place(lbl.rectTransform, new Vector2(0.5f, 0.72f), new Vector2(300, 44));
            var v = UIKit.Label(r, "0", 54, Palette.Ink);
            UIKit.Place(v.rectTransform, new Vector2(0.5f, 0.32f), new Vector2(300, 70));
            return v;
        }

        GameButton Ctrl(RectTransform parent, int i, string label, Color face, Color edge, Color ink, System.Action a)
        {
            var btn = UIKit.Button(parent, label, face, edge, ink, a, 40);
            var r = (RectTransform)btn.transform;
            float w = i == 3 ? 1.35f : 1f, total = 4.35f, start = i * 1f / total;
            r.anchorMin = new Vector2(start, 0); r.anchorMax = new Vector2(start + w / total, 1);
            r.offsetMin = new Vector2(8, 0); r.offsetMax = new Vector2(-8, 0);
            return btn;
        }

        void Toast(string msg)
        {
            toast.text = msg;
            toast.transform.parent.gameObject.SetActive(true);
            toastTimer = 2.4f;
        }

        static string Fmt(float sec)
        {
            int s = Mathf.Max(0, Mathf.CeilToInt(sec));
            return $"{s / 60}:{s % 60:00}";
        }

        void UpdateHud()
        {
            movesTxt.text = session.Moves.ToString();
            if (session.MoveLimit > 0)
            {
                targetLbl.text = "Moves left";
                targetTxt.text = session.MovesLeft.ToString();
                targetBox.color = session.MovesLeft <= 2 ? new Color(0.91f, 0.27f, 0.35f, 0.55f) : new Color(0, 0, 0, 0.25f);
            }
            else
            {
                targetLbl.text = "Par";
                targetTxt.text = level.Par.ToString();
                targetBox.color = new Color(0, 0, 0, 0.25f);
            }
            undoBtn.Interactable = session.History.Count > 0 && Interactive;
            restartBtn.Interactable = hintBtn.Interactable = playBtn.Interactable = Interactive;
            playBtn.transform.Find("Face").GetComponent<Image>().color = session.Connection.Ok ? Painter.Hex("#ffb800") : Painter.Hex("#4cc38a");
            UpdateTime();
        }

        bool Interactive => session != null && session.State == SessionState.Playing && !board.Rolling;

        void UpdateTime()
        {
            if (session.TimeLimit > 0)
            {
                timeLbl.text = "Time left";
                timeTxt.text = Fmt(session.TimeLeft);
                timeBox.color = session.TimeLeft <= 10 && session.State == SessionState.Playing ? new Color(0.91f, 0.27f, 0.35f, 0.55f) : new Color(0, 0, 0, 0.25f);
            }
            else
            {
                timeLbl.text = "Time";
                timeTxt.text = Fmt(Mathf.Floor(session.Elapsed));
            }
        }

        void Status(string text, Color? c = null) { status.text = text; status.color = c ?? Palette.InkDim; }

        // ---------- level flow ----------
        void StartLevel(string m, int n)
        {
            CloseOverlay();
            mode = m;
            number = n;
            PlayerPrefs.SetString("bp.mode", mode);
            PlayerPrefs.SetInt("bp.level", number);
            level = GameData.Level(mode, number);
            LevelRules.LimitsFor(mode, level, GameData.Count(mode), out int ml, out float tl);
            session = new GameSession(level, mode, ml, tl);
            var tier = GameData.TierOf(mode, number);
            title.text = "Level " + number;
            chip.text = (mode == "classic" ? "" : (mode == "challenge" ? "Challenge · " : "Time Trial · ")) + tier.name;
            chipBg.color = Painter.Hex(tier.color);

            // largest centred square that fits the board area
            var area = boardArea.rect;
            float side = Mathf.Min(area.width, area.height, 1040);
            ((RectTransform)board.transform).sizeDelta = new Vector2(side, side);
            var skins = GameData.Skins;
            board.Skin = skins.skins.Find(s => s.id == PlayerPrefs.GetString("bp.ball", skins.defaultBall)) ?? skins.skins[0];
            board.Build(session, null);
            lastConnected = session.Connection.Ok;
            Status("Slide tiles to connect the pipe from start to goal.");
            UpdateHud();
        }

        void OnMoved(Move m)
        {
            Sfx.Play("slide");
            bool ok = session.Connection.Ok;
            if (ok && !lastConnected) Sfx.Play("connect");
            lastConnected = ok;
            if (ok) Status("Path complete! Press Play to roll the ball.", Painter.Hex("#7ff0c8"));
            else Status(session.MoveLimit > 0 && session.MovesLeft == 0 ? "No moves left. Press Play!" : "Keep sliding to connect the pipe.");
            UpdateHud();
        }

        void OnInvalid(int x, int y)
        {
            var t = session.Board.Get(x, y);
            if (t.IsEmpty) return;
            Sfx.Play("bump");
            string msg = t.Type == TileType.Start ? "The start tile is fixed in place."
                : t.Type == TileType.End ? "The goal tile is fixed in place."
                : t.Type == TileType.Block ? "Stone blocks never move."
                : t.Fixed ? "Bolted tiles cannot be moved."
                : session.Board.MovableDirs(x, y).Count > 1 ? "Drag the tile toward the slot you want." : "That tile has no empty slot next to it.";
            Status(msg, Painter.Hex("#ffb4a6"));
        }

        void Undo()
        {
            if (!Interactive) return;
            if (session.Undo(out var back)) { board.ShowMove(back); Sfx.Play("slide"); lastConnected = session.Connection.Ok; UpdateHud(); }
            else Toast("Nothing to undo");
        }

        void Restart()
        {
            if (session == null || board.Rolling) return;
            CloseOverlay();
            session.Restart();
            board.Sync();
            lastConnected = session.Connection.Ok;
            Status("Slide tiles to connect the pipe from start to goal.");
            UpdateHud();
        }

        void Hint()
        {
            if (!Interactive) return;
            Sfx.Play("hint");
            var h = session.Hint(out bool solved, out int remaining);
            if (solved) Toast("The path is complete. Press Play!");
            else if (h == null) Toast("This board has drifted far from a solution. Try Undo or Restart.");
            else
            {
                board.ShowHint(h.Value);
                Status($"Hint: slide the highlighted tile. {remaining} move{(remaining > 1 ? "s" : "")} to go.", Painter.Hex("#7ff0c8"));
            }
        }

        void Roll()
        {
            if (!Interactive) return;
            var trace = session.StartRoll();
            if (trace == null) return;
            UpdateHud();
            Sfx.StartRoll(board.Skin != null ? board.Skin.id : "ruby");
            board.Roll(trace, reduced,
                Sfx.RollIntensity,
                () => { Sfx.StopRoll(); Sfx.Play("win"); },
                tr => { Sfx.StopRoll(); Sfx.Play(tr.Fail == FailReason.Gap || tr.Fail == FailReason.Edge ? "drop" : "bump"); },
                ok => FinishRoll(ok, trace));
        }

        void FinishRoll(bool ok, TraceResult trace)
        {
            var outcome = session.FinishRoll(ok);
            if (outcome == RollOutcome.Won) Win();
            else if (outcome == RollOutcome.Lost) Lose("moves");
            else
            {
                Sfx.Play("fail");
                board.ResetBall();
                string why = trace.Fail switch
                {
                    FailReason.Gap => "The ball fell into an empty slot. Slide a pipe into the marked spot.",
                    FailReason.Blocked => "The ball hit a tile that doesn't connect. Fix the marked spot.",
                    FailReason.WrongSide => "The goal can only be entered from its open side.",
                    FailReason.Edge => "The ball rolled off the edge of the board.",
                    _ => "The path loops back on itself.",
                };
                ShowDialog("Path broken", why, null, ("Keep trying", true, CloseOverlay), ("Restart level", false, Restart));
                UpdateHud();
            }
        }

        void Win()
        {
            int stars = session.Stars();
            string key = $"bp.stars.{mode}.{number}";
            PlayerPrefs.SetInt(key, Mathf.Max(stars, PlayerPrefs.GetInt(key, 0)));
            PlayerPrefs.Save();
            bool last = number >= GameData.Count(mode);
            string note = session.Moves <= level.Par ? "Perfect! You matched par." : stars < 3 ? (mode == "timetrial" ? "Finish faster for more stars." : $"Solve it in {level.Par} moves for 3 stars.") : "";
            string movesText = mode == "timetrial" ? session.Moves.ToString() : $"{session.Moves} / {level.Par}";
            var info = $"{note}\n\nMoves {movesText}    Time {Fmt(session.Elapsed)}";
            StartCoroutine(ShowWinLater(stars, last ? "Final Level Cleared!" : "Level Complete!", info, last));
            UpdateHud();
        }

        IEnumerator ShowWinLater(int stars, string heading, string info, bool last)
        {
            yield return new WaitForSeconds(reduced ? 0.15f : 0.6f);
            ShowDialog(heading, info, stars, ("Next", true, Next), ("Replay", false, () => StartLevel(mode, number)));
        }

        void Next()
        {
            if (number < GameData.Count(mode)) StartLevel(mode, number + 1);
            else
            {
                int mi = System.Array.IndexOf(Modes, mode);
                StartLevel(Modes[(mi + 1) % Modes.Length], 1); // menus arrive in phase 4: go on to the next mode
            }
        }

        void Lose(string reason)
        {
            Sfx.StopRoll();
            Sfx.Play("fail");
            UpdateHud();
            ShowDialog(reason == "time" ? "Time's up!" : "Out of moves",
                reason == "time" ? "The clock ran out before the ball reached the goal. Give it another go!"
                                 : "You used every move without completing the path. Try a different route!",
                null, ("Restart level", true, Restart));
        }

        void Pause()
        {
            if (session == null || session.State != SessionState.Playing || overlay != null) return;
            session.Pause();
            ShowDialog("Paused", "", null, ("Resume", true, () => { session.Resume(); CloseOverlay(); }), ("Restart", false, Restart));
        }

        // ---------- dialogs ----------
        void CloseOverlay()
        {
            if (overlay != null) Destroy(overlay.gameObject);
            overlay = null;
            if (session != null) UpdateHud();
        }

        void ShowDialog(string heading, string body, int? stars, params (string label, bool primary, System.Action act)[] buttons)
        {
            CloseOverlay();
            overlay = UIKit.Rect("Overlay", root);
            UIKit.Stretch(overlay, -200, -200, -200, -200);
            var dim = overlay.gameObject.AddComponent<Image>();
            dim.color = Palette.Dim; // blocks touches to the board
            var panel = UIKit.Box(overlay, Palette.Panel, 56, "Panel");
            float h = 300 + (stars.HasValue ? 200 : 0) + (string.IsNullOrEmpty(body) ? 0 : 200) + buttons.Length * 160;
            UIKit.Place(panel.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(860, h));
            var pr = panel.rectTransform;
            float y = h / 2 - 110;
            var head = UIKit.Label(pr, heading, 68, Palette.PanelInk);
            UIKit.Place(head.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(780, 100), new Vector2(0, y));
            y -= 120;
            if (stars.HasValue)
            {
                for (int i = 0; i < 3; i++)
                {
                    var st = new GameObject("Star", typeof(RectTransform), typeof(Image)).GetComponent<Image>();
                    st.transform.SetParent(pr, false);
                    st.sprite = TileArt.Star();
                    st.color = i < stars.Value ? Palette.Gold : new Color(0.89f, 0.82f, 0.72f);
                    float size = i == 1 ? 190 : 150;
                    UIKit.Place(st.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(size, size), new Vector2((i - 1) * 190, y - 60 + (i == 1 ? 20 : 0)));
                    if (i < stars.Value) StartCoroutine(PopStar(st.rectTransform, i));
                }
                y -= 200;
            }
            if (!string.IsNullOrEmpty(body))
            {
                var bt = UIKit.Label(pr, body, 40, Palette.PanelDim, TextAnchor.MiddleCenter, false);
                UIKit.Place(bt.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(760, 190), new Vector2(0, y - 70));
                y -= 200;
            }
            foreach (var (label, primary, act) in buttons)
            {
                var btn = primary ? UIKit.Primary(pr, label, act) : UIKit.Plain(pr, label, act);
                UIKit.Place((RectTransform)btn.transform, new Vector2(0.5f, 0.5f), new Vector2(720, 130), new Vector2(0, y - 70));
                y -= 160;
            }
        }

        IEnumerator PopStar(RectTransform r, int i)
        {
            r.localScale = Vector3.zero;
            yield return new WaitForSeconds(0.3f + i * 0.32f);
            Sfx.Play("star" + i);
            float t = 0;
            while (t < 0.35f)
            {
                t += Time.deltaTime;
                float k = t / 0.35f;
                r.localScale = Vector3.one * (1 + Mathf.Sin(k * Mathf.PI) * 0.25f) * Mathf.Min(1, k * 1.6f);
                yield return null;
            }
            r.localScale = Vector3.one;
        }
    }
}
