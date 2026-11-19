// Ball Roll — phase 5 screens: Ball Collection (unlock by stars, buy with coins, coin ads,
// sound previews) and Gifts & Rewards (daily gift by ad then doubling coin cost, milestone gifts,
// themes, rolling sounds, history) plus the gift-opening reveal. Port of the web Gifts / Balls UI.
using System.Collections;
using BallRoll.Art;
using BallRoll.Core;
using BallRoll.UI;
using UnityEngine;
using UnityEngine.UI;

namespace BallRoll
{
    public sealed partial class App
    {
        // ---------- shared helpers ----------
        RectTransform Header(RectTransform parent, string title, string chipText, Color chipInk)
        {
            var top = UIKit.Rect("Top", parent);
            top.anchorMin = new Vector2(0, 1); top.anchorMax = new Vector2(1, 1); top.pivot = new Vector2(0.5f, 1);
            top.sizeDelta = new Vector2(-48, 150); top.anchoredPosition = new Vector2(0, -16);
            var back = UIKit.Button(top, "<", new Color(1, 1, 1, 0.12f), new Color(0, 0, 0, 0.25f), Palette.Ink, () => Show("home"), 60);
            UIKit.Place((RectTransform)back.transform, new Vector2(0, 0.5f), new Vector2(130, 130), new Vector2(65, 0));
            var h = UIKit.Label(top, title, 62, Palette.Ink);
            UIKit.Place(h.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(600, 100));
            var box = UIKit.Box(top, new Color(0, 0, 0, 0.25f), 40, "Chip");
            box.rectTransform.anchorMin = box.rectTransform.anchorMax = new Vector2(1, 0.5f);
            box.rectTransform.sizeDelta = new Vector2(230, 84); box.rectTransform.anchoredPosition = new Vector2(-115, 0);
            var t = UIKit.Label(box.rectTransform, chipText, 42, chipInk); UIKit.Stretch(t.rectTransform);
            return top;
        }

        static RectTransform Scroll(RectTransform parent, float top)
        {
            var view = UIKit.Rect("Scroll", parent);
            view.anchorMin = Vector2.zero; view.anchorMax = Vector2.one;
            view.offsetMin = new Vector2(24, 20); view.offsetMax = new Vector2(-24, -top);
            view.gameObject.AddComponent<RectMask2D>();
            view.gameObject.AddComponent<Image>().color = new Color(0, 0, 0, 0);
            var content = UIKit.Rect("Content", view);
            content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(0.5f, 1);
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content; sr.horizontal = false; sr.movementType = ScrollRect.MovementType.Clamped;
            return content;
        }

        static RectTransform Card(RectTransform content, float y, float h, Color? c = null)
        {
            var box = UIKit.Box(content, c ?? new Color(1, 1, 1, 0.08f), 40, "Card");
            var r = box.rectTransform;
            r.anchorMin = new Vector2(0, 1); r.anchorMax = new Vector2(1, 1); r.pivot = new Vector2(0.5f, 1);
            r.sizeDelta = new Vector2(0, h); r.anchoredPosition = new Vector2(0, y);
            return r;
        }

        static Text Line(RectTransform parent, string text, int size, Color c, float y, float h, TextAnchor a = TextAnchor.MiddleCenter, bool bold = false)
        {
            var t = UIKit.Label(parent, text, size, c, a, bold);
            t.supportRichText = true;
            var r = t.rectTransform;
            r.anchorMin = new Vector2(0, 1); r.anchorMax = new Vector2(1, 1); r.pivot = new Vector2(0.5f, 1);
            r.sizeDelta = new Vector2(-60, h); r.anchoredPosition = new Vector2(0, y);
            return t;
        }

        static Image Sprite(RectTransform parent, Sprite s, Vector2 size, Vector2 anchor, Vector2 pos)
        {
            var img = new GameObject("Img", typeof(RectTransform), typeof(Image)).GetComponent<Image>();
            img.transform.SetParent(parent, false);
            img.sprite = s;
            img.raycastTarget = false;
            UIKit.Place(img.rectTransform, anchor, size, pos);
            return img;
        }

