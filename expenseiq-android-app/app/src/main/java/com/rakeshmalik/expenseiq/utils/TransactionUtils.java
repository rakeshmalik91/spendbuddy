package com.rakeshmalik.expenseiq.utils;

import com.rakeshmalik.expenseiq.AppConfig;
import java.util.ArrayList;
import java.util.List;

public class TransactionUtils {
    public static boolean isCreditTransaction(String text) {
        if (text == null) return false;
        String lower = text.toLowerCase();

        // If message is explicitly a payment receipt/confirmation (e.g. "payment of", "payment received", "payment for", "payment is updated", "payment updated", "receipt", "order confirmed", "contribution")
        // and doesn't mention refund/cashback/reversal, it is an expense (payment made by user), not a credit/refund.
        if (lower.contains("payment of") || lower.contains("payment received") || lower.contains("received a payment") || 
            lower.contains("received your payment") || lower.contains("received payment") || lower.contains("payment for") || 
            lower.contains("payment updated") || lower.contains("payment is updated") || lower.contains("receipt") || 
            lower.contains("order confirmed") || lower.contains("purchase receipt") || lower.contains("order receipt") ||
            lower.contains("order ") || lower.contains("purchase") || lower.contains("invoice") || lower.contains("thank you for your") ||
            lower.contains("contribution") || lower.contains("e-ticket") || lower.contains("ticket confirmation") ||
            lower.contains("booking confirmation") || lower.contains("booking details")) {
            if (isRefundTransaction(text)) {
                return true;
            }
            return false;
        }





        String lowerNoCard = lower
            .replaceAll("(?i)erroneously\\s+received", "")
            .replaceAll("(?i)received\\s+(?:in\\s+error|by\\s+mistake)", "")
            .replaceAll("(?i)credit\\s*(?:/|&|and)?\\s*debit\\s*card|credit\\s*card", "");
        for (String keyword : AppConfig.CREDIT_KEYWORDS) {
            if (lowerNoCard.contains(keyword)) {
                return true;
            }
        }
        return false;
    }




    /**
     * Checks if a message (subject or body) is a payment reminder, bill due notification, or non-transaction.
     * Returns true if it contains reminder/due keywords and lacks completion confirmation keywords.
     */
    public static boolean isReminderOrNonTransaction(String subject, String body) {
        String combined = (subject != null ? subject : "") + " " + (body != null ? body : "");
        if (combined.trim().isEmpty()) return false;
        String lower = combined.toLowerCase();

        // Filter out shipment/dispatch notifications (which contain partial order info rather than full order transactions)
        if (lower.contains("package was shipped") || lower.contains("has been shipped") ||
            lower.contains("package has shipped") || lower.contains("your package was shipped") ||
            lower.contains("order has been shipped") || lower.contains("your order has been shipped") ||
            lower.contains("shipment update") || lower.contains("package is on its way") ||
            (subject != null && (subject.toLowerCase().startsWith("shipped") || subject.toLowerCase().contains("shipped:")))) {
            return true;
        }

        // Explicit completion confirmation phrases (e.g. "payment was successful", "debited from", "credited to", "payment received")
        boolean hasCompletionConfirmation = lower.contains("was successful") || lower.contains("is successful") ||
                lower.contains("successfully paid") || lower.contains("payment received") ||
                lower.contains("payment updated") || lower.contains("payment is updated") ||
                lower.contains("debited") || lower.contains("credited") ||
                lower.contains("spent") || lower.contains("sent rs") || lower.contains("deposited");

        // Check if subject or body matches any reminder keyword
        boolean matchesReminderKeyword = false;
        for (String keyword : AppConfig.REMINDER_KEYWORDS) {
            java.util.regex.Pattern p = java.util.regex.Pattern.compile("\\b" + java.util.regex.Pattern.quote(keyword) + "\\b", java.util.regex.Pattern.CASE_INSENSITIVE);
            if (p.matcher(lower).find()) {
                matchesReminderKeyword = true;
                break;
            }
        }

        // If it matches reminder keywords and does NOT have explicit payment completion confirmation, treat as non-transaction
        if (matchesReminderKeyword && !hasCompletionConfirmation) {
            return true;
        }

        return false;
    }

