package com.rakeshmalik.expenseiq.webview;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.rakeshmalik.expenseiq.AppConfig;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

public class CachedWebViewClient extends WebViewClient {
    private static final String TAG = "CachedWebViewClient";
    private static final String SITE_HOST = AppConfig.WEB_HOST;
    private final SiteCache siteCache;

    public CachedWebViewClient(SiteCache siteCache) {
        this.siteCache = siteCache;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (url == null) return false;
        String host = url.getHost();
        if (host == null) return false;
        
        String localHost = "";
        try {
            localHost = new URL(AppConfig.LOCAL_WEB_URL).getHost();
        } catch (Exception ignored) {}

        if (host.equals(SITE_HOST) || host.equals("www." + SITE_HOST) || host.equals(localHost) || host.equals("localhost") || host.equals("127.0.0.1") || host.startsWith("192.168.") || host.contains("google.com") || host.contains("gstatic.com") || host.contains("googleapis.com")) {
            return false; // Let WebView load it
        }

        // Open external links in external browser
        Intent intent = new Intent(Intent.ACTION_VIEW, url);
        view.getContext().startActivity(intent);
        return true;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (url == null) return null;
        String urlString = url.toString();

        if (!request.getMethod().equals("GET")) return null;

        String host = url.getHost();
        if (host == null) return null;

        // Only intercept requests for our specific website shell.
        if (host.equals(SITE_HOST) || host.equals("www." + SITE_HOST)) {
            String path = url.getPath();
            String relativePath = (path != null) ? path.replaceAll("^/+", "") : "";
            return serveFromCache(urlString, relativePath);
        }

        return null;
    }

    private WebResourceResponse serveFromCache(String urlStr, String relativePath) {
        String path = (relativePath.isEmpty() || relativePath.equals("/")) ? "index.html" : relativePath;
        String cleanPath = path.split("\\?")[0];
        boolean isMainHtml = cleanPath.equals("index.html") || cleanPath.isEmpty();

        // Include query params in cache filename to respect cache-busters
        String queryStr = "";
        if (path.contains("?")) {
            queryStr = "_" + path.substring(path.indexOf("?") + 1).replace("=", "_").replace("&", "_");
        }
        
        int extIndex = cleanPath.lastIndexOf(".");
        String safeFileName;
        if (extIndex != -1) {
            safeFileName = cleanPath.substring(0, extIndex).replace("/", "_") + queryStr + cleanPath.substring(extIndex);
        } else {
            safeFileName = cleanPath.replace("/", "_") + queryStr;
        }

        byte[] bytes = siteCache.getOrFetch(urlStr, safeFileName, isMainHtml);
        if (bytes != null) {
            return createResponse(cleanPath, bytes);
        }
        return null;
    }

    private WebResourceResponse createResponse(String path, byte[] bytes) {
        String mimeType = siteCache.getMimeType(path);
        String encoding = (mimeType.startsWith("text/") || mimeType.equals("application/javascript")) ? "UTF-8" : null;
        
        Map<String, String> responseHeaders = new HashMap<>();
        responseHeaders.put("Access-Control-Allow-Origin", "*");
        responseHeaders.put("Cache-Control", "no-cache");
        
        return new WebResourceResponse(
            mimeType,
            encoding,
            200,
            "OK",
            responseHeaders,
            new ByteArrayInputStream(bytes)
        );
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request != null && request.isForMainFrame()) {
            String offlineHtml = "<!DOCTYPE html>\n" +
                "<html lang=\"en\">\n" +
                "<head>\n" +
                "    <meta charset=\"UTF-8\">\n" +
                "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
                "    <title>Offline</title>\n" +
                "    <style>\n" +
                "        html, body {\n" +
                "            height: 100%;\n" +
                "        }\n" +
                "        body {\n" +
                "            margin: 0;\n" +
                "            padding: 20px;\n" +
                "            box-sizing: border-box;\n" +
                "            background-color: #0b0e14;\n" +
                "            color: #e8ecf4;\n" +
                "            font-family: system-ui, -apple-system, sans-serif;\n" +
                "            display: flex;\n" +
                "            flex-direction: column;\n" +
                "            align-items: center;\n" +
                "            justify-content: center;\n" +
                "            text-align: center;\n" +
                "        }\n" +
                "        .icon {\n" +
                "            font-size: 4rem;\n" +
                "            margin-bottom: 1rem;\n" +
                "            filter: drop-shadow(0 0 20px rgba(99, 138, 255, 0.4));\n" +
                "        }\n" +
                "        h1 {\n" +
                "            font-size: 1.5rem;\n" +
                "            margin-bottom: 0.5rem;\n" +
                "            background: linear-gradient(135deg, #638aff, #a78bfa);\n" +
                "            -webkit-background-clip: text;\n" +
                "            -webkit-text-fill-color: transparent;\n" +
                "            line-height: 1.3;\n" +
                "            padding-top: 4px;\n" +
                "        }\n" +
                "        p {\n" +
                "            color: #8b95a8;\n" +
                "            margin-bottom: 2rem;\n" +
                "            max-width: 80%;\n" +
                "            line-height: 1.5;\n" +
                "        }\n" +
                "        button {\n" +
                "            background: linear-gradient(135deg, #638aff, #8b5cf6);\n" +
                "            color: #fff;\n" +
                "            border: none;\n" +
                "            padding: 12px 24px;\n" +
                "            border-radius: 10px;\n" +
                "            font-size: 1rem;\n" +
                "            font-weight: 600;\n" +
                "            cursor: pointer;\n" +
                "            box-shadow: 0 4px 18px rgba(99,138,255,0.25);\n" +
                "        }\n" +
                "        button:active {\n" +
                "            transform: scale(0.95);\n" +
                "        }\n" +
                "    </style>\n" +
                "</head>\n" +
                "<body>\n" +
                "    <div class=\"icon\">📡</div>\n" +
                "    <h1>No Internet Connection</h1>\n" +
                "    <p>It looks like you're offline. Please check your network connection.</p>\n" +
                "    <button onclick=\"window.location.href='" + AppConfig.WEB_URL + "/'\">Retry Connection</button>\n" +
                "    <p style=\"margin-top: 1rem; font-size: 0.85rem; opacity: 0.7;\">Or swipe down to refresh</p>\n" +
                "</body>\n" +
                "</html>";
            view.loadDataWithBaseURL(AppConfig.WEB_URL + "/", offlineHtml, "text/html", "UTF-8", null);
        }
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (AppConfig.WIPE_CACHE_ON_STARTUP) {
            view.evaluateJavascript(
                "try {" +
                "  localStorage.removeItem('expman_sms_txn_cache');" +
                "  localStorage.removeItem('expman_sms_approved_ids');" +
                "  localStorage.removeItem('expman_sms_discarded_ids');" +
                "  if(window.renderAll) window.renderAll();" +
                "} catch(e){}", null);
        }
    }
}