        static GameButton At(GameButton b, Vector2 anchor, Vector2 size, Vector2 pos)
        {
            UIKit.Place((RectTransform)b.transform, anchor, size, pos);
            return b;
        }

        // ---------- Ball Collection ----------
        void BuildBalls()
        {
            Clear(ballsRt);
            int stars = SaveSystem.AllStars();
            Header(ballsRt, "Ball Collection", "★ " + stars, Palette.Gold);
            var ad = RewardService.AdCoins();
            var coinChip = UIKit.Box(ballsRt, new Color(0, 0, 0, 0.25f), 40, "Coins");
            UIKit.Place(coinChip.rectTransform, new Vector2(0.5f, 1), new Vector2(250, 90), new Vector2(-270, -230));
            var ct = UIKit.Label(coinChip.rectTransform, "● " + RewardService.State.coins, 44, Painter.Hex("#ffe08a")); UIKit.Stretch(ct.rectTransform);
            var adBtn = At(UIKit.Primary(ballsRt, ad.Left > 0 ? $"Watch ad +{ad.Coins} ●" : "No more ads today", WatchCoinAd), new Vector2(0.5f, 1), new Vector2(560, 110), new Vector2(150, -230));
            adBtn.Interactable = ad.Left > 0 && !RewardService.Busy;
            var desc = UIKit.Label(ballsRt, "Earn stars or buy with coins to unlock balls. Tap ▶ to hear one.", 34, Palette.InkDim, TextAnchor.MiddleCenter, false);
            desc.rectTransform.anchorMin = new Vector2(0, 1); desc.rectTransform.anchorMax = new Vector2(1, 1);
            desc.rectTransform.sizeDelta = new Vector2(-80, 90); desc.rectTransform.anchoredPosition = new Vector2(0, -330);

            var content = Scroll(ballsRt, 400);
            var selected = SaveSystem.SelectedBall().id;
            float y = 0, width = Mathf.Max(600, ballsRt.rect.width - 48), gap = 20, cw = (width - gap * 2) / 3, ch = 430;
            foreach (var col in GameData.Skins.collections)
            {
                var head = Line(content, col + " <size=30><color=#b9c8d6>Collection</color></size>", 42, Palette.Ink, y, 70, TextAnchor.MiddleLeft, true);
                y -= 80;
                int i = 0;
                foreach (var skin in GameData.Skins.skins.FindAll(s => s.collection == col))
                {
                    var sk = skin;
                    bool owned = RewardService.IsBallOwned(sk), sel = sk.id == selected;
                    var card = UIKit.Box(content, sel ? new Color(1, 0.8f, 0.2f, 0.16f) : new Color(1, 1, 1, 0.08f), 36, "Ball");
                    var r = card.rectTransform;
                    r.anchorMin = r.anchorMax = new Vector2(0, 1); r.pivot = new Vector2(0, 1);
                    r.sizeDelta = new Vector2(cw, ch); r.anchoredPosition = new Vector2((i % 3) * (cw + gap), y - (i / 3) * (ch + gap));
                    var img = Sprite(r, TileArt.Ball(sk), new Vector2(170, 170), new Vector2(0.5f, 1), new Vector2(0, -95));
                    if (!owned) img.color = new Color(0.55f, 0.55f, 0.55f, 0.85f);
                    var n = UIKit.Label(r, sk.name, 34, Palette.Ink); UIKit.Place(n.rectTransform, new Vector2(0.5f, 1), new Vector2(cw - 20, 50), new Vector2(0, -205));
                    var sd = UIKit.Label(r, sk.sound, 26, Palette.InkDim, TextAnchor.UpperCenter, false); UIKit.Place(sd.rectTransform, new Vector2(0.5f, 1), new Vector2(cw - 20, 70), new Vector2(0, -265));
                    if (!owned)
                    {
                        var tag = UIKit.Label(r, $"or {sk.cost - stars} more ★", 26, Palette.InkDim, TextAnchor.MiddleCenter, false);
                        UIKit.Place(tag.rectTransform, new Vector2(0.5f, 1), new Vector2(cw - 20, 36), new Vector2(0, -318));
                    }
                    int price = RewardService.BallPrice(sk);
                    var main = owned
                        ? UIKit.Button(r, sel ? "✓ In use" : "Use", sel ? Palette.Gold : Palette.Cream, sel ? Palette.GoldDark : Palette.CreamEdge, Palette.PanelInk, () => UseBall(sk), 32)
                        : UIKit.Button(r, "● " + price, Palette.Gold, Palette.GoldDark, Painter.Hex("#4a3200"), () => BuyBall(sk), 34);
                    At(main, new Vector2(0, 0), new Vector2(cw - 130, 84), new Vector2((cw - 130) / 2 + 14, 56));
                    if (sel) main.Interactable = true;
                    var pv = UIKit.Button(r, Sfx.Previewing == sk.id ? "■" : "▶", Palette.Teal, Palette.TealDark, Color.white, () => { if (Sfx.Previewing == sk.id) Sfx.StopPreview(); else Sfx.Preview(sk.id); BuildBallsKeepScroll(); }, 36);
                    pv.Quiet = true;
                    At(pv, new Vector2(1, 0), new Vector2(96, 84), new Vector2(-62, 56));
                    i++;
                }
                y -= ((i + 2) / 3) * (ch + gap) + 20;
            }
            content.sizeDelta = new Vector2(0, -y + 40);
            Sfx.PreviewEnded -= OnPreviewEnded;
            Sfx.PreviewEnded += OnPreviewEnded;
        }

