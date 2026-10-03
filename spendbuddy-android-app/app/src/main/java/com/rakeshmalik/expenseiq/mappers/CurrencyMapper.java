package com.rakeshmalik.expenseiq.mappers;

import java.util.regex.Pattern;

/**
 * Utility mapper to normalize extracted currency strings.
 * Defaults to "INR" when currency is null or unassigned.
 */
public class CurrencyMapper {
    public static final String INR = "INR";
    private static final Pattern INR_PATTERN = Pattern.compile(".*(inr|₹).*", Pattern.CASE_INSENSITIVE);

    public static final String DEFAULT_CURRENCY = INR;

    public static String mapCurrency(String extractedCurrency) {
        if (extractedCurrency == null || extractedCurrency.trim().isEmpty()) {
            return DEFAULT_CURRENCY;
        }
        if (INR_PATTERN.matcher(extractedCurrency).matches()) {
            return INR;
        }
        return extractedCurrency;
    }
}
