// Ball Roll — app shell (phase 4): one canvas with the Home, Level select, Settings and Game
// screens, navigation, the Android back button, theme background and settings → audio.
using System.Collections.Generic;
using BallRoll.Art;
using BallRoll.Core;
using BallRoll.UI;
using UnityEngine;
using UnityEngine.UI;

namespace BallRoll
{
    public sealed partial class App : MonoBehaviour
    {
        public static App I { get; private set; }
        public RectTransform Root => root;

        RectTransform root, homeRt, levelsRt, ballsRt, giftsRt, overlayRt;
        RawImage background;
        GameScreen game;
        string screen = "home";
        string levelsMode = "classic";
        Text toast;
        float toastTimer;

        void Awake() { I = this; }

        void Start()
        {
            Application.targetFrameRate = 60;
            Input.multiTouchEnabled = false;
            SaveSystem.Load();
            ApplySettings();
            Sfx.Init(SaveSystem.SelectedBall().id);
            Analytics.SetEnabled(SaveSystem.Settings.analytics);
            Analytics.Init();
            root = UIKit.CreateRoot("BallRoll");
            background = root.parent.Find("Background").GetComponent<RawImage>();
            ApplyTheme();

            var gameRt = UIKit.Rect("GameScreen", root);
            UIKit.Stretch(gameRt);
            game = gameRt.gameObject.AddComponent<GameScreen>();
            game.Build(gameRt);
            homeRt = UIKit.Rect("Home", root); UIKit.Stretch(homeRt);
            levelsRt = UIKit.Rect("Levels", root); UIKit.Stretch(levelsRt);
            ballsRt = UIKit.Rect("Balls", root); UIKit.Stretch(ballsRt);
            giftsRt = UIKit.Rect("Gifts", root); UIKit.Stretch(giftsRt);
            BuildToast();
            Show("home");
            Sfx.StartMusic();
            AdsManager.BannerChanged += FitAboveBanner;
            AdsManager.Start(); // consent, then SDK init and ad preloading
        }

