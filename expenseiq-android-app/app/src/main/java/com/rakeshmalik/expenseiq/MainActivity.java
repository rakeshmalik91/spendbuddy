package com.rakeshmalik.expenseiq;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.text.InputType;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.rakeshmalik.expenseiq.processors.EmailProcessor;
import com.rakeshmalik.expenseiq.processors.SmsProcessor;
import com.rakeshmalik.expenseiq.processors.Transaction;
import com.rakeshmalik.expenseiq.processors.TransactionCache;

import com.rakeshmalik.expenseiq.webview.WebAppInterface;
import com.rakeshmalik.expenseiq.webview.CachedWebViewClient;
import com.rakeshmalik.expenseiq.webview.SiteCache;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import android.location.Location;
import android.location.LocationManager;
import android.annotation.SuppressLint;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SiteCache siteCache;

    private FrameLayout mainContainer;
    private TextView debugBadge = null;
    private final SmsProcessor smsProcessor = new SmsProcessor();
    private final EmailProcessor emailProcessor = new EmailProcessor();

    private String currentLoadedBaseUrl = AppConfig.WEB_URL;
    private long lastBackgroundTime = 0;
    private static final long INACTIVE_THRESHOLD_MS = 5 * 60 * 1000L; // 5 minutes

    private ValueCallback<Uri[]> filePathCallback;
    private final ActivityResultLauncher<Intent> fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (filePathCallback == null) return;
                Uri[] results = null;
                if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                    String dataString = result.getData().getDataString();
                    if (dataString != null) {
                        results = new Uri[]{Uri.parse(dataString)};
                    }
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
    );

    private android.webkit.GeolocationPermissions.Callback geolocationCallback;
    private String geolocationOrigin;
    private boolean isNativeLocationRequest = false;
    private final ActivityResultLauncher<String[]> locationPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            result -> {
                Boolean fineGranted = result.getOrDefault(Manifest.permission.ACCESS_FINE_LOCATION, false);
                Boolean coarseGranted = result.getOrDefault(Manifest.permission.ACCESS_COARSE_LOCATION, false);
                
                if (isNativeLocationRequest) {
                    if (fineGranted || coarseGranted) {
                        fetchLocation();
                    } else {
                        webView.evaluateJavascript("if(window.onAndroidLocationError) window.onAndroidLocationError('Permission denied');", null);
                        Toast.makeText(this, "Location permission denied", Toast.LENGTH_SHORT).show();
                    }
                    isNativeLocationRequest = false;
                } else if (geolocationCallback != null) {
                    if (fineGranted || coarseGranted) {
                        geolocationCallback.invoke(geolocationOrigin, true, false);
                    } else {
                        geolocationCallback.invoke(geolocationOrigin, false, false);
                        Toast.makeText(this, "Location permission denied", Toast.LENGTH_SHORT).show();
                    }
                    geolocationCallback = null;
                    geolocationOrigin = null;
                }
            }
    );

    public void requestNativeLocation() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            isNativeLocationRequest = true;
            locationPermissionLauncher.launch(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
            });
        } else {
            fetchLocation();
        }
    }

    @SuppressLint("MissingPermission")
    public void fetchLocation() {
        LocationManager locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager != null) {
            Location loc = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            if (loc == null) {
                loc = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            }
            if (loc != null) {
                double lat = loc.getLatitude();
                double lon = loc.getLongitude();
                webView.evaluateJavascript("if(window.onAndroidLocationReceived) window.onAndroidLocationReceived(" + lat + ", " + lon + ");", null);
            } else {
                webView.evaluateJavascript("if(window.onAndroidLocationError) window.onAndroidLocationError('Location unavailable');", null);
            }
        } else {
            webView.evaluateJavascript("if(window.onAndroidLocationError) window.onAndroidLocationError('LocationManager null');", null);
        }
    }
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        if (AppConfig.WIPE_CACHE_ON_STARTUP) {
            TransactionCache.saveCachedTransactions(this, "sms_cache_json", new ArrayList<Transaction>());
            TransactionCache.setLastScanTime(this, "last_sms_scan_time", 0L);
            TransactionCache.saveCachedTransactions(this, "email_cache_json", new ArrayList<Transaction>());
            TransactionCache.setLastScanTime(this, "last_email_scan_time", 0L);
            
            SharedPreferences prefs = getSharedPreferences("ExpenseIQPrefs", Context.MODE_PRIVATE);
            prefs.edit().remove("last_sms_date").apply();
        }

        FrameLayout container = new FrameLayout(this);
        mainContainer = container;
        container.setBackgroundColor(Color.parseColor("#0b0e14"));
        
        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0b0e14"));
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        container.addView(webView);

        ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
            androidx.core.graphics.Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });
        setContentView(container);

        siteCache = new SiteCache(this);



        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setGeolocationEnabled(true);
        
        webView.setWebViewClient(new CachedWebViewClient(siteCache));
        webView.addJavascriptInterface(new WebAppInterface(this, smsProcessor), "Android");

        webView.setWebChromeClient(new WebChromeClient() {
            private View customView = null;
            private CustomViewCallback customViewCallback = null;

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d("WebViewConsole", consoleMessage.message() + " -- From line "
                        + consoleMessage.lineNumber() + " of "
                        + consoleMessage.sourceId());
                return super.onConsoleMessage(consoleMessage);
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    geolocationCallback = callback;
                    geolocationOrigin = origin;
                    locationPermissionLauncher.launch(new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                    });
                } else {
                    callback.invoke(origin, true, false);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                
                Intent intent = fileChooserParams.createIntent();
                try {
                    fileChooserLauncher.launch(intent);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                
                webView.setVisibility(View.GONE);
                mainContainer.addView(customView, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                ));
                
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.systemBars());
                
                Toast.makeText(MainActivity.this, "Press Back or tap on the screen to exit fullscreen", Toast.LENGTH_SHORT).show();
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                
                mainContainer.removeView(customView);
                customView = null;
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }
                customViewCallback = null;
                
                webView.setVisibility(View.VISIBLE);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).show(
                    WindowInsetsCompat.Type.systemBars()
                );
            }
        });

        checkLocalServerAndLoad();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // How to access customView from here? We need to store it in MainActivity or make WebChromeClient anonymous but with accessible fields
                // For simplicity, let's just check if we are in fullscreen
                if (webView.getVisibility() == View.GONE) {
                    Objects.requireNonNull(webView.getWebChromeClient()).onHideCustomView();
                } else if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }

    private void checkLocalServerAndLoad() {
        final String localHost = AppConfig.LOCAL_WEB_URL;
        new Thread(() -> {
            boolean localAvailable = false;
            try {
                URL url = new URL(localHost);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(200);
                connection.setReadTimeout(200);
                connection.setRequestMethod("GET");
                int responseCode = connection.getResponseCode();
                if (responseCode >= 200 && responseCode <= 399) {
                    localAvailable = true;
                }
            } catch (Exception ignored) {
            }

            final boolean finalLocalAvailable = localAvailable;
            final String finalUrl = finalLocalAvailable ? localHost : AppConfig.WEB_URL;

            checkAndClearCacheIfSiteChanged(finalUrl);

            runOnUiThread(() -> {
                if (finalLocalAvailable) {
                    currentLoadedBaseUrl = localHost;
                    webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
                    showDebugBadge();
                } else {
                    currentLoadedBaseUrl = AppConfig.WEB_URL;
                    webView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
                    hideDebugBadge();
                }
                webView.loadUrl(currentLoadedBaseUrl);

            });
        }).start();
    }

    private void showDebugBadge() {
        if (debugBadge == null) {
            debugBadge = new TextView(this);
            debugBadge.setText("DEBUG MODE");
            debugBadge.setBackgroundColor(Color.parseColor("#e53935"));
            debugBadge.setTextColor(Color.WHITE);
            debugBadge.setPadding(0, 0, 0, 0);
            debugBadge.setTextSize(10f);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            );
            lp.gravity = Gravity.TOP | Gravity.END;
            lp.topMargin = 0;
            lp.rightMargin = 0;
            debugBadge.setLayoutParams(lp);
            debugBadge.setElevation(10f);
            mainContainer.addView(debugBadge);
        } else {
            debugBadge.setVisibility(View.VISIBLE);
        }
        debugBadge.bringToFront();
        mainContainer.invalidate();
    }

    private void hideDebugBadge() {
        if (debugBadge != null) {
            debugBadge.setVisibility(View.GONE);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        lastBackgroundTime = System.currentTimeMillis();
    }

    @Override
    protected void onResume() {
        super.onResume();
        
        // Trigger web app background sync
        if (webView != null) {
            webView.post(() -> {
                webView.evaluateJavascript("if(window.syncCloudDataInBackground) window.syncCloudDataInBackground();", null);
            });
        }

        if (lastBackgroundTime > 0 && System.currentTimeMillis() - lastBackgroundTime > INACTIVE_THRESHOLD_MS) {
            webView.loadUrl(currentLoadedBaseUrl);
        }
    }

    private void sendMergedToWebView(List<Transaction> transactionsList) {
        if (!transactionsList.isEmpty()) {
            try {
                JSONArray jsonArray = new JSONArray();
                for (Transaction txn : transactionsList) {
                    JSONObject obj = new JSONObject();
                    obj.put("date", txn.date);
                    obj.put("amount", txn.amount);
                    obj.put("currency", txn.currency);
                    obj.put("merchant", txn.merchant != null ? txn.merchant : "");
                    obj.put("masterCategory", txn.masterCategory);
                    obj.put("transactionMode", txn.transactionMode);
                    obj.put("source", txn.source);
                    obj.put("transactionId", txn.transactionId != null ? txn.transactionId : "");
                    obj.put("timestamp", txn.timestamp);
                    jsonArray.put(obj);
                }
                final String jsonStr = jsonArray.toString().replace("'", "\\'");
                webView.post(() -> {
                    webView.evaluateJavascript("if(window.receiveSmsTransactions) window.receiveSmsTransactions('" + jsonStr + "');", null);
                });
            } catch (Exception e) {
                Log.e("MainActivity", "Error merging transactions", e);
            }
        }
    }

    private void triggerSync() {
        webView.post(() -> {
            webView.evaluateJavascript("if(window.showSmsSpinner) window.showSmsSpinner();", null);
            webView.evaluateJavascript("if(window.showEmailSpinner) window.showEmailSpinner();", null);
        });

        final List<Transaction> initialCachedSms = TransactionCache.getCachedTransactions(this, "sms_cache_json");
        final List<Transaction> initialCachedEmail = TransactionCache.getCachedTransactions(this, "email_cache_json");
        
        Set<String> emailTxnSetCached = new HashSet<>();
        for (Transaction txn : initialCachedEmail) {
            emailTxnSetCached.add(txn.date + "_" + txn.amount);
        }
        
        List<Transaction> combinedCached = new ArrayList<>(initialCachedEmail);
        for (Transaction txn : initialCachedSms) {
            if (!emailTxnSetCached.contains(txn.date + "_" + txn.amount)) {
                combinedCached.add(txn);
            }
        }
        
        if (!combinedCached.isEmpty()) {
            sendMergedToWebView(combinedCached);
        }

        final List<Transaction>[] finalSmsList = new List[]{initialCachedSms};
        final List<Transaction>[] finalEmailList = new List[]{initialCachedEmail};
        
        Runnable sendUpdate = () -> {
            Set<String> emailSet = new HashSet<>();
            for (Transaction txn : finalEmailList[0]) {
                emailSet.add(txn.date + "_" + txn.amount);
            }
            List<Transaction> combined = new ArrayList<>(finalEmailList[0]);
            for (Transaction txn : finalSmsList[0]) {
                if (!emailSet.contains(txn.date + "_" + txn.amount)) {
                    combined.add(txn);
                }
            }
            sendMergedToWebView(combined);
        };

        smsProcessor.initializeAndRead(this, webView, txns -> {
            boolean hasNewSms = txns.size() > finalSmsList[0].size();
            finalSmsList[0] = txns;
            if (hasNewSms) {
                sendUpdate.run();
            }
            webView.post(() -> {
                webView.evaluateJavascript("if(window.hideSmsSpinner) window.hideSmsSpinner();", null);
            });
        });
        
        emailProcessor.syncIfLinked(this, webView, false, txns -> {
            boolean hasNewEmail = txns.size() > finalEmailList[0].size();
            finalEmailList[0] = txns;
            if (hasNewEmail) {
                sendUpdate.run();
            }
            webView.post(() -> {
                webView.evaluateJavascript("if(window.hideEmailSpinner) window.hideEmailSpinner();", null);
            });
        });
    }

    private final ActivityResultLauncher<String> requestSmsPermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestPermission(), isGranted -> {
            if (isGranted) {
                triggerSync();
            } else {
                Log.e("SMS_LOG", "SMS permission denied");
                webView.post(() -> {
                    webView.evaluateJavascript("if(window.showLoader) window.showLoader('Scanning Emails...');", null);
                });
                emailProcessor.syncIfLinked(this, webView, false, txns -> {
                    sendMergedToWebView(txns);
                    webView.post(() -> {
                        webView.evaluateJavascript("if(window.hideLoader) window.hideLoader();", null);
                    });
                });
            }
        });

    public void checkSmsPermissionAndRead() {
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.READ_SMS
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            triggerSync();
        } else {
            requestSmsPermissionLauncher.launch(Manifest.permission.READ_SMS);
        }
    }



    public void promptForEmailCredentials(String defaultEmail) {
        SharedPreferences prefs = getSharedPreferences("ExpenseIQPrefs", Context.MODE_PRIVATE);
        String savedEmail = prefs.getString("imap_email", "");
        
        String initialEmail = !savedEmail.isEmpty() ? savedEmail : defaultEmail.contains("@gmail.com") ? defaultEmail : "";

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(50, 40, 50, 10);

        EditText emailBox = new EditText(this);
        emailBox.setHint("Gmail Address");
        emailBox.setText(initialEmail);
        layout.addView(emailBox);

        EditText passBox = new EditText(this);
        passBox.setHint("16-char App Password");
        passBox.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        layout.addView(passBox);

        new AlertDialog.Builder(this)
            .setTitle("Gmail IMAP Login")
            .setMessage("Enter your Google App Password (requires 2FA).")
            .setView(layout)
            .setPositiveButton("Connect", (dialog, which) -> {
                String email = emailBox.getText().toString().trim();
                String pass = passBox.getText().toString().trim();
                if (!email.isEmpty() && !pass.isEmpty()) {
                    prefs.edit().putString("imap_email", email).putString("imap_pass", pass).apply();
                    webView.post(() -> {
                        webView.evaluateJavascript("if(window.updateAccountView) window.updateAccountView();", null);
                        webView.evaluateJavascript("if(window.onImapCredentialsSaved) window.onImapCredentialsSaved('" + email + "', '" + pass + "');", null);
                    });
                    emailProcessor.initializeAndRead(this, webView, email, pass, false, null);
                }
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void checkAndClearCacheIfSiteChanged(String finalUrl) {
        try {
            URL checkUrl = new URL(finalUrl + "/index.html");
            HttpURLConnection conn = (HttpURLConnection) checkUrl.openConnection();
            conn.setConnectTimeout(1500);
            conn.setReadTimeout(1500);
            conn.setRequestMethod("HEAD");
            if (conn.getResponseCode() == 200) {
                String currentETag = conn.getHeaderField("ETag");
                if (currentETag == null) currentETag = "";
                String currentLastModified = conn.getHeaderField("Last-Modified");
                if (currentLastModified == null) currentLastModified = "";

                SharedPreferences prefs = getSharedPreferences("ExpenseIQPrefs", Context.MODE_PRIVATE);
                String savedETag = prefs.getString("site_etag", "");
                String savedLastModified = prefs.getString("site_last_modified", "");
                
                boolean hasChanged = (!currentETag.isEmpty() && !currentETag.equals(savedETag)) || 
                                     (!currentLastModified.isEmpty() && !currentLastModified.equals(savedLastModified));
                                 
                if (hasChanged) {
                    Log.d("ExpenseIQ", "Remote site changed, clearing cache");
                    siteCache.clearCache();
                    prefs.edit()
                        .putString("site_etag", currentETag)
                        .putString("site_last_modified", currentLastModified)
                        .apply();
                } else if (savedETag.isEmpty() && savedLastModified.isEmpty()) {
                    prefs.edit()
                        .putString("site_etag", currentETag)
                        .putString("site_last_modified", currentLastModified)
                        .apply();
                }
            }
        } catch (Exception e) {
            Log.w("ExpenseIQ", "Failed to check if site changed: " + e.getMessage());
        }
    }

    public void saveFileFromBase64(String base64Data, String filename) {
        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.content.ContentValues contentValues = new android.content.ContentValues();
                contentValues.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, filename);
                contentValues.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/zip");
                contentValues.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);

                android.net.Uri uri = getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);
                if (uri != null) {
                    try (OutputStream outputStream = getContentResolver().openOutputStream(uri)) {
                        if (outputStream != null) {
                            outputStream.write(bytes);
                        }
                    }
                    Toast.makeText(this, "Backup saved to Downloads folder", Toast.LENGTH_LONG).show();
                }
            } else {
                File dir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS);
                File file = new File(dir, filename);
                try (FileOutputStream fos = new FileOutputStream(file)) {
                    fos.write(bytes);
                }
                Toast.makeText(this, "Backup saved to Downloads folder", Toast.LENGTH_LONG).show();
            }
        } catch (Exception e) {
            Log.e("ExpenseIQ", "Failed to save backup file: " + filename, e);
            Toast.makeText(this, "Failed to save backup: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    public void evaluateJavascript(String script) {
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
