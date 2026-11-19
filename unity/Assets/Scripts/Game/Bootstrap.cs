// Ball Roll — phase 1 boot screen. Builds its UI in code (uGUI) and runs the migrated C# core
// on the device: loads the 60 levels, solves one with the BFS solver and generates today's Daily.
// Replaced by the real menu in phase 3/4.
using System.Diagnostics;
using BallRoll.Core;
using UnityEngine;
using UnityEngine.UI;

namespace BallRoll
{
    public sealed class Bootstrap : MonoBehaviour
    {
        static readonly Color Bg1 = new Color32(0x1e, 0x3d, 0x58, 255);
        static readonly Color Ink = new Color32(0xff, 0xf8, 0xec, 255);
        static readonly Color Gold = new Color32(0xff, 0xcc, 0x33, 255);

        void Start()
        {
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.SystemSetting;
            var cam = Camera.main;
            if (cam != null) { cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = Bg1; }

            var canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.matchWidthOrHeight = 0.5f;

            // safe area panel (notches / cutouts)
            var safe = new GameObject("SafeArea", typeof(RectTransform));
            safe.transform.SetParent(canvasGo.transform, false);
            var sr = (RectTransform)safe.transform;
            var area = Screen.safeArea;
            sr.anchorMin = new Vector2(area.xMin / Screen.width, area.yMin / Screen.height);
            sr.anchorMax = new Vector2(area.xMax / Screen.width, area.yMax / Screen.height);
            sr.offsetMin = sr.offsetMax = Vector2.zero;

            Label(sr, "Ball Roll", 120, Gold, new Vector2(0.5f, 0.78f), FontStyle.Bold);
            Label(sr, "Native Unity build", 48, Ink, new Vector2(0.5f, 0.70f), FontStyle.Normal);
            Label(sr, RunCoreChecks(), 40, Ink, new Vector2(0.5f, 0.45f), FontStyle.Normal);
        }

        static string RunCoreChecks()
        {
            var sw = Stopwatch.StartNew();
            int levels = 0;
            foreach (var m in GameData.ModeIds) levels += GameData.Count(m);
            var lv = GameData.Level("classic", 5);
            var solved = Pathfinding.Solve(Board.FromRows(lv.Rows));
            string today = LevelRules.DailyKey(System.DateTime.Now);
            var daily = LevelRules.Daily(today);
            sw.Stop();
            return $"{levels} levels loaded\n" +
                   $"Classic 5 solved in {solved.Moves?.Count} moves (par {lv.Par})\n" +
                   $"Daily {today}: par {daily?.Par}\n" +
                   $"{GameData.Skins.skins.Count} balls · {GameData.Rewards.themes.Count} themes\n" +
                   $"Core checks: {sw.ElapsedMilliseconds} ms";
        }

        static void Label(RectTransform parent, string text, int size, Color color, Vector2 anchor, FontStyle style)
        {
            var go = new GameObject("Label", typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = anchor;
            rt.sizeDelta = new Vector2(1000, 600);
            var t = go.GetComponent<Text>();
            t.text = text;
            t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            t.fontSize = size;
            t.fontStyle = style;
            t.color = color;
            t.alignment = TextAnchor.MiddleCenter;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
        }
    }
}
