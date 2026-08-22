package com.rakeshmalik.expenseiq.mappers;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Utility class to extract transaction modes (UPI, Meal Card, Card, Bank Transfer)
 * from email and SMS notification content.
 */
public class TransactionModeMapper {

    private static final Pattern DOES_NOT_SEEK_PATTERN = Pattern.compile("(?s)does not seek.*");
    private static final Pattern DO_NOT_PART_PATTERN = Pattern.compile("(?s)do not part with.*");
    private static final Pattern BANK_DETAILS_PATTERN = Pattern.compile("(?i)bank\\s+details");

    private static final Pattern UPI_WORD_PATTERN = Pattern.compile("\\bupi\\b", Pattern.CASE_INSENSITIVE);

    private static final List<String> UPI_APP_KEYWORDS = Arrays.asList(
        "phonepe", "gpay", "paytm"
    );

    private static final List<String> MEAL_CARD_KEYWORDS = Arrays.asList(
        "pluxee", "meal wallet", "sodexo"
    );

    private static final List<String> CARD_KEYWORDS = Arrays.asList(
        "credit card", "debit card", "card payment",
        "paid via credit", "paid via debit", "paid via card",
        "visa", "mastercard", "rupay"
    );

    private static final List<Pattern> BANK_KEYWORD_PATTERNS = buildBankKeywordPatterns(Arrays.asList(
        "bank", "atm", "sbi", "hdfc", "icici", "axis", "kotak", "pnb", "bob", 
        "idfc", "indusind", "canara", "union", "federal", "yes bank", "citi", "standard chartered",
        "neft", "rtgs", "imps", "ach", "chq", "cheque", "withdrawal", "deposit", "netbanking"
    ));

    private static List<Pattern> buildBankKeywordPatterns(List<String> keywords) {
        List<Pattern> patterns = new ArrayList<>(keywords.size());
        for (String keyword : keywords) {
            patterns.add(Pattern.compile("\\b" + Pattern.quote(keyword) + "\\b", Pattern.CASE_INSENSITIVE));
        }
        return patterns;
    }

    public static String extractTransactionMode(String sender, String body) {
        String searchString = (sender + " " + body).toLowerCase();

        // Strip security warning disclaimers (e.g. "does not seek credit card details", "do not share bank details")
        String cleanText = BANK_DETAILS_PATTERN.matcher(
            DO_NOT_PART_PATTERN.matcher(
                DOES_NOT_SEEK_PATTERN.matcher(searchString).replaceAll("")
            ).replaceAll("")
        ).replaceAll("");

        // Check for UPI payment apps & keywords
        for (String app : UPI_APP_KEYWORDS) {
            if (cleanText.contains(app)) {
                return "UPI";
            }
        }
        if (UPI_WORD_PATTERN.matcher(cleanText).find()) {
            return "UPI";
        }

        // Check for Meal Card keywords
        for (String keyword : MEAL_CARD_KEYWORDS) {
            if (cleanText.contains(keyword)) {
                return "Meal Card";
            }
        }

        // Check for Card keywords
        for (String keyword : CARD_KEYWORDS) {
            if (cleanText.contains(keyword)) {
                return "Card";
            }
        }

        // Check for Bank Transfer keywords
        for (Pattern pattern : BANK_KEYWORD_PATTERNS) {
            if (pattern.matcher(cleanText).find()) {
                return "Bank Transfer";
            }
        }

        return "UPI";
    }
}