        /// <summary>Keep the UI above the banner (menus only; gameplay has no banner).</summary>
        void FitAboveBanner()
        {
            var canvas = root.GetComponentInParent<Canvas>();
            float units = AdsManager.BannerHeightPx / Mathf.Max(0.01f, canvas.scaleFactor);
            root.offsetMin = new Vector2(root.offsetMin.x, units);
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.Escape)) Back();
            if (toastTimer > 0 && (toastTimer -= Time.deltaTime) <= 0) toast.transform.parent.gameObject.SetActive(false);
        }

        void OnApplicationPause(bool p) { if (p) { SaveSystem.Save(); Analytics.SessionEnd(); } }
        void OnApplicationQuit() { Analytics.SessionEnd(); }

        // ---------- navigation ----------
        public void Show(string name)
        {
            CloseOverlay();
            screen = name;
            Analytics.ScreenView(name);
            homeRt.gameObject.SetActive(name == "home");
            levelsRt.gameObject.SetActive(name == "levels");
            ballsRt.gameObject.SetActive(name == "balls");
            giftsRt.gameObject.SetActive(name == "gifts");
            if (name != "balls" && name != "gifts") Sfx.StopPreview();
            game.SetVisible(name == "game");
            AdsManager.ShowBanner(name != "game"); // banners on menu screens only, never during play
            if (name == "home") BuildHome();
            if (name == "levels") BuildLevels(levelsMode);
            if (name == "balls") BuildBalls();
            if (name == "gifts") BuildGifts();
        }

        void Back()
        {
            if (overlayRt != null) { CloseOverlay(); return; }
            if (screen == "game") { if (!game.HandleBack()) Show("home"); return; }
            if (screen == "levels" || screen == "balls" || screen == "gifts") { Show("home"); return; }
            Application.Quit(); // Home: leave the app (Android default)
        }

        public void ShowLevels(string mode) { levelsMode = mode == "daily" ? "classic" : mode; Show("levels"); }

        public void PlayLevel(string mode, int n, bool resume = true)
        {
            Show("game");
            game.Play(mode, n, resume);
        }

        public void PlayDaily()
        {
            Show("game");
            game.PlayDaily();
        }

        public void ApplySettings()
        {
            var s = SaveSystem.Settings;
            Sfx.SoundOn = s.sound;
            Sfx.MusicOn = s.music;
            Sfx.Master = s.volumes.master; Sfx.RollVol = s.volumes.roll; Sfx.SfxVol = s.volumes.sfx; Sfx.MusicVol = s.volumes.music;
            Sfx.ApplyVolumes();
        }

        public void ApplyTheme()
        {
            var t = SaveSystem.Theme();
            var tex = new Texture2D(1, 64) { wrapMode = TextureWrapMode.Clamp };
            Color top = Painter.Hex(t.bg[0]), bottom = Painter.Hex(t.bg[1]);
            for (int i = 0; i < 64; i++) tex.SetPixel(0, i, Color.Lerp(bottom, top, i / 63f));
            tex.Apply();
            background.texture = tex;
            var cam = Camera.main;
            if (cam != null) cam.backgroundColor = bottom;
        }

        public void Toast(string msg)
        {
            toast.text = msg;
            toast.transform.parent.gameObject.SetActive(true);
            toast.transform.parent.SetAsLastSibling();
            toastTimer = 2.4f;
        }

        void BuildToast()
        {
            var tb = UIKit.Box(root, new Color(0.04f, 0.08f, 0.13f, 0.92f), 30, "Toast");
            tb.rectTransform.anchorMin = tb.rectTransform.anchorMax = new Vector2(0.5f, 0);
            tb.rectTransform.sizeDelta = new Vector2(900, 120);
            tb.rectTransform.anchoredPosition = new Vector2(0, 420);
            tb.raycastTarget = false;
            toast = UIKit.Label(tb.rectTransform, "", 38, Palette.Ink, TextAnchor.MiddleCenter, false);
            UIKit.Stretch(toast.rectTransform, 24, 8, 24, 8);
            tb.gameObject.SetActive(false);
        }

        static void Clear(RectTransform r) { foreach (Transform c in r) Destroy(c.gameObject); }

        // ---------- Home ----------
        void BuildHome()
        {
            Clear(homeRt);
            float y = 640;
            var logo = UIKit.Label(homeRt, "Ball Roll", 150, Palette.Gold);
            UIKit.Place(logo.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(1000, 190), new Vector2(0, y));
            var tag = UIKit.Label(homeRt, "SLIDE · CONNECT · ROLL", 40, Palette.InkDim, TextAnchor.MiddleCenter, false);
            UIKit.Place(tag.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(1000, 60), new Vector2(0, y - 115));

            // stars + coins
            Chip(homeRt, "★ " + SaveSystem.AllStars(), Palette.Gold, new Vector2(-130, y - 220));
            Chip(homeRt, "● " + SaveSystem.Data.rewards.coins, Painter.Hex("#ffe08a"), new Vector2(130, y - 220));

            // Play: continue the current Classic level
            var cur = SaveSystem.Current;
            int n = cur != null && cur.mode == "classic" ? cur.number : SaveSystem.NextLevelFor("classic");
            bool allDone = SaveSystem.Mode("classic").levels.Count >= GameData.Count("classic");
            string sub = cur != null && cur.mode == "classic" ? $"Continue level {n}" : allDone ? "All levels complete!" : $"Level {n}";
            var play = UIKit.Button(homeRt, "Play\n<size=38>" + sub + "</size>", Palette.Coral, Palette.CoralDark, Color.white, () => PlayLevel("classic", n), 72);
            play.Text.supportRichText = true;
            UIKit.Place((RectTransform)play.transform, new Vector2(0.5f, 0.5f), new Vector2(880, 220), new Vector2(0, y - 420));

            // 3-column tiles
            var tiles = new (string label, Color face, Color edge, Color ink, System.Action act)[]
            {
                ("Levels", Palette.Teal, Palette.TealDark, Color.white, () => ShowLevels(SaveSystem.Data.lastMode)),
                ("Daily", Painter.Hex("#f06aa8"), Painter.Hex("#b83c78"), Color.white, PlayDaily),
                ("Challenge", Palette.Gold, Palette.GoldDark, Painter.Hex("#4a3200"), () => ShowLevels("challenge")),
                ("Time Trial", Painter.Hex("#7c6cff"), Painter.Hex("#5040c8"), Color.white, () => ShowLevels("timetrial")),
                ("Balls", Painter.Hex("#f08a2c"), Painter.Hex("#b45e14"), Color.white, () => Show("balls")),
                ("Gifts", Painter.Hex("#9a5ee8"), Painter.Hex("#6a34b0"), Color.white, () => Show("gifts")),
            };
            for (int i = 0; i < tiles.Length; i++)
            {
                var t = tiles[i];
                var b = UIKit.Button(homeRt, t.label, t.face, t.edge, t.ink, t.act, 42);
                int col = i % 3, row = i / 3;
                UIKit.Place((RectTransform)b.transform, new Vector2(0.5f, 0.5f), new Vector2(285, 190), new Vector2((col - 1) * 300, y - 690 - row * 215));
            }
            var dailyDone = SaveSystem.DailyResultFor(LevelRules.DailyKey(System.DateTime.Now)) != null;
            Badge(homeRt, dailyDone ? "✓ Done" : "New", dailyDone ? Painter.Hex("#4cc38a") : Palette.Gold, new Vector2(110, y - 600));
            int ready = RewardService.ReadyCount();
            if (ready > 0) Badge(homeRt, ready.ToString(), Palette.Coral, new Vector2(355, y - 815));

            // footer
            var s = SaveSystem.Settings;
            var set = UIKit.Button(homeRt, "Settings", new Color(1, 1, 1, 0.12f), new Color(0, 0, 0, 0.3f), Palette.Ink, OpenSettings, 36);
            UIKit.Place((RectTransform)set.transform, new Vector2(0.5f, 0.5f), new Vector2(260, 120), new Vector2(-280, y - 1170));
            var snd = UIKit.Button(homeRt, s.sound ? "Sound on" : "Sound off", new Color(1, 1, 1, 0.12f), new Color(0, 0, 0, 0.3f), Palette.Ink, null, 34);
            UIKit.Place((RectTransform)snd.transform, new Vector2(0.5f, 0.5f), new Vector2(260, 120), new Vector2(0, y - 1170));
            snd.Init(snd.transform.Find("Face").GetComponent<Image>(), snd.Text, () => { s.sound = !s.sound; SaveSystem.Save(); ApplySettings(); snd.Text.text = s.sound ? "Sound on" : "Sound off"; });
            var mus = UIKit.Button(homeRt, s.music ? "Music on" : "Music off", new Color(1, 1, 1, 0.12f), new Color(0, 0, 0, 0.3f), Palette.Ink, null, 34);
            UIKit.Place((RectTransform)mus.transform, new Vector2(0.5f, 0.5f), new Vector2(260, 120), new Vector2(280, y - 1170));
            mus.Init(mus.transform.Find("Face").GetComponent<Image>(), mus.Text, () => { s.music = !s.music; SaveSystem.Save(); ApplySettings(); Sfx.StartMusic(); mus.Text.text = s.music ? "Music on" : "Music off"; });
        }

        static void Chip(RectTransform parent, string text, Color ink, Vector2 pos)
        {
            var box = UIKit.Box(parent, new Color(0, 0, 0, 0.25f), 40, "Chip");
            UIKit.Place(box.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(230, 84), pos);
            var t = UIKit.Label(box.rectTransform, text, 42, ink);
            UIKit.Stretch(t.rectTransform);
        }

        static void Badge(RectTransform parent, string text, Color c, Vector2 pos)
        {
            var box = UIKit.Box(parent, c, 26, "Badge");
            UIKit.Place(box.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(150, 52), pos);
            box.raycastTarget = false;
            var t = UIKit.Label(box.rectTransform, text, 30, Painter.Hex("#3a2414"));
            UIKit.Stretch(t.rectTransform);
        }

        // ---------- Level select ----------
        void BuildLevels(string mode)
        {
            Clear(levelsRt);
            levelsMode = mode;
            var top = UIKit.Rect("Top", levelsRt);
            top.anchorMin = new Vector2(0, 1); top.anchorMax = new Vector2(1, 1); top.pivot = new Vector2(0.5f, 1);
            top.sizeDelta = new Vector2(-48, 150); top.anchoredPosition = new Vector2(0, -16);
            var back = UIKit.Button(top, "<", new Color(1, 1, 1, 0.12f), new Color(0, 0, 0, 0.25f), Palette.Ink, () => Show("home"), 60);
            UIKit.Place((RectTransform)back.transform, new Vector2(0, 0.5f), new Vector2(130, 130), new Vector2(65, 0));
            var h = UIKit.Label(top, "Levels", 66, Palette.Ink);
            UIKit.Place(h.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(500, 100));
            Chip(top, $"★ {SaveSystem.TotalStars(mode)}/{GameData.Count(mode) * 3}", Palette.Gold, Vector2.zero);
            var chip = top.GetChild(top.childCount - 1) as RectTransform;
            chip.anchorMin = chip.anchorMax = new Vector2(1, 0.5f);
            chip.anchoredPosition = new Vector2(-130, 0);
            chip.sizeDelta = new Vector2(250, 84);

            // tabs
            var tabs = UIKit.Box(levelsRt, new Color(0, 0, 0, 0.25f), 50, "Tabs");
            tabs.rectTransform.anchorMin = new Vector2(0, 1); tabs.rectTransform.anchorMax = new Vector2(1, 1); tabs.rectTransform.pivot = new Vector2(0.5f, 1);
            tabs.rectTransform.sizeDelta = new Vector2(-48, 110); tabs.rectTransform.anchoredPosition = new Vector2(0, -190);
            string[] ids = { "classic", "challenge", "timetrial" }, names = { "Classic", "Challenge", "Time" };
            for (int i = 0; i < 3; i++)
            {
                string id = ids[i];
                bool sel = id == mode;
                var b = UIKit.Button(tabs.rectTransform, names[i], sel ? Palette.Panel : new Color(0, 0, 0, 0), sel ? Painter.Hex("#c7a57b") : new Color(0, 0, 0, 0), sel ? Palette.PanelInk : Palette.InkDim, () => BuildLevels(id), 40);
                var r = (RectTransform)b.transform;
                r.anchorMin = new Vector2(i / 3f, 0); r.anchorMax = new Vector2((i + 1) / 3f, 1);
                r.offsetMin = new Vector2(8, 10); r.offsetMax = new Vector2(-8, -6);
            }
            var desc = UIKit.Label(levelsRt, GameData.Mode(mode).desc, 36, Palette.InkDim, TextAnchor.MiddleCenter, false);
            desc.rectTransform.anchorMin = new Vector2(0, 1); desc.rectTransform.anchorMax = new Vector2(1, 1);
            desc.rectTransform.sizeDelta = new Vector2(-80, 110); desc.rectTransform.anchoredPosition = new Vector2(0, -375);

            // scrolling grid
            var view = UIKit.Rect("Scroll", levelsRt);
            view.anchorMin = Vector2.zero; view.anchorMax = Vector2.one;
            view.offsetMin = new Vector2(24, 20); view.offsetMax = new Vector2(-24, -440);
            view.gameObject.AddComponent<RectMask2D>();
            var img = view.gameObject.AddComponent<Image>(); img.color = new Color(0, 0, 0, 0);
            var content = UIKit.Rect("Content", view);
            content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(0.5f, 1);
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content; sr.horizontal = false; sr.movementType = ScrollRect.MovementType.Clamped;

            int count = GameData.Count(mode), next = SaveSystem.NextLevelFor(mode);
            // 5 columns that always fit the screen width (safe area minus margins)
            float gap = 22, width = Mathf.Max(600, levelsRt.rect.width - 48);
            float y = -10, cellW = Mathf.Floor((width - gap * 4) / 5);
            foreach (var tier in GameData.Mode(mode).tiers)
            {
                if (tier.from > count) continue;
                int to = Mathf.Min(tier.to, count);
                var dot = UIKit.Box(content, Painter.Hex(tier.color), 8, "Dot");
                dot.rectTransform.anchorMin = dot.rectTransform.anchorMax = new Vector2(0, 1);
                dot.rectTransform.sizeDelta = new Vector2(30, 30); dot.rectTransform.anchoredPosition = new Vector2(30, y - 40);
                var th = UIKit.Label(content, $"{tier.name}  <size=32><color=#b9c8d6>Levels {tier.from}–{to}</color></size>", 42, Palette.Ink, TextAnchor.MiddleLeft);
                th.supportRichText = true;
                th.rectTransform.anchorMin = th.rectTransform.anchorMax = new Vector2(0, 1); th.rectTransform.pivot = new Vector2(0, 0.5f);
                th.rectTransform.sizeDelta = new Vector2(900, 60); th.rectTransform.anchoredPosition = new Vector2(64, y - 40);
                y -= 90;
                int col = 0;
                for (int n = tier.from; n <= to; n++)
                {
                    bool unlocked = SaveSystem.IsUnlocked(mode, n);
                    var res = SaveSystem.Result(mode, n);
                    int lv = n;
                    string label = unlocked ? $"{n}\n<size=34><color=#{(res != null ? "ffcc33" : "9a7a5a")}>{Stars(res?.stars ?? 0)}</color></size>" : "🔒";
                    var b = UIKit.Button(content, unlocked ? label : "Locked", unlocked ? (n == next && res == null ? Painter.Hex("#ffd36b") : Painter.Hex("#f6d197")) : Painter.Hex("#56606d"),
                        unlocked ? Painter.Hex("#8a5228") : Painter.Hex("#424b57"), unlocked ? Palette.PanelInk : Palette.InkDim,
                        unlocked ? (System.Action)(() => PlayLevel(mode, lv)) : () => Toast("Finish the level before to unlock this one."), unlocked ? 56 : 30);
                    b.Text.supportRichText = true;
                    var r = (RectTransform)b.transform;
                    r.anchorMin = r.anchorMax = new Vector2(0, 1); r.pivot = new Vector2(0, 1);
                    r.sizeDelta = new Vector2(cellW, cellW);
                    r.anchoredPosition = new Vector2(col * (cellW + gap), y);
                    if (++col == 5) { col = 0; y -= cellW + gap; }
                }
                if (col != 0) y -= cellW + gap;
                y -= 20;
            }
            content.sizeDelta = new Vector2(0, -y + 40);
        }

        static string Stars(int n) => new string('★', n) + new string('☆', 3 - n);

        // ---------- Settings ----------
        public void OpenSettings()
        {
            CloseOverlay();
            var s = SaveSystem.Settings;
            overlayRt = UIKit.Rect("Settings", root);
            UIKit.Stretch(overlayRt, -200, -200, -200, -200);
            overlayRt.gameObject.AddComponent<Image>().color = Palette.Dim;
            var panel = UIKit.Box(overlayRt, Palette.Panel, 56, "Panel");
            UIKit.Place(panel.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(900, 1850));
            var pr = panel.rectTransform;
            var h = UIKit.Label(pr, "Settings", 70, Palette.PanelInk);
            UIKit.Place(h.rectTransform, new Vector2(0.5f, 1), new Vector2(700, 100), new Vector2(0, -90));
            float y = -210;
            Toggle(pr, "Sound effects", s.sound, v => { s.sound = v; Changed(); }, ref y);
            Toggle(pr, "Music", s.music, v => { s.music = v; Changed(); Sfx.StartMusic(); }, ref y);
            Toggle(pr, "Vibration", s.vibration, v => { s.vibration = v; Changed(); if (v) Haptics.Buzz(); }, ref y);
            SliderRow(pr, "Master volume", s.volumes.master, v => { s.volumes.master = v; Changed(); }, ref y);
            SliderRow(pr, "Ball rolling", s.volumes.roll, v => { s.volumes.roll = v; Changed(); }, ref y);
            SliderRow(pr, "Sound effects", s.volumes.sfx, v => { s.volumes.sfx = v; Changed(); }, ref y);
            SliderRow(pr, "Music", s.volumes.music, v => { s.volumes.music = v; Changed(); }, ref y);
            Toggle(pr, "Reduced animations", s.animations == "reduced", v => { s.animations = v ? "reduced" : "full"; Changed(); }, ref y);
            Toggle(pr, "Analytics", s.analytics, v => { s.analytics = v; Changed(); Analytics.SetEnabled(v); }, ref y);
            if (AdsManager.PrivacyOptionsRequired)
            {
                var priv = UIKit.Plain(pr, "Privacy options", () => AdsManager.ShowPrivacyOptions(null));
                UIKit.Place((RectTransform)priv.transform, new Vector2(0.5f, 0), new Vector2(760, 110), new Vector2(0, 400));
            }
            var done = UIKit.Primary(pr, "Done", CloseOverlay);
            UIKit.Place((RectTransform)done.transform, new Vector2(0.5f, 0), new Vector2(760, 130), new Vector2(0, 250));
            var reset = UIKit.Button(pr, "Reset progress", Palette.Danger, Painter.Hex("#a82638"), Color.white, ConfirmReset, 44);
            UIKit.Place((RectTransform)reset.transform, new Vector2(0.5f, 0), new Vector2(760, 130), new Vector2(0, 100));
        }

        void Changed() { SaveSystem.Save(); ApplySettings(); }

        static void Toggle(RectTransform parent, string label, bool on, System.Action<bool> set, ref float y)
        {
            var row = UIKit.Box(parent, Painter.Hex("#f3e2c6"), 30, "Row");
            UIKit.Place(row.rectTransform, new Vector2(0.5f, 1), new Vector2(780, 110), new Vector2(0, y));
            var l = UIKit.Label(row.rectTransform, label, 40, Palette.PanelInk, TextAnchor.MiddleLeft, false);
            UIKit.Stretch(l.rectTransform, 36, 0, 220, 0);
            GameButton b = null;
            bool state = on;
            b = UIKit.Button(row.rectTransform, state ? "On" : "Off", state ? Palette.Teal : Painter.Hex("#c9b79c"), state ? Palette.TealDark : Painter.Hex("#a08a6a"), Color.white, null, 36);
            UIKit.Place((RectTransform)b.transform, new Vector2(1, 0.5f), new Vector2(170, 84), new Vector2(-110, 0));
            var face = b.transform.Find("Face").GetComponent<Image>();
            var edge = b.transform.Find("Edge").GetComponent<Image>();
            b.Init(face, b.Text, () =>
            {
                state = !state;
                b.Text.text = state ? "On" : "Off";
                face.color = state ? Palette.Teal : Painter.Hex("#c9b79c");
                edge.color = state ? Palette.TealDark : Painter.Hex("#a08a6a");
                set(state);
            });
            y -= 130;
        }

        static void SliderRow(RectTransform parent, string label, float value, System.Action<float> set, ref float y)
        {
            var row = UIKit.Box(parent, Painter.Hex("#f3e2c6"), 30, "Row");
            UIKit.Place(row.rectTransform, new Vector2(0.5f, 1), new Vector2(780, 130), new Vector2(0, y - 10));
            var l = UIKit.Label(row.rectTransform, label, 38, Palette.PanelInk, TextAnchor.UpperLeft, false);
            UIKit.Stretch(l.rectTransform, 36, 14, 160, 50);
            var pct = UIKit.Label(row.rectTransform, Mathf.RoundToInt(value * 100) + "%", 36, Palette.PanelDim, TextAnchor.UpperRight);
            UIKit.Stretch(pct.rectTransform, 500, 14, 36, 50);

            var sRt = UIKit.Rect("Slider", row.rectTransform);
            sRt.anchorMin = new Vector2(0, 0); sRt.anchorMax = new Vector2(1, 0);
            sRt.offsetMin = new Vector2(40, 18); sRt.offsetMax = new Vector2(-40, 58);
            var bg = UIKit.Box(sRt, Painter.Hex("#d9c3a2"), 14, "Track"); UIKit.Stretch(bg.rectTransform, 0, 12, 0, 12);
            var fillArea = UIKit.Rect("Fill Area", sRt); UIKit.Stretch(fillArea, 0, 12, 0, 12);
            var fill = UIKit.Box(fillArea, Palette.Teal, 14, "Fill"); UIKit.Stretch(fill.rectTransform);
            var handleArea = UIKit.Rect("Handle Area", sRt); UIKit.Stretch(handleArea);
            var handle = new GameObject("Handle", typeof(RectTransform), typeof(Image)).GetComponent<Image>();
            handle.transform.SetParent(handleArea, false);
            handle.sprite = TileArt.Disc(); handle.color = Palette.TealDark;
            handle.rectTransform.sizeDelta = new Vector2(52, 0);
            var slider = sRt.gameObject.AddComponent<Slider>();
            slider.fillRect = fill.rectTransform;
            slider.handleRect = handle.rectTransform;
            slider.targetGraphic = handle;
            slider.value = value;
            slider.onValueChanged.AddListener(v => { pct.text = Mathf.RoundToInt(v * 100) + "%"; set(v); });
            y -= 150;
        }

        void ConfirmReset()
        {
            Confirm("Reset all progress?", "Stars, unlocked levels, best scores, coins and rewards will be erased. Settings are kept.", "Reset", () =>
            {
                SaveSystem.ResetProgress();
                ApplyTheme();
                Toast("Progress reset");
                Show("home");
            });
        }

        public void Confirm(string title, string msg, string yes, System.Action onYes) => Confirm(title, msg, yes, onYes, false);

        public void Confirm(string title, string msg, string yes, System.Action onYes, bool gold)
        {
            CloseOverlay();
            overlayRt = UIKit.Rect("Confirm", root);
            UIKit.Stretch(overlayRt, -200, -200, -200, -200);
            overlayRt.gameObject.AddComponent<Image>().color = Palette.Dim;
            var panel = UIKit.Box(overlayRt, Palette.Panel, 56, "Panel");
            UIKit.Place(panel.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(860, 640));
            var pr = panel.rectTransform;
            var h = UIKit.Label(pr, title, 62, Palette.PanelInk);
            UIKit.Place(h.rectTransform, new Vector2(0.5f, 1), new Vector2(760, 100), new Vector2(0, -90));
            var m = UIKit.Label(pr, msg, 38, Palette.PanelDim, TextAnchor.MiddleCenter, false);
            UIKit.Place(m.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(760, 200), new Vector2(0, 30));
            var no = UIKit.Plain(pr, "Cancel", CloseOverlay);
            UIKit.Place((RectTransform)no.transform, new Vector2(0.5f, 0), new Vector2(360, 130), new Vector2(-195, 110));
            bool done = false;
            var y = UIKit.Button(pr, yes, gold ? Palette.Coral : Palette.Danger, gold ? Palette.CoralDark : Painter.Hex("#a82638"), Color.white, () => { if (done) return; done = true; CloseOverlay(); onYes(); }, 44);
            UIKit.Place((RectTransform)y.transform, new Vector2(0.5f, 0), new Vector2(360, 130), new Vector2(195, 110));
        }

        public void CloseOverlay()
        {
            if (overlayRt != null) Destroy(overlayRt.gameObject);
            overlayRt = null;
        }
    }

    /// <summary>Short vibration, respecting the Vibration setting.</summary>
    public static class Haptics
    {
        public static void Buzz()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!SaveSystem.Settings.vibration) return;
            try
            {
                using var unity = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
                using var activity = unity.GetStatic<AndroidJavaObject>("currentActivity");
                using var vib = activity.Call<AndroidJavaObject>("getSystemService", "vibrator");
                vib?.Call("vibrate", 25L);
            }
            catch (System.Exception) { /* no vibrator */ }
#endif
        }
    }
}
