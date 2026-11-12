/* Expo config plugin: signs Android release builds (APK + AAB) with the upload key described
 * in mobile/keystore.properties (kept out of git). Without that file, release builds fall back
 * to the debug key so they still build for testing.
 *
 * keystore.properties:
 *   storeFile=../../ballroll-upload.keystore   (relative to android/app)
 *   storePassword=...
 *   keyAlias=ballroll
 *   keyPassword=...
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// ballroll-release-signing';

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    const loader = `
${MARKER}
def ballrollKeystoreProps = new Properties()
def ballrollKeystoreFile = rootProject.file('../keystore.properties')
if (ballrollKeystoreFile.exists()) {
    ballrollKeystoreFile.withInputStream { ballrollKeystoreProps.load(it) }
}
`;
    src = src.replace(/^android\s*\{/m, `${loader}\nandroid {`);

    src = src.replace(
      /signingConfigs\s*\{\s*debug\s*\{([\s\S]*?)\}\s*\}/m,
      (m, debugBody) => `signingConfigs {
        debug {${debugBody}}
        release {
            if (ballrollKeystoreFile.exists()) {
                storeFile file(ballrollKeystoreProps['storeFile'])
                storePassword ballrollKeystoreProps['storePassword']
                keyAlias ballrollKeystoreProps['keyAlias']
                keyPassword ballrollKeystoreProps['keyPassword']
            }
        }
    }`,
    );

    // Use the release key for release builds when it is configured.
    src = src.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/m,
      `$1signingConfig ballrollKeystoreFile.exists() ? signingConfigs.release : signingConfigs.debug`,
    );

    cfg.modResults.contents = src;
    return cfg;
  });
};
