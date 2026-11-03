"""Après « npx cap add android » : autorisations, icônes, écran de démarrage, MainActivity, version et signature."""
import os, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "android", "app")
MAIN = os.path.join(APP, "src", "main")

# 1. Autorisations (le micro et la caméra sont demandés au premier lancement, la position seulement à l'usage).
manifest_path = os.path.join(MAIN, "AndroidManifest.xml")
manifest = open(manifest_path, encoding="utf-8").read()
perms = [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.RECORD_AUDIO",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.CAMERA",
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.VIBRATE",
]
lines = [f'    <uses-permission android:name="{p}" />' for p in perms if p not in manifest]
lines += [
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
    '    <uses-feature android:name="android.hardware.microphone" android:required="false" />',
    '    <uses-feature android:name="android.hardware.location" android:required="false" />',
]
manifest = manifest.replace("</manifest>", "\n".join(lines) + "\n</manifest>")
open(manifest_path, "w", encoding="utf-8").write(manifest)

# 2. Icônes et écran de démarrage.
src_res = os.path.join(HERE, "res")
for root, _, files in os.walk(src_res):
    for f in files:
        rel = os.path.relpath(os.path.join(root, f), src_res)
        dest = os.path.join(MAIN, "res", rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copyfile(os.path.join(root, f), dest)
bg = os.path.join(MAIN, "res", "values", "ic_launcher_background.xml")
open(bg, "w", encoding="utf-8").write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A1F44</color>\n</resources>\n'
)

# 3. MainActivity (demande des autorisations, son sans geste, police stable).
java_dir = os.path.join(MAIN, "java", "sn", "cfc", "jokko")
os.makedirs(java_dir, exist_ok=True)
shutil.copyfile(os.path.join(HERE, "java", "MainActivity.java"), os.path.join(java_dir, "MainActivity.java"))

# 4. Version et signature.
gradle_path = os.path.join(APP, "build.gradle")
gradle = open(gradle_path, encoding="utf-8").read()
code = int(os.environ.get("JOKKO_VERSION_CODE", "1"))
gradle = re.sub(r"versionCode \d+", f"versionCode {code}", gradle)
gradle = re.sub(r'versionName "[^"]*"', f'versionName "1.0.{code}"', gradle)
signing = """
    signingConfigs {
        release {
            storeFile file(System.getenv("JOKKO_KS") ?: "missing.jks")
            storePassword System.getenv("JOKKO_KS_PASS")
            keyAlias "jokko"
            keyPassword System.getenv("JOKKO_KS_PASS")
        }
    }
"""
gradle = gradle.replace("    buildTypes {", signing + "    buildTypes {", 1)
gradle = re.sub(r"(release \{\s*\n\s*minifyEnabled false)", r"\1\n            signingConfig signingConfigs.release", gradle, count=1)
assert "signingConfig signingConfigs.release" in gradle, "build.gradle : bloc release introuvable"
open(gradle_path, "w", encoding="utf-8").write(gradle)
print("patch OK, versionCode", code)
