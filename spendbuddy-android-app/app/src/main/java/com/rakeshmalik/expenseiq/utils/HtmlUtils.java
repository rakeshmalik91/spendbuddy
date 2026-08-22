package com.rakeshmalik.expenseiq.utils;

import android.text.Html;
import android.os.Build;

public class HtmlUtils {
    public static String htmlStripper(String html) {
        if (html == null) return "";
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                return Html.fromHtml(html, Html.FROM_HTML_MODE_LEGACY).toString();
            } else {
                return Html.fromHtml(html).toString();
            }
        } catch (Throwable e) {
            // Fallback for JVM unit tests where android.text.Html is not available
            String withNewlines = html
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</(?:p|div|tr|li|h[1-6]|table)>", "\n");
            return withNewlines.replaceAll("<[^>]*>", " ").replaceAll("[ \\t]+", " ").replaceAll("\n\\s*\n", "\n").trim();
        }
    }
}

