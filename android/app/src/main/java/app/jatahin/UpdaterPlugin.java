package app.jatahin;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * In-app updates. The page finds a newer release on GitHub; this downloads its APK, checks the SHA-256 the
 * release lists, and opens Android's installer, where the user confirms. Android itself refuses an APK not
 * signed with the same key as the installed app. Only release assets of the public releases repository are
 * downloaded.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    private static final String RELEASES = "https://github.com/sulthannauval/jatahin-releases/releases/download/";
    private static final long MAX_BYTES = 200L * 1024 * 1024;

    private boolean allowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", allowed());
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(i);
        }
        call.resolve();
    }

    /** url: the .apk asset; sha256 (hex) or shaUrl (a .sha256 asset next to it). Resolves once the installer opens. */
    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url", "");
        String sha = call.getString("sha256");
        String shaUrl = call.getString("shaUrl");
        if (!isRelease(url) || !url.endsWith(".apk")) {
            call.reject("Alamat update tidak dikenal.", "bad_url");
            return;
        }
        if (sha == null && (shaUrl == null || !isRelease(shaUrl))) {
            call.reject("Checksum update tidak ada.", "no_checksum");
            return;
        }
        if (!allowed()) {
            call.reject("Izinkan Jatahin memasang aplikasi dulu.", "permission");
            return;
        }
        new Thread(() -> {
            try {
                String expected = (sha != null ? sha : fetchChecksum(shaUrl)).trim().toLowerCase(Locale.ROOT);
                if (!expected.matches("[0-9a-f]{64}")) throw new IOException("Checksum update tidak valid.");
                File apk = download(url, expected);
                openInstaller(apk);
                call.resolve();
            } catch (ChecksumException e) {
                call.reject(e.getMessage(), "checksum");
            } catch (Exception e) {
                call.reject("Gagal mengunduh update: " + e.getMessage(), "download");
            }
        }).start();
    }

    private static boolean isRelease(String url) {
        return url != null && url.startsWith(RELEASES) && !url.contains("..");
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "Jatahin-Android");
        if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
        if (!c.getURL().getProtocol().equals("https")) throw new IOException("Unduhan tidak aman.");
        return c;
    }

    /** A sha256sum line: the hash comes first. */
    private static String fetchChecksum(String url) throws IOException {
        HttpURLConnection c = open(url);
        try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
            String line = r.readLine();
            if (line == null) throw new IOException("Checksum kosong.");
            return line.trim().split("\\s+")[0];
        } finally {
            c.disconnect();
        }
    }

    private File download(String url, String expected) throws Exception {
        Context ctx = getContext();
        File dir = new File(ctx.getCacheDir(), "updates");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Tidak bisa menyiapkan folder unduhan.");
        File apk = new File(dir, "jatahin-update.apk");

        HttpURLConnection c = open(url);
        long total = c.getContentLengthLong();
        if (total > MAX_BYTES) throw new IOException("Berkas terlalu besar.");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long received = 0, lastSent = 0;
        try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) {
                received += n;
                if (received > MAX_BYTES) throw new IOException("Berkas terlalu besar.");
                digest.update(buf, 0, n);
                out.write(buf, 0, n);
                if (received - lastSent >= 256 * 1024) {
                    lastSent = received;
                    progress(received, total);
                }
            }
        } finally {
            c.disconnect();
        }
        progress(received, total);

        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
        if (!hex.toString().equals(expected)) {
            apk.delete();
            throw new ChecksumException();
        }
        return apk;
    }

    private void progress(long received, long total) {
        JSObject p = new JSObject();
        p.put("received", received);
        p.put("total", total);
        notifyListeners("progress", p);
    }

    private void openInstaller(File apk) {
        Context ctx = getContext();
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
    }

    private static class ChecksumException extends Exception {
        ChecksumException() {
            super("Berkas update tidak cocok dengan checksum rilis. Coba lagi.");
        }
    }
}
