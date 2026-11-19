// Ball Roll — entry point (the scene's only object). Starts the game screen; the main menu
// takes over this role in phase 4.
using UnityEngine;

namespace BallRoll
{
    public sealed class Bootstrap : MonoBehaviour
    {
        void Start()
        {
            Application.targetFrameRate = 60;
            var cam = Camera.main;
            if (cam != null) { cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = UI.Palette.Bg2; }
            gameObject.AddComponent<GameScreen>();
            Destroy(this);
        }
    }
}
