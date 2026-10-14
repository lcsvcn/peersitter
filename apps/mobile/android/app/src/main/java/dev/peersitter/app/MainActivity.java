package dev.peersitter.app;

import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Material You: hand the wallpaper-derived system accent (Android 12+) to the web UI,
    // which builds its whole tonal palette from it (see apps/web/src/dynamicColor.ts).
    getBridge().getWebView().addJavascriptInterface(new SystemColors(), "PeerSitterAndroid");
  }

  private class SystemColors {
    @JavascriptInterface
    public String systemAccent() {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "";
      int color = getResources().getColor(android.R.color.system_accent1_500, getTheme());
      return String.format("#%06X", color & 0xFFFFFF);
    }
  }
}
