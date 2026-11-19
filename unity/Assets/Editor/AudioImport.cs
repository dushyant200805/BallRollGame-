// Ball Roll — audio import settings for Assets/Resources/Audio (applied automatically on import).
//   Sound effects: decompressed on load + preloaded, so the first click/slide plays instantly
//                  (with preloading off, Android drops or delays the first play of each clip).
//   Music and the 18 rolling loops: Vorbis in memory, preloaded, mono.
using UnityEditor;
using UnityEngine;

namespace BallRoll.Editor
{
    public sealed class AudioImport : AssetPostprocessor
    {
        const string Root = "Assets/Resources/Audio/";

        void OnPreprocessAudio()
        {
            if (!assetPath.StartsWith(Root)) return;
            var imp = (AudioImporter)assetImporter;
            bool longClip = assetPath.Contains("/balls/") || assetPath.EndsWith("music.wav");
            imp.forceToMono = true;
            imp.loadInBackground = false;
            var s = imp.defaultSampleSettings;
            s.preloadAudioData = true;
            s.loadType = longClip ? AudioClipLoadType.CompressedInMemory : AudioClipLoadType.DecompressOnLoad;
            s.compressionFormat = longClip ? AudioCompressionFormat.Vorbis : AudioCompressionFormat.ADPCM;
            s.quality = 0.7f;
            imp.defaultSampleSettings = s;
        }

        /// <summary>Re-import every game sound with the settings above (run before builds).</summary>
        [MenuItem("Ball Roll/Reimport Audio")]
        public static void ReimportAll()
        {
            foreach (var guid in AssetDatabase.FindAssets("t:AudioClip", new[] { "Assets/Resources/Audio" }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var imp = AssetImporter.GetAtPath(path) as AudioImporter;
                if (imp != null && !imp.defaultSampleSettings.preloadAudioData)
                    AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            }
        }
    }
}
