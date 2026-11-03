#!/usr/bin/env bash
# Test sur un téléphone Android virtuel : installation, lancement, autorisations, accueil, sans internet.
set -u
mkdir -p shots
PKG=sn.cfc.jokko
shot() { adb exec-out screencap -p > "shots/$1.png"; }
adb install -r Jokko.apk
adb shell am start -W -n $PKG/.MainActivity
sleep 20
shot 1-premier-lancement
adb shell pidof $PKG > shots/pid.txt || { echo "L'application s'est fermée" ; adb logcat -d | tail -300 > shots/logcat.txt; exit 1; }
adb shell pm grant $PKG android.permission.RECORD_AUDIO
adb shell pm grant $PKG android.permission.CAMERA
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb shell am force-stop $PKG
adb shell am start -W -n $PKG/.MainActivity
sleep 25
shot 2-accueil
adb shell dumpsys package $PKG | grep -E "permission|versionName" > shots/perms.txt
adb shell svc wifi disable
adb shell svc data disable
adb shell am force-stop $PKG
adb shell am start -W -n $PKG/.MainActivity
sleep 15
shot 3-sans-internet
adb shell svc wifi enable
adb shell svc data enable
adb logcat -d | grep -iE "capacitor|chromium|jokko|AndroidRuntime" | tail -300 > shots/logcat.txt
# Sans internet, certains téléphones virtuels ferment les services Google (et les applis qui en dépendent) : on note seulement.
adb shell pidof $PKG > shots/pid-hors-ligne.txt || echo "fermée hors ligne (voir logcat)" > shots/pid-hors-ligne.txt
