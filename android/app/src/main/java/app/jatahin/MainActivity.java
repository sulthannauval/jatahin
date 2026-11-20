package app.jatahin;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Sent by the home-screen shortcuts in res/xml/shortcuts.xml. */
    private static final String ACTION_CATAT = "app.jatahin.CATAT";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EMoneyPlugin.class);
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * BridgeActivity also calls this with the launch intent, so a shortcut works from a cold start and while the
     * app is open. The page opens the transaction sheet for ?catat=, as the web app's own shortcuts do. Only the
     * two known kinds are accepted, since other apps can send this intent too.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (bridge == null || intent == null || !ACTION_CATAT.equals(intent.getAction())) return;
        String jenis = "pemasukan".equals(intent.getStringExtra("jenis")) ? "pemasukan" : "pengeluaran";
        bridge.getWebView().loadUrl(bridge.getServerUrl() + "/?catat=" + jenis);
        // Don't replay the shortcut if the activity is recreated.
        setIntent(new Intent(Intent.ACTION_MAIN));
    }
}