        void OnPreviewEnded() { if (screen == "balls") BuildBallsKeepScroll(); }

        void BuildBallsKeepScroll()
        {
            var sr = ballsRt.GetComponentInChildren<ScrollRect>();
            float pos = sr != null ? sr.verticalNormalizedPosition : 1;
            BuildBalls();
            Canvas.ForceUpdateCanvases();
            var nsr = ballsRt.GetComponentInChildren<ScrollRect>();
            if (nsr != null) nsr.verticalNormalizedPosition = pos;
        }

        void UseBall(BallSkin s)
        {
            if (!RewardService.IsBallOwned(s)) return;
            SaveSystem.Data.ball = s.id;
            SaveSystem.Save();
            Toast(s.name + " selected");
            BuildBallsKeepScroll();
        }

        void BuyBall(BallSkin s)
        {
            int price = RewardService.BallPrice(s);
            if (RewardService.State.coins < price) { Toast($"You need {price - RewardService.State.coins} more coins. Watch an ad to earn coins!"); return; }
            Confirm($"Buy {s.name}?", $"It costs {price} coins. You have {RewardService.State.coins} coins.", $"Buy for {price}", () =>
            {
                var e = RewardService.BuyBall(s, price, out var why);
                if (e != null)
                {
                    Sfx.Play("win");
                    SaveSystem.Data.ball = s.id;
                    SaveSystem.Save();
                    Toast(s.name + " unlocked and selected!");
                }
                else Toast(why == "coins" ? "Not enough coins." : "Could not buy this ball. Please try again.");
                BuildBallsKeepScroll();
            }, true);
        }

        void WatchCoinAd()
        {
            RewardService.WatchAdForCoins((e, why) =>
            {
                if (e != null) { Sfx.Play("star2"); Toast($"+{e.amount} coins!"); }
                else if (why == "ad") Toast("Watch the whole ad to get the coins.");
                else if (why == "failed") Toast("Ad not available right now. Please try again later.");
                else if (why == "limit") Toast("No more coin ads today. Come back tomorrow!");
                if (screen == "balls") BuildBallsKeepScroll();
            });
        }

