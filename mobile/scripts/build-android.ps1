# Builds the signed release APK (device testing) and AAB (Play Store) for Ball Roll.
#   powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1
# Output: mobile/build-output/BallRoll-<version>.apk and .aab
param(
  [string]$Abis = 'armeabi-v7a,arm64-v8a,x86_64'
)
$ErrorActionPreference = 'Stop'
$mobile = Split-Path -Parent $PSScriptRoot

if (-not $env:JAVA_HOME) { $env:JAVA_HOME = Join-Path $env:LOCALAPPDATA 'Programs\jdk17' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
# Some networks stall Java's IPv6 connections (Gradle/Maven downloads time out); prefer IPv4.
# (GRADLE_OPTS, not JAVA_TOOL_OPTIONS: the latter makes every Java tool print a notice on
# stderr, which the Android prefab step treats as a failure.)
$env:GRADLE_OPTS = '-Djava.net.preferIPv4Stack=true'
Remove-Item Env:JAVA_TOOL_OPTIONS -ErrorAction SilentlyContinue

$android = Join-Path $mobile 'android'
if (-not (Test-Path $android)) {
  Push-Location $mobile
  npx expo prebuild --platform android --no-install
  Pop-Location
}
$lp = Join-Path $android 'local.properties'
if (-not (Test-Path $lp)) { Set-Content -Encoding ascii $lp ("sdk.dir=" + $env:ANDROID_HOME.Replace('\', '\\')) }

# Slow networks: give the Gradle wrapper download more than its default 10 s.
$wp = Join-Path $android 'gradle\wrapper\gradle-wrapper.properties'
(Get-Content $wp) -replace '^networkTimeout=.*', 'networkTimeout=180000' | Set-Content -Encoding ascii $wp

Push-Location $android
try {
  & .\gradlew.bat assembleRelease bundleRelease "-PreactNativeArchitectures=$Abis" "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Djava.net.preferIPv4Stack=true" --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }

$version = (Get-Content (Join-Path $mobile 'app.json') -Raw | ConvertFrom-Json).expo.version
$out = Join-Path $mobile 'build-output'
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item (Join-Path $android 'app\build\outputs\apk\release\app-release.apk') (Join-Path $out "BallRoll-$version.apk") -Force
Copy-Item (Join-Path $android 'app\build\outputs\bundle\release\app-release.aab') (Join-Path $out "BallRoll-$version.aab") -Force
Get-ChildItem $out | Select-Object Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }
