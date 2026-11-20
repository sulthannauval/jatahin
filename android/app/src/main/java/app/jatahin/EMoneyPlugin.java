package app.jatahin;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.github.muhakmal.kuereader.CardParser;
import io.github.muhakmal.kuereader.KueReader;
import io.github.muhakmal.kuereader.model.CardData;
import io.github.muhakmal.kuereader.model.Transaction;

/**
 * Cek E-Money: while the page asks for it (start, stop), the activity stays in NFC reader mode and every card
 * tapped is read with the vendored kue-reader, which only sends read commands. Each read is sent to the page
 * as a "card" event; nothing is stored.
 */
@CapacitorPlugin(name = "EMoney")
public class EMoneyPlugin extends Plugin implements NfcAdapter.ReaderCallback {

    private static final int FLAGS = NfcAdapter.FLAG_READER_NFC_A
        | NfcAdapter.FLAG_READER_NFC_B
        | NfcAdapter.FLAG_READER_NFC_F
        | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;

    /** Whether the page wants cards read; reader mode is dropped while the app is in the background. */
    private volatile boolean wanted = false;

    private NfcAdapter adapter() {
        return NfcAdapter.getDefaultAdapter(getContext());
    }

    private String state() {
        NfcAdapter a = adapter();
        if (a == null) return "none";
        return a.isEnabled() ? "on" : "off";
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("nfc", state());
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String s = state();
        if (!s.equals("on")) {
            call.reject(s.equals("none") ? "Perangkat ini tidak punya NFC." : "NFC sedang mati.", s);
            return;
        }
        wanted = true;
        enable();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        wanted = false;
        disable();
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_NFC_SETTINGS));
        } catch (ActivityNotFoundException e) {
            getActivity().startActivity(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
        }
        call.resolve();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (wanted) enable();
    }

    @Override
    protected void handleOnPause() {
        disable();
        super.handleOnPause();
    }

    private void enable() {
        Activity act = getActivity();
        NfcAdapter a = adapter();
        if (act == null || a == null || !a.isEnabled()) return;
        act.runOnUiThread(() -> a.enableReaderMode(act, this, FLAGS, null));
    }

    private void disable() {
        Activity act = getActivity();
        NfcAdapter a = adapter();
        if (act == null || a == null) return;
        act.runOnUiThread(() -> {
            try {
                a.disableReaderMode(act);
            } catch (IllegalStateException ignored) {
                // The activity is already gone.
            }
        });
    }

    /** Runs on a binder thread, so reading the card here does not block the UI. */
    @Override
    public void onTagDiscovered(Tag tag) {
        notifyListeners("reading", new JSObject());
        JSObject out = new JSObject();
        try {
            CardParser.Outcome o = KueReader.INSTANCE.readTagDetailed(tag);
            JSArray tech = new JSArray();
            for (String t : o.getTechList()) tech.put(t);
            out.put("tech", tech);
            out.put("log", o.getLog());
            CardData c = o.getCard();
            if (c != null) out.put("card", toJs(c));
        } catch (Exception e) {
            out.put("error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
        notifyListeners("card", out);
    }

    private static JSObject toJs(CardData c) {
        JSObject card = new JSObject();
        card.put("name", c.getCardName());
        card.put("id", c.getRawId());
        card.put("currency", c.getCurrency());
        card.put("readable", c.isBalanceReadable());
        if (c.getBalanceKnown()) card.put("balance", Math.round(c.getBalance()));
        JSArray history = new JSArray();
        for (Transaction t : c.getTransactionHistory()) {
            JSObject tx = new JSObject();
            tx.put("date", t.getDate());
            tx.put("amount", Math.round(t.getAmount()));
            tx.put("type", t.getType());
            if (t.getLocation() != null) tx.put("location", t.getLocation());
            if (t.getTerminalId() != null) tx.put("terminal", t.getTerminalId());
            history.put(tx);
        }
        card.put("history", history);
        return card;
    }
}