        // ---------- Gifts ----------
        void BuildGifts()
        {
            Clear(giftsRt);
            var st = RewardService.State;
            Header(giftsRt, "Gifts", "● " + st.coins, Painter.Hex("#ffe08a"));
            var content = Scroll(giftsRt, 190);
            float y = 0;

            // wallet
            var wallet = Card(content, y, 130, new Color(0, 0, 0, 0.22f));
            Line(wallet, $"● Coins  <b>{st.coins}</b>        ✚ Extra Moves  <b>{st.extraMoves}</b>", 42, Palette.Ink, -32, 70);
            y -= 160;

            // daily gift
            var next = RewardService.NextDaily();
            var daily = Card(content, y, 470, Painter.Hex("#8a5fd6"));
            Line(daily, "Daily Gift", 64, Color.white, -30, 90, TextAnchor.MiddleCenter, true);
            string ddesc = next.Kind == DailyKind.Ad ? "Today's first gift is free: watch a short ad to open it."
                : next.Kind == DailyKind.Coins ? "Open another gift with coins. The price doubles with each gift and resets tomorrow."
                : "You've opened every gift for today.";
            Line(daily, ddesc, 34, new Color(1, 1, 1, 0.9f), -120, 100);
            string dlabel = next.Kind == DailyKind.Ad ? "▶ Watch ad to open" : next.Kind == DailyKind.Coins ? $"Open for ● {next.Cost}" : "Come back tomorrow";
            var db = At(next.Kind == DailyKind.Coins ? UIKit.Button(daily, dlabel, Palette.Gold, Palette.GoldDark, Painter.Hex("#4a3200"), OpenDaily) : UIKit.Primary(daily, dlabel, OpenDaily),
                new Vector2(0.5f, 1), new Vector2(760, 130), new Vector2(0, -305));
            db.Interactable = next.Kind != DailyKind.Limit && !RewardService.Busy;
            string meta = $"Opened today: {next.Opened}" + (next.Kind == DailyKind.Coins && st.coins < next.Cost ? $" · You need {next.Cost - st.coins} more coins" : "");
            Line(daily, meta, 30, new Color(1, 1, 1, 0.8f), -400, 50);
            y -= 500;

            // milestone gift
            var m = RewardService.Milestone();
            var mile = Card(content, y, 440, Painter.Hex("#e8644a"));
            Line(mile, "Milestone Gift", 60, Color.white, -30, 90, TextAnchor.MiddleCenter, true);
            Line(mile, $"Clear {m.Every} levels, open a gift", 34, new Color(1, 1, 1, 0.9f), -115, 60);
            var bar = UIKit.Box(mile, new Color(0, 0, 0, 0.3f), 30, "Bar");
            UIKit.Place(bar.rectTransform, new Vector2(0.5f, 1), new Vector2(760, 64), new Vector2(0, -215));
            float fill = m.Available > 0 ? 1 : m.Progress / (float)m.Every;
            if (fill > 0)
            {
                var f = UIKit.Box(bar.rectTransform, Palette.Gold, 30, "Fill");
                f.rectTransform.anchorMin = new Vector2(0, 0); f.rectTransform.anchorMax = new Vector2(Mathf.Max(0.08f, fill), 1);
                f.rectTransform.offsetMin = f.rectTransform.offsetMax = Vector2.zero;
            }
            var bt = UIKit.Label(bar.rectTransform, m.Available > 0 ? $"{m.Available} gift{(m.Available > 1 ? "s" : "")} ready!" : $"{m.Progress} / {m.Every} levels", 34, Color.white);
            UIKit.Stretch(bt.rectTransform);
            int left = m.Every - m.Progress;
            var mb = At(UIKit.Primary(mile, m.Available > 0 ? "Open milestone gift" : $"Clear {left} more level{(left > 1 ? "s" : "")}", OpenMilestone),
                new Vector2(0.5f, 1), new Vector2(760, 130), new Vector2(0, -340));
            mb.Interactable = m.Available > 0 && !RewardService.Busy;
            y -= 470;

            // themes
            Line(content, "Game Themes <size=30><color=#b9c8d6>Win more from gifts</color></size>", 42, Palette.Ink, y, 70, TextAnchor.MiddleLeft, true);
            y -= 80;
            var cfg = RewardService.Cfg;
            var current = SaveSystem.Theme().id;
            float width = Mathf.Max(600, giftsRt.rect.width - 48), tw = (width - 40) / 3;
            for (int i = 0; i < cfg.themes.Count; i++)
            {
                var t = cfg.themes[i];
                bool owned = RewardService.IsThemeOwned(t.id), cur = t.id == current;
                var card = UIKit.Box(content, cur ? new Color(1, 0.8f, 0.2f, 0.16f) : new Color(1, 1, 1, 0.08f), 36, "Theme");
                var r = card.rectTransform;
                r.anchorMin = r.anchorMax = new Vector2(0, 1); r.pivot = new Vector2(0, 1);
                r.sizeDelta = new Vector2(tw, 300); r.anchoredPosition = new Vector2((i % 3) * (tw + 20), y - (i / 3) * 320);
                var sw = UIKit.Box(r, Painter.Hex(t.bg[0]), 30, "Swatch");
                UIKit.Place(sw.rectTransform, new Vector2(0.5f, 1), new Vector2(150, 150), new Vector2(0, -95));
                var tray = UIKit.Box(sw.rectTransform, Painter.Hex(t.tray[0]), 14, "Tray");
                UIKit.Place(tray.rectTransform, new Vector2(0.5f, 0.45f), new Vector2(84, 74));
                if (!owned) card.color = new Color(1, 1, 1, 0.04f);
                var nm = UIKit.Label(r, t.name, 30, owned ? Palette.Ink : Palette.InkDim); UIKit.Place(nm.rectTransform, new Vector2(0.5f, 1), new Vector2(tw - 10, 44), new Vector2(0, -200));
                var tid = t.id;
                var b = UIKit.Button(r, cur ? "✓ In use" : owned ? "Use" : "Gift", cur ? Palette.Gold : owned ? Palette.Cream : new Color(0, 0, 0, 0.25f),
                    cur ? Palette.GoldDark : owned ? Palette.CreamEdge : new Color(0, 0, 0, 0), owned ? Palette.PanelInk : Palette.InkDim,
                    () => { if (RewardService.SetTheme(tid)) { ApplyTheme(); Toast(t.name + " theme on"); BuildGifts(); } else Toast("Win this theme from a gift."); }, 28);
                At(b, new Vector2(0.5f, 0), new Vector2(tw - 40, 64), new Vector2(0, 46));
            }
            y -= ((cfg.themes.Count + 2) / 3) * 320 + 10;

            // rolling sounds
            Line(content, "Rolling Sounds <size=30><color=#b9c8d6>Use any sound with any ball</color></size>", 42, Palette.Ink, y, 70, TextAnchor.MiddleLeft, true);
            y -= 80;
            var ball = SaveSystem.SelectedBall();
            string rollSel = !string.IsNullOrEmpty(st.rollSound) && RewardService.IsSoundOwned(st.rollSound) ? st.rollSound : "";
            SoundRow(content, ref y, "", "Ball's own sound", ball.name + " · " + ball.sound, true, rollSel == "", ball.id);
            foreach (var sk in GameData.Skins.skins)
            {
                bool owned = RewardService.IsSoundOwned(sk.id);
                SoundRow(content, ref y, sk.id, sk.name, owned ? sk.sound : sk.sound + " · unlock the ball or win it", owned, rollSel == sk.id, sk.id);
            }
            y -= 10;

            // history
            Line(content, "Gift History", 42, Palette.Ink, y, 70, TextAnchor.MiddleLeft, true);
            y -= 80;
            if (st.history.Count == 0) { Line(content, "No gifts opened yet.", 34, Palette.InkDim, y, 60); y -= 70; }
            for (int i = 0; i < Mathf.Min(15, st.history.Count); i++)
            {
                var h = st.history[i];
                var d = RewardService.Describe(h);
                var row = Card(content, y, 100, new Color(0, 0, 0, 0.18f));
                var tx = UIKit.Label(row, $"<b>{d.name}</b>   <size=28><color=#b9c8d6>{RewardService.SourceLabel(h)} · {System.DateTimeOffset.FromUnixTimeMilliseconds(h.t).LocalDateTime:MMM d}</color></size>", 34, Palette.Ink, TextAnchor.MiddleLeft, false);
                tx.supportRichText = true;
                UIKit.Stretch(tx.rectTransform, 30, 0, 30, 0);
                y -= 112;
            }
            content.sizeDelta = new Vector2(0, -y + 40);
        }

