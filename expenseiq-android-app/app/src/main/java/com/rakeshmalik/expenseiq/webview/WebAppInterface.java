package com.rakeshmalik.expenseiq.webview;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import android.webkit.JavascriptInterface;
import com.rakeshmalik.expenseiq.MainActivity;
import com.rakeshmalik.expenseiq.processors.SmsProcessor;

public class WebAppInterface {
    private final MainActivity mainActivity;
    private final SmsProcessor smsProcessor;

    public WebAppInterface(MainActivity mainActivity, SmsProcessor smsProcessor) {
        this.mainActivity = mainActivity;
        this.smsProcessor = smsProcessor;
    }

    @JavascriptInterface
    public void onWebAppReady() {
        Log.d("WebAppInterface", "onWebAppReady called from Javascript");
        mainActivity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                mainActivity.checkSmsPermissionAndRead();
            }
        });
    }

    @JavascriptInterface
    public void requestLocation() {
        mainActivity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                mainActivity.requestNativeLocation();
            }
        });
    }

    @JavascriptInterface
    public long getLastSmsDate() {
        SharedPreferences prefs = mainActivity.getSharedPreferences("ExpenseIQPrefs", Context.MODE_PRIVATE);
        return prefs.getLong("last_sms_date", 0L);
    }

    @JavascriptInterface
    public void setLastSmsDate(long timestamp) {
        SharedPreferences prefs = mainActivity.getSharedPreferences("ExpenseIQPrefs", Context.MODE_PRIVATE);
        prefs.edit().putLong("last_sms_date", timestamp).apply();
    }

    @JavascriptInterface
    public void fetchEmailTransactions(final String email) {
        mainActivity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                mainActivity.promptForEmailCredentials(email);
            }
        });
    }

    @JavascriptInterface
    public String getSavedImapEmail() {
        SharedPreferences prefs = mainActivity.getSharedPreferences("ExpenseIQPrefs", Context.MODE_PRIVATE);
        return prefs.getString("imap_email", "");
    }

    @JavascriptInterface
    public String getSavedImapPassword() {
        SharedPreferences prefs = mainActivity.getSharedPreferences("ExpenseIQPrefs", Context.MODE_PRIVATE);
        return prefs.getString("imap_pass", "");
    }

    @JavascriptInterface
    public void saveImapCredentials(String email, String pass) {
        SharedPreferences prefs = mainActivity.getSharedPreferences("ExpenseIQPrefs", Context.MODE_PRIVATE);
        prefs.edit().putString("imap_email", email).putString("imap_pass", pass).apply();
        mainActivity.evaluateJavascript("if(window.updateAccountView) window.updateAccountView();");
    }

    @JavascriptInterface
    public void unlinkImapEmail() {
        SharedPreferences prefs = mainActivity.getSharedPreferences("ExpenseIQPrefs", Context.MODE_PRIVATE);
        prefs.edit().remove("imap_email").remove("imap_pass").apply();
    }

    @JavascriptInterface
    public void saveBackup(final String base64Data, final String filename) {
        mainActivity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                mainActivity.saveFileFromBase64(base64Data, filename);
            }
        });
    }

    @JavascriptInterface
    public String readLocalCsv(String filename) {
        try {
            java.io.File file = new java.io.File(mainActivity.getFilesDir(), filename);
            if (!file.exists()) return "";
            java.io.FileInputStream fis = mainActivity.openFileInput(filename);
            java.io.InputStreamReader isr = new java.io.InputStreamReader(fis, "UTF-8");
            java.io.BufferedReader bufferedReader = new java.io.BufferedReader(isr);
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = bufferedReader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            fis.close();
            return sb.toString();
        } catch (Exception e) {
            Log.e("WebAppInterface", "Error reading local CSV: " + filename, e);
            return "";
        }
    }

    @JavascriptInterface
    public void writeLocalCsv(String filename, String content) {
        try {
            java.io.FileOutputStream fos = mainActivity.openFileOutput(filename, Context.MODE_PRIVATE);
            fos.write(content.getBytes("UTF-8"));
            fos.close();
        } catch (Exception e) {
            Log.e("WebAppInterface", "Error writing local CSV: " + filename, e);
        }
    }
}
