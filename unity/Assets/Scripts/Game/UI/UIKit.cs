// Ball Roll — small helpers that build the uGUI interface in code (canvas with safe area, text with
// the game's Fredoka font, chunky 3D buttons, panels). The look follows the web game's CSS.
using System;
using BallRoll.Art;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace BallRoll.UI
{
    public static class Palette
    {
        public static readonly Color Bg1 = Painter.Hex("#1e3d58"), Bg2 = Painter.Hex("#0f1e2e");
        public static readonly Color Ink = Painter.Hex("#fff8ec"), InkDim = Painter.Hex("#b9c8d6");
        public static readonly Color Panel = Painter.Hex("#fff6e6"), PanelInk = Painter.Hex("#3a2414"), PanelDim = Painter.Hex("#8a6a4e");
        public static readonly Color Coral = Painter.Hex("#ff6b4a"), CoralDark = Painter.Hex("#c4402a");
        public static readonly Color Teal = Painter.Hex("#2fc4b6"), TealDark = Painter.Hex("#1b8a80");
        public static readonly Color Gold = Painter.Hex("#ffcc33"), GoldDark = Painter.Hex("#c99300");
        public static readonly Color Danger = Painter.Hex("#e8445a");
        public static readonly Color Cream = Painter.Hex("#fffaf0"), CreamEdge = Painter.Hex("#d6b68c");
        public static readonly Color Dim = new Color(0.03f, 0.06f, 0.1f, 0.72f);
    }

    public static class UIKit
    {
        static Font bold, semi;
        public static Font Bold => bold ??= Resources.Load<Font>("Fonts/Fredoka_700Bold") ?? Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        public static Font Semi => semi ??= Resources.Load<Font>("Fonts/Fredoka_600SemiBold") ?? Bold;

        /// <summary>Screen-space canvas (1080x1920 reference) + EventSystem; returns the safe-area root.</summary>
        public static RectTransform CreateRoot(string name)
        {
            if (UnityEngine.Object.FindAnyObjectByType<EventSystem>() == null)
                new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            var go = new GameObject(name, typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.matchWidthOrHeight = 0.5f;

            var bg = Rect("Background", (RectTransform)go.transform);
            Stretch(bg);
            bg.gameObject.AddComponent<RawImage>().texture = GradientTexture(Palette.Bg1, Palette.Bg2);

            var safe = Rect("SafeArea", (RectTransform)go.transform);
            safe.gameObject.AddComponent<SafeArea>();
            return safe;
        }

        static Texture2D GradientTexture(Color top, Color bottom)
        {
            var t = new Texture2D(1, 64) { wrapMode = TextureWrapMode.Clamp };
            for (int i = 0; i < 64; i++) t.SetPixel(0, i, Color.Lerp(bottom, top, i / 63f));
            t.Apply();
            return t;
        }

        public static RectTransform Rect(string name, RectTransform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }

        public static void Stretch(RectTransform r, float l = 0, float t = 0, float rgt = 0, float b = 0)
        {
            r.anchorMin = Vector2.zero; r.anchorMax = Vector2.one;
            r.offsetMin = new Vector2(l, b); r.offsetMax = new Vector2(-rgt, -t);
        }

        /// <summary>Place a rect by anchors (0..1) with a pixel size.</summary>
        public static RectTransform Place(RectTransform r, Vector2 anchor, Vector2 size, Vector2 pos = default)
        {
            r.anchorMin = r.anchorMax = anchor;
            r.pivot = new Vector2(0.5f, 0.5f);
            r.sizeDelta = size;
            r.anchoredPosition = pos;
            return r;
        }

        public static Text Label(RectTransform parent, string text, int size, Color color, TextAnchor align = TextAnchor.MiddleCenter, bool boldFont = true)
        {
            var r = Rect("Text", parent);
            var t = r.gameObject.AddComponent<Text>();
            t.font = boldFont ? Bold : Semi;
            t.text = text;
            t.fontSize = size;
            t.color = color;
            t.alignment = align;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            return t;
        }

        public static Image Box(RectTransform parent, Color color, int radius = 28, string name = "Box")
        {
            var r = Rect(name, parent);
            var img = r.gameObject.AddComponent<Image>();
            img.sprite = TileArt.Rounded(radius);
            img.type = Image.Type.Sliced;
            img.color = color;
            return img;
        }

        /// <summary>Chunky 3D button: darker edge underneath, face on top, presses down when tapped.</summary>
        public static GameButton Button(RectTransform parent, string label, Color face, Color edge, Color ink, Action onClick, int fontSize = 46)
        {
            var root = Rect("Button:" + label, parent);
            var edgeImg = Box(root, edge, 30, "Edge");
            Stretch(edgeImg.rectTransform);
            var faceImg = Box(root, face, 30, "Face");
            Stretch(faceImg.rectTransform, 0, 0, 0, 12);
            var text = Label(faceImg.rectTransform, label, fontSize, ink);
            Stretch(text.rectTransform, 12, 4, 12, 4);
            var btn = root.gameObject.AddComponent<GameButton>();
            btn.Init(faceImg, text, onClick);
            return btn;
        }

        public static GameButton Primary(RectTransform p, string label, Action a) => Button(p, label, Palette.Coral, Palette.CoralDark, Color.white, a);
        public static GameButton Plain(RectTransform p, string label, Action a) => Button(p, label, Palette.Cream, Palette.CreamEdge, Palette.PanelInk, a);
    }

    /// <summary>Button behaviour: press animation, click sound, disabled state.</summary>
    public sealed class GameButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerClickHandler
    {
        Image face;
        Text text;
        Action onClick;
        bool interactable = true;
        public bool Quiet;

        public void Init(Image f, Text t, Action a) { face = f; text = t; onClick = a; }
        public Text Text => text;

        public bool Interactable
        {
            get => interactable;
            set { interactable = value; var cg = GetComponent<CanvasGroup>() ?? gameObject.AddComponent<CanvasGroup>(); cg.alpha = value ? 1 : 0.45f; }
        }

        public void OnPointerDown(PointerEventData e) { if (interactable) face.rectTransform.anchoredPosition = new Vector2(0, -8); }
        public void OnPointerUp(PointerEventData e) { face.rectTransform.anchoredPosition = Vector2.zero; }
        public void OnPointerClick(PointerEventData e)
        {
            if (!interactable) return;
            if (!Quiet) Sfx.Play("click");
            onClick?.Invoke();
        }
    }

    /// <summary>Keeps its rect inside Screen.safeArea (notches, cutouts, gesture bars).</summary>
    public sealed class SafeArea : MonoBehaviour
    {
        Rect last;
        void Update()
        {
            var a = Screen.safeArea;
            if (a == last || Screen.width == 0) return;
            last = a;
            var r = (RectTransform)transform;
            r.anchorMin = new Vector2(a.xMin / Screen.width, a.yMin / Screen.height);
            r.anchorMax = new Vector2(a.xMax / Screen.width, a.yMax / Screen.height);
            r.offsetMin = r.offsetMax = Vector2.zero;
        }
    }
}