        void SoundRow(RectTransform content, ref float y, string id, string title, string sub, bool owned, bool selected, string previewId)
        {
            var row = Card(content, y, 120, selected ? new Color(1, 0.8f, 0.2f, 0.14f) : new Color(1, 1, 1, owned ? 0.07f : 0.03f));
            var t = UIKit.Label(row, $"<b>{title}</b>\n<size=26><color=#b9c8d6>{sub}</color></size>", 32, owned ? Palette.Ink : Palette.InkDim, TextAnchor.MiddleLeft, false);
            t.supportRichText = true;
            UIKit.Stretch(t.rectTransform, 30, 0, 330, 0);
            if (owned)
            {
                var pv = UIKit.Button(row, Sfx.Previewing == previewId ? "■" : "▶", Palette.Teal, Palette.TealDark, Color.white, () => { if (Sfx.Previewing == previewId) Sfx.StopPreview(); else Sfx.Preview(previewId); }, 34);
                pv.Quiet = true;
                At(pv, new Vector2(1, 0.5f), new Vector2(96, 84), new Vector2(-260, 0));
            }
            var b = UIKit.Button(row, selected ? "✓ In use" : owned ? "Use" : "Locked", selected ? Palette.Gold : owned ? Palette.Cream : new Color(0, 0, 0, 0.25f),
                selected ? Palette.GoldDark : owned ? Palette.CreamEdge : new Color(0, 0, 0, 0), owned ? Palette.PanelInk : Palette.InkDim,
                () =>
                {
                    if (!owned || selected) return;
                    if (RewardService.SetRollSound(id)) { Toast(id == "" ? "Using the ball's own sound" : title + " sound selected"); BuildGiftsKeepScroll(); }
                }, 28);
            At(b, new Vector2(1, 0.5f), new Vector2(180, 84), new Vector2(-110, 0));
            y -= 132;
        }

