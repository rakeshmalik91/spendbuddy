package com.rakeshmalik.expenseiq.webview;

import android.content.Context;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class SiteCache {
    private static final String TAG = "SiteCache";
    private final File cacheDir;

    public SiteCache(Context context) {
        cacheDir = new File(context.getFilesDir(), "site_cache");
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }
    }

    public File getCacheDir() {
        return cacheDir;
    }

    public void clearCache() {
        if (cacheDir.exists()) {
            File[] files = cacheDir.listFiles();
            if (files != null) {
                for (File file : files) {
                    file.delete();
                }
            }
            Log.d(TAG, "Cache cleared.");
        }
    }

    public byte[] downloadAndCache(String urlStr, String relativePath) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);

            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                Log.e(TAG, "Failed to download " + urlStr + ". Response code: " + connection.getResponseCode());
                return null;
            }

            InputStream inputStream = connection.getInputStream();
            byte[] bytes = readBytes(inputStream);

            // Save to cache
            File file = new File(cacheDir, relativePath);
            File parent = file.getParentFile();
            if (parent != null && !parent.exists()) {
                parent.mkdirs();
            }
            try (FileOutputStream outputStream = new FileOutputStream(file)) {
                outputStream.write(bytes);
            }

            Log.d(TAG, "Successfully downloaded and cached: " + relativePath);
            return bytes;
        } catch (Exception e) {
            Log.e(TAG, "Exception downloading " + urlStr, e);
            return null;
        }
    }

    private byte[] readBytes(InputStream inputStream) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        int nRead;
        byte[] data = new byte[16384];
        while ((nRead = inputStream.read(data, 0, data.length)) != -1) {
            buffer.write(data, 0, nRead);
        }
        return buffer.toByteArray();
    }

    public String getMimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }
}
