#!/usr/bin/env bash
# 천 년의 빚 APK 만들기(그레이들 없이 안드로이드 SDK 도구만으로).
#   bash tools/build-apk.sh        → dist-apk/millennium-debt.apk
# 필요: JDK 17, 안드로이드 SDK(platforms;android-35, build-tools;35.0.0) — ANDROID_HOME 또는 %LOCALAPPDATA%/Android/Sdk
# 서명 키: 저장소 밖 ../.secrets/mercenary-release.jks (없으면 새로 만든다. 같은 키로 서명해야 폰에서 덮어 설치된다)
set -euo pipefail
[ -n "${JAVA_HOME:-}" ] || { JH="$(java -XshowSettings:properties -version 2>&1 | sed -n "s/^ *java.home = //p" | tr -d "")"; export JAVA_HOME="$JH"; }
cd "$(dirname "$0")/.."
SDK="${ANDROID_HOME:-${LOCALAPPDATA:-$HOME/AppData/Local}/Android/Sdk}"
BT="$SDK/build-tools/35.0.0"; JAR="$SDK/platforms/android-35/android.jar"
[ -f "$JAR" ] || { echo "android.jar 없음: $JAR"; exit 1; }
EXE=""; [ -f "$BT/aapt2.exe" ] && EXE=".exe"
BAT=""; [ -f "$BT/d8.bat" ] && BAT=".bat"
OUT=dist-apk; W=$OUT/work; rm -rf "$W"; mkdir -p "$W/res" "$W/classes" "$W/assets"
KEY=../.secrets/mercenary-release.jks; PASS_FILE=../.secrets/mercenary-release.pass

echo "▶ 웹 빌드"; npm run build --silent
cp -r dist "$W/assets/web"; rm -f "$W/assets/web/sw.js"
# 시험용 쪽·원본 메모는 앱에 안 넣는다
rm -rf "$W/assets/web/art/mockup"* "$W/assets/web/art/cast.html"; find "$W/assets/web" -name "*.src" -delete

echo "▶ 리소스"; "$BT/aapt2$EXE" compile --dir android/res -o "$W/res.zip"
"$BT/aapt2$EXE" link -o "$W/base.apk" -I "$JAR" --manifest android/AndroidManifest.xml "$W/res.zip" --auto-add-overlay

echo "▶ 자바 → dex"
"$JAVA_HOME/bin/javac" -encoding UTF-8 -source 8 -target 8 -nowarn -bootclasspath "$JAR" -cp "$JAR" -d "$W/classes" $(find android/src -name '*.java') 2>&1 | grep -v "warning" || true
"$BT/d8$BAT" --release --min-api 24 --lib "$JAR" --output "$W" $(find "$W/classes" -name '*.class')
# 윈도에서 aapt2 -A 는 경로를 역슬래시로 넣어 폰이 못 찾는다 → jar 로 넣는다(항상 / 경로)
( cd "$W" && "$JAVA_HOME/bin/jar" uf base.apk classes.dex assets )

echo "▶ 정렬·서명"
"$BT/zipalign$EXE" -f -p 4 "$W/base.apk" "$W/aligned.apk"
if [ ! -f "$KEY" ]; then
  mkdir -p ../.secrets; [ -f "$PASS_FILE" ] || head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$PASS_FILE"
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$KEY" -alias md -keyalg RSA -keysize 2048 -validity 10000 -storepass "$(cat "$PASS_FILE")" -keypass "$(cat "$PASS_FILE")" -dname "CN=Millennium Debt" >/dev/null 2>&1
  echo "  새 서명 키를 만들었다: $KEY (지우면 폰에서 덮어 설치가 안 된다)"
fi
MD_PASS="$(cat "$PASS_FILE")" "$BT/apksigner$BAT" sign --ks "$KEY" --ks-key-alias md --ks-pass env:MD_PASS --key-pass env:MD_PASS --out "$OUT/millennium-debt.apk" "$W/aligned.apk"
"$BT/apksigner$BAT" verify "$OUT/millennium-debt.apk"
rm -rf "$W"
ls -la "$OUT/millennium-debt.apk"