        void BuildGiftsKeepScroll()
        {
            var sr = giftsRt.GetComponentInChildren<ScrollRect>();
            float pos = sr != null ? sr.verticalNormalizedPosition : 1;
            BuildGifts();
            Canvas.ForceUpdateCanvases();
            var nsr = giftsRt.GetComponentInChildren<ScrollRect>();
            if (nsr != null) nsr.verticalNormalizedPosition = pos;
        }

        void OpenDaily()
        {
            var next = RewardService.NextDaily();
            if (next.Kind == DailyKind.Ad)
            {
                RewardService.OpenDailyWithAd((e, failed) =>
                {
                    if (e != null) ShowReward(e);
                    else Toast(failed ? "Ad not available right now. Please try again later." : "Watch the whole ad to get the gift.");
                    if (screen == "gifts") BuildGiftsKeepScroll();
                });
            }
            else if (next.Kind == DailyKind.Coins)
            {
                var st = RewardService.State;
                if (st.coins < next.Cost) { Toast($"Not enough coins. This gift costs {next.Cost} coins."); return; }
                Confirm("Open another gift?", $"This gift costs {next.Cost} coins. You have {st.coins} coins.", $"Spend {next.Cost}", () =>
                {
                    var e = RewardService.OpenDailyWithCoins(next.Cost, out var why);
                    if (e != null) ShowReward(e); else Toast(why == "coins" ? "Not enough coins." : "The price changed. Please try again.");
                    if (screen == "gifts") BuildGiftsKeepScroll();
                }, true);
            }
        }

        public void OpenMilestone()
        {
            if (overlayRt != null) return; // a reveal is already showing: one gift per tap
            var e = RewardService.OpenMilestone();
            if (e != null) ShowReward(e);
            if (screen == "gifts") BuildGiftsKeepScroll();
        }

        // ---------- gift reveal ----------
        public void ShowReward(HistoryEntry e)
        {
            CloseOverlay();
            overlayRt = UIKit.Rect("Reward", root);
            UIKit.Stretch(overlayRt, -200, -200, -200, -200);
            overlayRt.gameObject.AddComponent<Image>().color = Palette.Dim;
            var panel = UIKit.Box(overlayRt, Palette.Panel, 56, "Panel");
            UIKit.Place(panel.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(860, 980));
            StartCoroutine(Reveal(panel.rectTransform, e));
        }

