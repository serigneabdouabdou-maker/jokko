package sn.cfc.jokko;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;

/**
 * Jokko pour Android : ouvre jokkoapp.com dans le moteur web d'Android (sans Chrome).
 * Au premier lancement, demande le micro (la voix est le cœur de Jokko), la caméra (scan, photo de facture)
 * et, sur Android 13+, les notifications. La position n'est demandée que si Jokko en a besoin.
 */
public class MainActivity extends BridgeActivity {
  private static final int ASK = 7;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WebSettings settings = getBridge().getWebView().getSettings();
    settings.setMediaPlaybackRequiresUserGesture(false); // Jokko peut répondre à voix haute
    settings.setTextZoom(100); // la mise en page ne casse pas si le téléphone a une grande police
    askPermissions();
  }

  private void askPermissions() {
    ArrayList<String> wanted = new ArrayList<>();
    wanted.add(Manifest.permission.RECORD_AUDIO);
    wanted.add(Manifest.permission.CAMERA);
    if (Build.VERSION.SDK_INT >= 33) wanted.add("android.permission.POST_NOTIFICATIONS");
    ArrayList<String> missing = new ArrayList<>();
    for (String p : wanted) {
      if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
    }
    if (!missing.isEmpty()) ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), ASK);
  }
}
