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
    private volatile long lastHtmlCheckTime = 0L;

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
                    deleteRecursively(file);
                }
            }
            prefs.edit().clear().apply();
            lastHtmlCheckTime = 0L;
            Log.d(TAG, "Cache cleared.");
        }
    }

    /**
     * Clears all cached files except keepFileName (typically index.html).
     * Preserves ETag and Last-Modified metadata for keepFileName while clearing stale assets.
     */
    public void clearCacheExcept(String keepFileName) {
        if (cacheDir.exists()) {
            File[] files = cacheDir.listFiles();
            if (files != null) {
                for (File file : files) {
                    if (!file.getName().equals(keepFileName)) {
                        deleteRecursively(file);
                    }
                }
            }
            String keepEtag = prefs.getString("etag_" + keepFileName, null);
            String keepLastModified = prefs.getString("last_modified_" + keepFileName, null);
            prefs.edit().clear().apply();
            SharedPreferences.Editor editor = prefs.edit();
            if (keepEtag != null) {
                editor.putString("etag_" + keepFileName, keepEtag);
            }
            if (keepLastModified != null) {
                editor.putString("last_modified_" + keepFileName, keepLastModified);
            }
            editor.apply();
        }
    }

    /**
     * Checks if the remote main HTML (index.html) has changed.
     * Uses conditional network headers (If-None-Match and If-Modified-Since).
     *
     * @param baseUrl The base website URL to check (e.g. AppConfig.WEB_URL).
     * @return true if an existing cached site was updated with new content (indicating
     *         the WebView should clear its internal cache and refresh).
     */
    public boolean checkAndUpdateMainHtml(String baseUrl) {
        String safeFileName = "index.html";
        File file = new File(cacheDir, safeFileName);
        byte[] cachedBytes = null;
        if (file.exists() && file.isFile()) {
            try {
                cachedBytes = readFile(file);
            } catch (IOException e) {
                Log.w(TAG, "Error reading cached " + safeFileName, e);
            }
        }

        String targetUrl = baseUrl.endsWith("/") ? baseUrl + "index.html" : baseUrl + "/index.html";
        try {
            URL url = new URL(targetUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            conn.setRequestMethod("GET");

            String savedEtag = prefs.getString("etag_" + safeFileName, null);
            if (savedEtag != null && cachedBytes != null) {
                conn.setRequestProperty("If-None-Match", savedEtag);
            }
            String savedLastModified = prefs.getString("last_modified_" + safeFileName, null);
            if (savedLastModified != null && cachedBytes != null) {
                conn.setRequestProperty("If-Modified-Since", savedLastModified);
            }

            int responseCode = conn.getResponseCode();

            if (responseCode == HttpURLConnection.HTTP_NOT_MODIFIED && cachedBytes != null) {
                Log.d(TAG, "Startup check: HTTP 304 Not Modified (site unchanged).");
                lastHtmlCheckTime = System.currentTimeMillis();
                return false;
            }

            if (responseCode == HttpURLConnection.HTTP_OK) {
                InputStream inputStream = conn.getInputStream();
                byte[] newBytes = readBytes(inputStream);
                String newEtag = conn.getHeaderField("ETag");
                String newLastModified = conn.getHeaderField("Last-Modified");

                boolean contentChanged = (cachedBytes == null) || !Arrays.equals(cachedBytes, newBytes);

                if (contentChanged) {
                    Log.d(TAG, "Startup check: New web build detected! Invalidating sub-module caches.");
                    clearCacheExcept(safeFileName);
                    saveToDisk(file, newBytes);

                    SharedPreferences.Editor editor = prefs.edit();
                    if (newEtag != null) {
                        editor.putString("etag_" + safeFileName, newEtag);
                    }
                    if (newLastModified != null) {
                        editor.putString("last_modified_" + safeFileName, newLastModified);
                    }
                    editor.apply();

                    lastHtmlCheckTime = System.currentTimeMillis();
                    // Return true only if cachedBytes existed (so we refresh an already-cached app)
                    return (cachedBytes != null);
                } else {
                    Log.d(TAG, "Startup check: 200 OK received but content unchanged.");
                    SharedPreferences.Editor editor = prefs.edit();
                    if (newEtag != null) {
                        editor.putString("etag_" + safeFileName, newEtag);
                    }
                    if (newLastModified != null) {
                        editor.putString("last_modified_" + safeFileName, newLastModified);
                    }
                    editor.apply();
                    lastHtmlCheckTime = System.currentTimeMillis();
                    return false;
                }
            } else {
                Log.w(TAG, "Startup check: Server returned " + responseCode + " for " + targetUrl);
                return false;
            }
        } catch (Exception e) {
            Log.d(TAG, "Startup check: Network fetch failed (" + e.getMessage() + "), using cached site if available.");
            return false;
        }
    }

    /**
     * Retrieves an asset from cache or network.
     * If isMainHtml is true, performs conditional network revalidation (ETag / Last-Modified).
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

        // If main HTML was recently verified (< 10 seconds ago), return cached copy immediately
        if (isMainHtml && cachedBytes != null && (System.currentTimeMillis() - lastHtmlCheckTime < 10000L)) {
            return cachedBytes;
        }

        // For HTML (or cache miss on other files), fetch with conditional validation
        try {
            URL url = new URL(urlStr);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(isMainHtml ? 3000 : 10000);
            connection.setReadTimeout(isMainHtml ? 3000 : 10000);

            String savedEtag = prefs.getString("etag_" + safeFileName, null);
            if (savedEtag != null && cachedBytes != null) {
                connection.setRequestProperty("If-None-Match", savedEtag);
            }
            String savedLastModified = prefs.getString("last_modified_" + safeFileName, null);
            if (savedLastModified != null && cachedBytes != null) {
                connection.setRequestProperty("If-Modified-Since", savedLastModified);
            }

            int responseCode = connection.getResponseCode();

            if (responseCode == HttpURLConnection.HTTP_NOT_MODIFIED && cachedBytes != null) {
                Log.d(TAG, "HTTP 304 Not Modified for: " + safeFileName + " (serving cache)");
                if (isMainHtml) {
                    lastHtmlCheckTime = System.currentTimeMillis();
                }
                return cachedBytes;
            }

            if (responseCode == HttpURLConnection.HTTP_OK) {
                InputStream inputStream = connection.getInputStream();
                byte[] newBytes = readBytes(inputStream);
                String newEtag = connection.getHeaderField("ETag");
                String newLastModified = connection.getHeaderField("Last-Modified");

                // If index.html changed, clear older sub-module JS/CSS files to prevent stale imports
                if (isMainHtml && cachedBytes != null && !Arrays.equals(cachedBytes, newBytes)) {
                    Log.d(TAG, "New web build detected in index.html! Invalidating sub-module assets.");
                    clearCacheExcept(safeFileName);
                }

                // Save to local cache file
                saveToDisk(file, newBytes);

                SharedPreferences.Editor editor = prefs.edit();
                if (newEtag != null) {
                    editor.putString("etag_" + safeFileName, newEtag);
                }
                if (newLastModified != null) {
                    editor.putString("last_modified_" + safeFileName, newLastModified);
                }
                editor.apply();

                if (isMainHtml) {
                    lastHtmlCheckTime = System.currentTimeMillis();
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

    private void deleteRecursively(File fileOrDir) {
        if (fileOrDir.isDirectory()) {
            File[] children = fileOrDir.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        fileOrDir.delete();
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
