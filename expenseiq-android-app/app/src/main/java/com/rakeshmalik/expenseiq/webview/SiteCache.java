package com.rakeshmalik.expenseiq.webview;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;

public class SiteCache {
    private static final String TAG = "SiteCache";
    private static final String PREF_NAME = "ExpenseIQSiteCachePrefs";
    private final File cacheDir;
    private final SharedPreferences prefs;

    public SiteCache(Context context) {
        this.prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        this.cacheDir = new File(context.getFilesDir(), "site_cache");
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
            prefs.edit().clear().apply();
            Log.d(TAG, "Cache cleared.");
        }
    }

    /**
     * Retrieves an asset from cache or network.
     * If isMainHtml is true, performs conditional network revalidation (ETag / If-None-Match).
     * If index.html content changes, stale JS/CSS caches are automatically invalidated.
     */
    public byte[] getOrFetch(String urlStr, String safeFileName, boolean isMainHtml) {
        File file = new File(cacheDir, safeFileName);
        byte[] cachedBytes = null;

        if (file.exists() && file.isFile()) {
            try {
                cachedBytes = readFile(file);
            } catch (IOException e) {
                Log.w(TAG, "Error reading cached file: " + safeFileName, e);
            }
        }

        // For non-HTML assets, return cached copy immediately if available
        if (!isMainHtml && cachedBytes != null && cachedBytes.length > 0) {
            return cachedBytes;
        }

        // For HTML (or cache miss on other files), fetch with conditional validation
        try {
            URL url = new URL(urlStr);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(isMainHtml ? 4000 : 10000);
            connection.setReadTimeout(isMainHtml ? 4000 : 10000);

            String savedEtag = prefs.getString("etag_" + safeFileName, null);
            if (savedEtag != null && cachedBytes != null) {
                connection.setRequestProperty("If-None-Match", savedEtag);
            }

            int responseCode = connection.getResponseCode();

            if (responseCode == HttpURLConnection.HTTP_NOT_MODIFIED && cachedBytes != null) {
                Log.d(TAG, "HTTP 304 Not Modified for: " + safeFileName + " (serving cache)");
                return cachedBytes;
            }

            if (responseCode == HttpURLConnection.HTTP_OK) {
                InputStream inputStream = connection.getInputStream();
                byte[] newBytes = readBytes(inputStream);
                String newEtag = connection.getHeaderField("ETag");

                // If index.html changed, clear older sub-module JS/CSS files to prevent stale imports
                if (isMainHtml && cachedBytes != null && !Arrays.equals(cachedBytes, newBytes)) {
                    Log.d(TAG, "New web build detected in index.html! Invalidating sub-module assets.");
                    clearCacheExcept(safeFileName);
                }

                // Save to local cache file
                saveToDisk(file, newBytes);

                if (newEtag != null) {
                    prefs.edit().putString("etag_" + safeFileName, newEtag).apply();
                }

                Log.d(TAG, "Downloaded and updated cache for: " + safeFileName);
                return newBytes;
            } else {
                Log.w(TAG, "Server returned " + responseCode + " for " + urlStr);
                return cachedBytes; // Fallback to cache if available
            }
        } catch (Exception e) {
            Log.d(TAG, "Network fetch failed for " + urlStr + " (using cache if available): " + e.getMessage());
            return cachedBytes; // Offline fallback
        }
    }

    private void clearCacheExcept(String keepFileName) {
        if (cacheDir.exists()) {
            File[] files = cacheDir.listFiles();
            if (files != null) {
                for (File file : files) {
                    if (!file.getName().equals(keepFileName)) {
                        file.delete();
                    }
                }
            }
            prefs.edit().clear().apply();
        }
    }

    public byte[] downloadAndCache(String urlStr, String relativePath) {
        return getOrFetch(urlStr, relativePath, false);
    }

    public byte[] readFile(File file) throws IOException {
        byte[] bytes = new byte[(int) file.length()];
        try (FileInputStream fis = new FileInputStream(file)) {
            int read = fis.read(bytes);
            if (read != bytes.length) {
                throw new IOException("Short read on cached file");
            }
        }
        return bytes;
    }

    private void saveToDisk(File file, byte[] bytes) {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        try (FileOutputStream outputStream = new FileOutputStream(file)) {
            outputStream.write(bytes);
        } catch (Exception e) {
            Log.e(TAG, "Error saving file to disk: " + file.getName(), e);
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
