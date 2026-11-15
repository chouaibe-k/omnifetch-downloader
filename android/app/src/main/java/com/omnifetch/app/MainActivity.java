package com.omnifetch.app;

import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            WebView webView = this.getBridge().getWebView();
            if (webView != null) {
                // Expose AndroidBridge into JavaScript context
                webView.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");

                // Native DownloadListener for any standard file download trigger
                webView.setDownloadListener(new DownloadListener() {
                    @Override
                    public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                        String guessedName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                        downloadToDeviceFolder(url, guessedName, mimeType);
                    }
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void downloadToDeviceFolder(String fileUrl, String filename, String mimeType) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(fileUrl));
            if (mimeType != null && !mimeType.isEmpty()) {
                request.setMimeType(mimeType);
            }
            request.setTitle(filename);
            request.setDescription("Saving " + filename + " to Downloads");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(request);
                runOnUiThread(() -> Toast.makeText(this, "Downloading " + filename + " directly to your Downloads folder...", Toast.LENGTH_SHORT).show());
                return;
            }
        } catch (Exception e) {
            // Fallback: direct thread stream download
            new Thread(() -> streamAndSaveDirectly(fileUrl, filename, mimeType)).start();
        }
    }

    private void streamAndSaveDirectly(String fileUrl, String filename, String mimeType) {
        try {
            URL url = new URL(fileUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile)");
            conn.connect();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType != null ? mimeType : "video/mp4");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (InputStream in = conn.getInputStream(); OutputStream out = getContentResolver().openOutputStream(uri)) {
                        byte[] buffer = new byte[8192];
                        int bytesRead;
                        while ((bytesRead = in.read(buffer)) != -1) {
                            out.write(buffer, 0, bytesRead);
                        }
                    }
                    runOnUiThread(() -> Toast.makeText(this, "Saved " + filename + " directly to Downloads!", Toast.LENGTH_LONG).show());
                }
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                File target = new File(dir, filename);
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(target)) {
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                    }
                }
                MediaScannerConnection.scanFile(this, new String[]{target.getAbsolutePath()}, null, null);
                runOnUiThread(() -> Toast.makeText(this, "Saved " + filename + " directly to Downloads!", Toast.LENGTH_LONG).show());
            }
        } catch (Exception ex) {
            runOnUiThread(() -> Toast.makeText(this, "Download error: " + ex.getMessage(), Toast.LENGTH_SHORT).show());
        }
    }

    public class AndroidBridge {
        private final Context context;

        public AndroidBridge(Context ctx) {
            this.context = ctx;
        }

        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        @JavascriptInterface
        public void downloadUrl(String url, String filename, String mimeType) {
            downloadToDeviceFolder(url, filename, mimeType);
        }

        @JavascriptInterface
        public void saveBase64(String base64Data, String filename, String mimeType) {
            try {
                byte[] data = Base64.decode(base64Data, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    values.put(MediaStore.Downloads.MIME_TYPE, mimeType != null ? mimeType : "video/mp4");
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri != null) {
                        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                            out.write(data);
                        }
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved " + filename + " directly to your Downloads folder!", Toast.LENGTH_LONG).show());
                    }
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) dir.mkdirs();
                    File target = new File(dir, filename);
                    try (FileOutputStream out = new FileOutputStream(target)) {
                        out.write(data);
                    }
                    MediaScannerConnection.scanFile(MainActivity.this, new String[]{target.getAbsolutePath()}, null, null);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved " + filename + " directly to your Downloads folder!", Toast.LENGTH_LONG).show());
                }
            } catch (Exception ex) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Save error: " + ex.getMessage(), Toast.LENGTH_SHORT).show());
            }
        }
    }
}