    /**
     * Checks whether an amount match at range [matchStart, matchEnd] in fullText is a promotional offer amount (e.g. "upto ₹50", "cashback upto ₹50").
     */
    public static boolean isPromoAmount(String fullText, int matchStart, int matchEnd) {
        if (fullText == null || matchStart < 0 || matchEnd > fullText.length()) return false;

        // Check text snippet preceding the match (up to 35 chars)
        int prefixStart = Math.max(0, matchStart - 35);
        String prefixSnippet = fullText.substring(prefixStart, matchStart);
        if (AppConfig.PROMO_AMOUNT_PREFIX.matcher(prefixSnippet).find()) {
            return true;
        }

        // Check text snippet following the match (up to 20 chars)
        int suffixEnd = Math.min(fullText.length(), matchEnd + 20);
        String suffixSnippet = fullText.substring(matchEnd, suffixEnd);
        if (AppConfig.PROMO_AMOUNT_SUFFIX.matcher(suffixSnippet).find()) {
            return true;
        }

        return false;
    }

    /**
     * Checks whether a matched text snippet (e.g. "₹50") in fullText is a promotional offer amount (e.g. "upto ₹50", "cashback upto ₹50").
     */
    public static boolean isPromoAmountInText(String fullText, String targetSnippet) {
        if (fullText == null || targetSnippet == null || targetSnippet.trim().isEmpty()) return false;

        int matchStart = fullText.indexOf(targetSnippet);
        while (matchStart >= 0) {
            int matchEnd = matchStart + targetSnippet.length();
            if (isPromoAmount(fullText, matchStart, matchEnd)) {
                return true;
            }
            matchStart = fullText.indexOf(targetSnippet, matchStart + 1);
        }
        return false;
    }


    /**
     * Scans text for transaction amounts using AMOUNT_REGEX, skipping promotional offer amounts.
     */
    private static final java.util.regex.Pattern TRAILING_AMOUNT_REGEX = java.util.regex.Pattern.compile(
        "(?i)([0-9,]+(?:\\.[0-9]{1,2})?)\\s*\\b(?:inr|rs\\.?:?|₹)\\b"
    );

    private static final java.util.regex.Pattern EXPLICIT_TOTAL_AMOUNT_REGEX = java.util.regex.Pattern.compile(
        "(?i)\\b(?:paid\\s+via|total\\s+paid|grand\\s+total|amount\\s+paid|total\\s+amount|order\\s+total|net\\s+amount|paid\\s+successfully|(?<!sub)total(?!\\s+(?:tax|available|balance|bal)\\b))\\b((?:\\s*[^0-9₹]*?(?:rs\\.?:?|inr|₹)\\s*[0-9,]+(?:\\.[0-9]{1,2})?)+)",
        java.util.regex.Pattern.CASE_INSENSITIVE
    );

    private static final java.util.regex.Pattern BARE_AMOUNT_REGEX = java.util.regex.Pattern.compile(
        "(?i)\\b(?:receipt\\s+amount|transaction\\s+amount|txn\\s+amount|net\\s+amount\\s+refundable|refund\\s+amount|amount\\s+refundable|refundable\\s+amount|refund\\s*-\\s*₹)[^0-9]{0,50}?(?:[:\\-=]\\s*)?([0-9,]+(?:\\.[0-9]{1,2})?)"
    );