        IEnumerator Reveal(RectTransform pr, HistoryEntry e)
        {
            var d = RewardService.Describe(e);
            var title = UIKit.Label(pr, "Opening…", 62, Palette.PanelInk);
            UIKit.Place(title.rectTransform, new Vector2(0.5f, 1), new Vector2(760, 100), new Vector2(0, -90));
            var gift = UIKit.Box(pr, Painter.Hex("#e04a86"), 30, "Gift");
            UIKit.Place(gift.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(260, 220), new Vector2(0, 90));
            var ribbon = UIKit.Box(gift.rectTransform, Palette.Gold, 6, "Ribbon");
            UIKit.Place(ribbon.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(44, 220));
            Sfx.Play("hint");
            float t = 0, dur = SaveSystem.Settings.animations == "reduced" ? 0.15f : 1.1f;
            while (t < dur) { t += Time.deltaTime; gift.rectTransform.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(t * 20) * 8); yield return null; }
            Destroy(gift.gameObject);
            Sfx.Play("win");
            title.text = d.name;
            Sprite art = e.type == "ball" ? TileArt.Ball(GameData.Skins.skins.Find(s => s.id == e.item)) : null;
            if (art != null) Sprite(pr, art, new Vector2(300, 300), new Vector2(0.5f, 0.5f), new Vector2(0, 90));
            else if (e.type == "theme")
            {
                var th = RewardService.Cfg.themes.Find(x => x.id == e.item);
                var sw = UIKit.Box(pr, Painter.Hex(th.bg[0]), 40, "Swatch");
                UIKit.Place(sw.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(260, 260), new Vector2(0, 90));
                var tray = UIKit.Box(sw.rectTransform, Painter.Hex(th.tray[0]), 20, "Tray");
                UIKit.Place(tray.rectTransform, new Vector2(0.5f, 0.45f), new Vector2(150, 130));
            }
            else if (e.type == "coins")
            {
                Sprite(pr, TileArt.Disc(), new Vector2(240, 240), new Vector2(0.5f, 0.5f), new Vector2(0, 90)).color = Palette.GoldDark;
                Sprite(pr, TileArt.Disc(), new Vector2(200, 200), new Vector2(0.5f, 0.5f), new Vector2(0, 96)).color = Palette.Gold;
                var c = UIKit.Label(pr, "C", 120, Palette.GoldDark);
                UIKit.Place(c.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(200, 200), new Vector2(0, 96));
            }
            else
            {
                var box = UIKit.Box(pr, e.type == "moves" ? Palette.Teal : Painter.Hex("#7c6cff"), 50, "Icon");
                UIKit.Place(box.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(240, 240), new Vector2(0, 90));
                var ic = UIKit.Label(box.rectTransform, e.type == "moves" ? "+" + e.amount : "♪", 120, Color.white);
                UIKit.Stretch(ic.rectTransform);
            }
            var lab = UIKit.Label(pr, "YOU GOT: " + d.label.ToUpper(), 34, Palette.PanelDim);
            UIKit.Place(lab.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(760, 60), new Vector2(0, -110));
            bool canUse = e.type == "ball" || e.type == "theme" || e.type == "sound";
            if (canUse)
            {
                string use = e.type == "theme" ? "Use this theme" : e.type == "sound" ? "Use this sound" : "Use this ball";
                At(UIKit.Primary(pr, use, () =>
                {
                    if (e.type == "ball") { SaveSystem.Data.ball = e.item; SaveSystem.Save(); }
                    if (e.type == "theme") { RewardService.SetTheme(e.item); ApplyTheme(); }
                    if (e.type == "sound") RewardService.SetRollSound(e.item);
                    Toast(d.name + " is now in use");
                    CloseReward();
                }), new Vector2(0.5f, 0), new Vector2(720, 130), new Vector2(0, 250));
            }
            At(UIKit.Plain(pr, "Collect", CloseReward), new Vector2(0.5f, 0), new Vector2(720, 130), new Vector2(0, 100));
        }

        void CloseReward()
        {
            CloseOverlay();
            if (screen == "gifts") BuildGiftsKeepScroll();
            if (screen == "home") BuildHome();
            if (screen == "game") game.RefreshAfterReward();
        }
    }
}
