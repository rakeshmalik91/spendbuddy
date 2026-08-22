package com.rakeshmalik.expenseiq.mappers;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Utility class for merchant brand name formatting, acronym upper-casing,
 * canonical merchant aliases, and dynamic word-splitting.
 */
public class MerchantMapper {

    // All-uppercase brand acronyms formatted programmatically via .toUpperCase()
    private static final Set<String> ACRONYMS = new HashSet<>(Arrays.asList(
            "nps", "enps", "irctc", "uts", "lic"));

    // Canonical brand aliases and special character overrides
    private static final Map<String, String> BRAND_ALIASES = Map.of(
            "protean", "NPS",
            "proteantech", "NPS",
            "national pension system", "NPS",
            "irctcc", "IRCTC",
            "dominos", "Domino's",
            "nobroker", "NoBroker",
            "nobroker technologies", "NoBroker",
            "hdfcbank", "HDFC Bank",
            "hdfc", "HDFC Bank",
            "lic of india", "LIC of India");

    // Common brand suffixes for auto-splitting unspaced single-word merchant
    // keywords (e.g., "epicgames" -> "Epic Games")
    private static final List<String> BRAND_SUFFIXES = Arrays.asList(
            "games", "info", "pay", "bank", "direct", "digital", "trends", "tech");

    /**
     * Formats a raw keyword into a canonical display name using brand aliases,
     * dynamic word-splitting (e.g., "epicgames" -> "Epic Games"), or Title Case.
     *
     * @param keyword Raw merchant keyword string.
     * @return Clean, formatted merchant display name.
     */
    public static String formatMerchantName(String keyword) {
        if (keyword == null)
            return null;
        String lower = keyword.toLowerCase().trim();

        // 1. Programmatic uppercase formatting for known acronyms (e.g. nps -> NPS,
        // irctc -> IRCTC, hdfc -> HDFC)
        if (ACRONYMS.contains(lower)) {
            return lower.toUpperCase();
        }

        // 2. Canonical brand aliases and special character overrides (e.g. dominos ->
        // Domino's, sbm -> Sbm Bank, protean -> NPS)
        if (BRAND_ALIASES.containsKey(lower)) {
            return BRAND_ALIASES.get(lower);
        }

        // 3. Dynamic word-splitting for unspaced brand keywords (e.g. "epicgames" ->
        // "Epic Games", "amazonpay" -> "Amazon Pay", "hdfcbank" -> "HDFC Bank")
        if (!lower.contains(" ")) {
            for (String suffix : BRAND_SUFFIXES) {
                if (lower.endsWith(suffix) && lower.length() > suffix.length()) {
                    String prefix = lower.substring(0, lower.length() - suffix.length());
                    return capitalizeWords(prefix) + " " + capitalizeWords(suffix);
                }
            }
        }

        // 4. Fallback: Title Case formatting for standard single/multi-word merchant
        // names
        return capitalizeWords(lower);
    }

    /**
     * Capitalizes each word in a space-delimited string, preserving all-uppercase acronyms.
     */
    public static String capitalizeWords(String str) {
        if (str == null || str.isEmpty())
            return str;
        String[] words = str.split("\\s+");
        StringBuilder result = new StringBuilder();
        for (String word : words) {
            if (!word.isEmpty()) {
                if (ACRONYMS.contains(word.toLowerCase())) {
                    result.append(word.toUpperCase());
                } else {
                    result.append(Character.toUpperCase(word.charAt(0)))
                            .append(word.substring(1));
                }
                result.append(" ");
            }
        }
        return result.toString().trim();
    }
}