    public static List<Double> extractAllValidAmounts(String text) {
        List<Double> amounts = new ArrayList<>();
        if (text == null) return amounts;

        String cleanText = text
            .replaceAll("(?i)<sup\\b[^>]*>([0-9]{2})</sup>", ".$1")
            .replaceAll("(?i)=E2=82=B9|&#8377;|&#x20b9;|\\\\u20b9", "₹")
            .replaceAll("(?i)&inr;", "₹")
            .replaceAll("(?i)&nbsp;", " ")
            .replaceAll("<[^>]*>", " ")
            .replaceAll("\\s+", " ")
            .replaceAll("(?<=[0-9,])\\s+(?=\\.[0-9])", "")
            .replaceAll("(?<=[0-9,]{3})\\s+([0-9]{2})(?![0-9])", ".$1");


        java.util.regex.Matcher bareMatcher = BARE_AMOUNT_REGEX.matcher(cleanText);
        if (bareMatcher.find()) {
            String amountStr = bareMatcher.group(1);
            if (amountStr != null) {
                amountStr = amountStr.replace(",", "");
                try {
                    double amt = Double.parseDouble(amountStr);
                    if (amt > 0.0) {
                        amounts.add(amt);
                        return amounts;
                    }
                } catch (NumberFormatException ignored) {}
            }
        }

        java.util.regex.Matcher totalMatcher = EXPLICIT_TOTAL_AMOUNT_REGEX.matcher(cleanText);
        while (totalMatcher.find()) {
            String amountsBlock = totalMatcher.group(1);
            if (amountsBlock != null) {
                java.util.regex.Matcher inclMatcher = java.util.regex.Pattern.compile("\\((?:incl|includes)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(amountsBlock);
                if (inclMatcher.find()) {
                    amountsBlock = amountsBlock.substring(0, inclMatcher.start());
                }
                java.util.regex.Matcher amtMatcher = java.util.regex.Pattern.compile("(?:rs\\.?:?|inr|₹)\\s*([0-9,]+(?:\\.[0-9]{1,2})?)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(amountsBlock);
                String lastAmtStr = null;
                while (amtMatcher.find()) {
                    String candidate = amtMatcher.group(1);
                    if (candidate != null && candidate.replace(",", "").matches("^[0-9]+(?:\\.[0-9]{1,2})?$")) {
                        lastAmtStr = candidate;
                    }
                }
                if (lastAmtStr != null) {
                    lastAmtStr = lastAmtStr.replace(",", "");
                    try {
                        double amt = Double.parseDouble(lastAmtStr);
                        if (amt >= 0.0 && !amounts.contains(amt)) {
                            amounts.add(amt);
                        }
                    } catch (NumberFormatException ignored) {}
                }
            }
        }

        if (amounts.isEmpty()) {
            java.util.regex.Matcher matcher = AppConfig.AMOUNT_REGEX.matcher(cleanText);
            while (matcher.find()) {
                int start = matcher.start();
                int end = matcher.end();
                if (isPromoAmount(cleanText, start, end)) {
                    continue;
                }
                String amountStr = matcher.group(1);
                if (amountStr != null) {
                    amountStr = amountStr.replace(",", "");
                    try {
                        double amt = Double.parseDouble(amountStr);
                        if (amt > 0.0) {
                            amounts.add(amt);
                            break;
                        }
                    } catch (NumberFormatException ignored) {}
                }
            }
        }

        if (amounts.isEmpty()) {
            java.util.regex.Matcher matcher = TRAILING_AMOUNT_REGEX.matcher(cleanText);
            while (matcher.find()) {
                int start = matcher.start();
                int end = matcher.end();
                if (isPromoAmount(cleanText, start, end)) {
                    continue;
                }
                String amountStr = matcher.group(1);
                if (amountStr != null) {
                    amountStr = amountStr.replace(",", "");
                    try {
                        double amt = Double.parseDouble(amountStr);
                        if (amt > 0.0) {
                            amounts.add(amt);
                            break;
                        }
                    } catch (NumberFormatException ignored) {}
                }
            }
        }

        return amounts;
    }

    public static double extractValidAmount(String text) {
        List<Double> amounts = extractAllValidAmounts(text);
        if (amounts.isEmpty()) return 0.0;

        if (amounts.size() > 1 && text != null) {
            java.util.regex.Matcher orderNumMatcher = java.util.regex.Pattern.compile("(?i)order\\s*#\\s*[0-9-]+").matcher(text);
            java.util.Set<String> orderIds = new java.util.HashSet<>();
            while (orderNumMatcher.find()) {
                orderIds.add(orderNumMatcher.group().toLowerCase());
            }
            if (orderIds.size() > 1) {
                double sum = 0.0;
                for (double amt : amounts) {
                    sum += amt;
                }
                return Math.round(sum * 100.0) / 100.0;
            }
        }

        return amounts.get(amounts.size() - 1);
    }



    /**
     * Checks if a credit transaction is specifically a refund (refund keywords take priority).
     */
    public static boolean isRefundTransaction(String text) {
        if (text == null) return false;
        String lower = text.toLowerCase();
        // Exclude URLs and disclaimer lines mentioning refund policy/terms
        String cleaned = lower
            .replaceAll("<[^>]*>", " ")
            .replaceAll("https?://[^\\s\"'<>]+", "")
            .replaceAll("(?i)[^\\r\\n.]*?(?:cancellation|order cancellation|refund request|refund status|for your refund|submit a refund)[^\\r\\n.]*", "")



            .replaceAll("(?i)[^\\r\\n.]*?(?:refund[s\\-_\\s]*policy|refund[s\\-_\\s]*rules|steam[\\-_\\s]*refunds|store[\\-_\\s]*refund)[^\\r\\n.]*", "")
            .replaceAll("(?i)eligible\\s+for\\s+(?:a\\s+)?refund", "")
            .replaceAll("(?i)(?:non-?)?refundable", "")
            .replaceAll("(?i)refunds?\\s+(?:and/or|and|or)\\s+returns?", "")
            .replaceAll("(?i)returns?\\s+(?:and/or|and|or)\\s+refunds?", "")
            .replaceAll("(?i)request\\s+(?:a\\s+)?refund|refund\\s+request", "")
            .replaceAll("(?i)full\\s+refund\\s+(?:of\\s+fare|of\\s+the\\s+ticket)?", "")
            .replaceAll("(?i)refund\\s+is\\s+admissible", "")
            .replaceAll("(?i)refund\\s+of\\s+(?:money|fare|the\\s+ticket\\s+amount)", "")
            .replaceAll("(?i)no[\\-_\\s]+refund", "")
            .replaceAll("(?i)claiming\\s+refund", "")
            .replaceAll("(?i)automatic\\s+refund", "")
            .replaceAll("(?i)refund[s\\-_\\s]+faq", "");



        for (String keyword : AppConfig.REFUND_KEYWORDS) {
            if (cleaned.contains(keyword)) {
                return true;
            }
        }
        return false;
    }





    /**
     * Checks if an email (by subject and body) is a valid transaction email,
     * ensuring it is not promotional/spam and not a payment reminder or due bill.
     */
    public static boolean isTransactionEmail(String subject, String body) {
        if (subject == null) subject = "";
        String subjectLower = subject.toLowerCase();

        // 1. Subject must contain a transaction keyword
        boolean hasTxnKeyword = false;
        for (String keyword : AppConfig.TRANSACTION_KEYWORDS) {
            java.util.regex.Pattern p = java.util.regex.Pattern.compile("\\b" + java.util.regex.Pattern.quote(keyword) + "\\b", java.util.regex.Pattern.CASE_INSENSITIVE);
            if (p.matcher(subjectLower).find()) {
                hasTxnKeyword = true;
                break;
            }
        }
        if (!hasTxnKeyword) return false;

        // 2. Subject must not contain promo keywords
        for (String keyword : AppConfig.PROMO_KEYWORDS) {
            java.util.regex.Pattern p = java.util.regex.Pattern.compile("\\b" + java.util.regex.Pattern.quote(keyword) + "\\b", java.util.regex.Pattern.CASE_INSENSITIVE);
            if (p.matcher(subjectLower).find()) {
                return false;
            }
        }

        // 3. Must not be a payment reminder or bill due notification
        if (isReminderOrNonTransaction(subject, body)) {
            return false;
        }

        return true;
    }


    /**
     * Checks if a credit transaction is specifically income (salary, NEFT deposit, etc.).
     */
    public static boolean isIncomeTransaction(String text) {
        if (text == null) return false;
        String lower = text.toLowerCase();
        for (String keyword : AppConfig.INCOME_KEYWORDS) {
            if (lower.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if a transaction is a Transfer (e.g., Credit Card bill payments, ATM cash withdrawals).
     */
    public static boolean isTransferTransaction(String text) {
        if (text == null) return false;
        String lower = text.toLowerCase();
        return lower.contains("credit card bill") || 
               lower.contains("cc bill payment") || 
               lower.contains("credit card bill payment") ||
               lower.contains("bill payment received towards your") ||
               lower.contains("credit card payment received") ||
               lower.contains("atm withdrawal") ||
               lower.contains("atm cash withdrawal") ||
               lower.contains("cash withdrawal") ||
               lower.contains("withdrawn from atm") ||
               lower.contains("withdrawn at atm") ||
               lower.contains("atm wdl") ||
               lower.contains("atm cash");
    }

    /**
     * Determines the transaction type based on message content.
     * Priority: Transfer keywords > Refund keywords > Income keywords > default (Income for credits, Expense for debits).
     */
    public static String getTxnType(String text, boolean isCredit) {
        if (isTransferTransaction(text)) {
            return "Transfer";
        }
        if (!isCredit) {
            return "Expense";
        }
        // For credit transactions, check refund first (higher priority)
        if (isRefundTransaction(text)) {
            return "Refund";
        }
        // Then check income keywords — but also default to Income for unclassified credits,
        // since most bank credit alerts are income (salary, transfers in, etc.)
        return "Income";
    }

    public static String extractDate(String text) {
        if (text == null) return null;
        
        // Pattern 1: DD-MM-YYYY or DD/MM/YY or DD-MMM-YY
        java.util.regex.Pattern p1 = java.util.regex.Pattern.compile("(?i)(?:on|date:?)\\s*(\\d{1,2})[-/\\s]+(\\d{1,2}|[a-z]{3})[-/\\s]+(\\d{2,4})");
        java.util.regex.Matcher m1 = p1.matcher(text);
        if (m1.find()) {
            String day = m1.group(1);
            String monthStr = m1.group(2);
            String year = m1.group(3);
            return formatDate(day, monthStr, year);
        }
        
        // Pattern 2: MMM DD YYYY or Day MMM DD YYYY
        java.util.regex.Pattern p2 = java.util.regex.Pattern.compile("(?i)(?:(?:mon|tue|wed|thu|fri|sat|sun)\\s+)?([a-z]{3})\\s+(\\d{1,2})\\s+(\\d{2,4})");
        java.util.regex.Matcher m2 = p2.matcher(text);
        if (m2.find()) {
            String monthStr = m2.group(1);
            String day = m2.group(2);
            String year = m2.group(3);
            return formatDate(day, monthStr, year);
        }
        
        return null;
    }

    private static String formatDate(String day, String monthStr, String year) {
        // pad day
        if (day.length() == 1) day = "0" + day;
        
        // parse month
        String month = "01";
        if (monthStr.matches("\\d+")) {
            month = monthStr;
            if (month.length() == 1) month = "0" + month;
        } else {
            String m = monthStr.toLowerCase();
            if (m.startsWith("jan")) month = "01";
            else if (m.startsWith("feb")) month = "02";
            else if (m.startsWith("mar")) month = "03";
            else if (m.startsWith("apr")) month = "04";
            else if (m.startsWith("may")) month = "05";
            else if (m.startsWith("jun")) month = "06";
            else if (m.startsWith("jul")) month = "07";
            else if (m.startsWith("aug")) month = "08";
            else if (m.startsWith("sep")) month = "09";
            else if (m.startsWith("oct")) month = "10";
            else if (m.startsWith("nov")) month = "11";
            else if (m.startsWith("dec")) month = "12";
        }
        
        // parse year
        if (year.length() == 2) {
            year = "20" + year; // assume 20xx
        }
        
        return year + "-" + month + "-" + day;
    }
}
