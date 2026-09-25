package com.rakeshmalik.expenseiq.mappers;

import androidx.core.util.Pair;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static java.util.Map.entry;

/**
 * Utility mapper to extract merchant names and spending categories
 * from SMS and Email transaction notifications.
 */
public class CategoryMapper {

    // Category Keyword Mappings
    private static final Map<String, String> KEYWORD_TO_CATEGORY = new HashMap<>();
    private static final Map<String, Pattern> KEYWORD_TO_PATTERN = new HashMap<>();

    // Payment Gateway Domains to skip when extracting merchant from sender email
    private static final Set<String> GATEWAY_DOMAINS = new HashSet<>(Arrays.asList(
        "amazonpay", "paytm", "phonepe", "gpay", "razorpay", "payu", 
        "billdesk", "ccavenue", "cashfree", "juspay", "mobikwik"
    ));

    private static final Pattern DOMAIN_TLD_PATTERN = Pattern.compile("\\.(com|in|gov|co|net|org|bank).*");

    // Dynamic Merchant Extraction Patterns
    private static final List<Pattern> DYNAMIC_MERCHANT_PATTERNS = Arrays.asList(
        Pattern.compile("(?im)^To\\s+(.+?)(?=\\r?\\n|$)"),
        Pattern.compile("(?i)UPI/(?:P2A|P2M|CR|DR|REV)/[0-9]+/([^/]+)"),
        Pattern.compile("(?i)payment\\s+(?:of\\s+(?:rs\\.?|inr|₹)\\s*[0-9,.]+\\s+)?to\\s+([A-Za-z0-9\\s]+?)\\s*\\.?\\s+(?:is|was)\\s+(?:Approved|Successful)"),
        Pattern.compile("(?i)(?:paid|payment|sent)\\s+(?:to|on)\\s+([a-zA-Z0-9\\s@.&*\\-]+?)(?:\\s+for|\\s+using|\\s+on|\\s+ref|\\r?\\n|\\.|$)"),
        Pattern.compile("(?i)\\bat\\s+([a-zA-Z0-9\\s*&.\\-]+?)\\s*\\.\\s*(?:Avl|Available)"),
        Pattern.compile("(?i)to\\s+VPA\\s+([a-zA-Z0-9.\\-_@]+(?:\\s+[a-zA-Z0-9]+)*?)\\s+(?:on|using)\\b"),
        Pattern.compile("(?i)debited.+?to\\s+(?!VPA\\b)([A-Za-z0-9\\s@*]+?)\\s+(?:on|using)\\b"),
        Pattern.compile("(?i)from\\s+(?:VPA|UPI ID)\\s+([a-zA-Z0-9.\\-_@]+)"),
        Pattern.compile("(?i)transfer\\s+from\\s+([a-zA-Z0-9\\s.]+?)(?:\\s+(?:Ref|\\bOn\\b)|\\.\\s*(?:Avl|Available|Ref)|\\.$|$)"),
        Pattern.compile("(?i)transfer(?:red)?\\s+to\\s+([a-zA-Z0-9\\s]+?)(?:\\s+on\\b|\\.|$)"),
        Pattern.compile("(?i)NEFT(?:\\s+Dr|-)[a-zA-Z0-9]+-([A-Za-z\\s]+?)-"),
        Pattern.compile("(?i)sent\\s+by:\\s+([a-zA-Z0-9.\\-_@\\s/]+?)(?:\\bOn\\b|\\r?\\n|\\.|$)"),
        Pattern.compile("(?i)Info:\\s*([^.]+)"),
        Pattern.compile("(?i)(?:deposited|credited|debited|deducted|has\\s+credit)[^\\r\\n]+?for\\s+(?!inr\\b|rs\\.?)([^.\\r\\n]+)"),
        Pattern.compile("(?i)towards\\s+(.+?)(?:\\s+on\\b|\\.|$)"),
        Pattern.compile("(?i)credited.+?by\\s+(?!Rs\\.?|INR\\b)([A-Za-z0-9\\s]+?)(?:-|,|\\.|$)"),
        Pattern.compile("(?i)Your\\s+([A-Za-z0-9\\s]+?)\\s+(?:balance\\s+)?(?:has\\s+been\\s+)?(?:successfully\\s+)?(?:is\\s+)?(?:debited|credited)")
    );

    // Blacklisted keywords in dynamic merchant names
    private static final List<String> BLACKLISTED_KEYWORDS = Arrays.asList(
        "unauthorized", "report", "not you", "queries", "dispute", "fraud",
        "click here", "visit", "security", "support", "call 1800", "call support",
        "disclaimer", "confidential", "intended solely", "terms and conditions", "all rights reserved",
        "sent to the email address", "email address", "associated with your",
        "more info", "more information", "contact info", "contact information",
        "service charges", "service charge", "more details", "details", "for details",
        "customer care", "helpdesk", "for more info", "for info", "click link"
    );

    private static final Set<String> EXACT_BLACK_LIST = new HashSet<>(Arrays.asList(
        "refund", "balance", "account", "transaction", "payment", "order",
        "info", "information", "more info", "more information", "details",
        "more details", "fee", "fees", "charges", "charge", "service"
    ));

    // Dynamic Merchant Post-processing Regexes
    private static final Pattern CLEAN_AMOUNT_TRAILING_PATTERN = Pattern.compile("(?i)\\s+of\\s+(?:rs\\.?|inr|₹).*");
    private static final Pattern CLEAN_DATE_TRAILING_PATTERN = Pattern.compile("(?i)\\s+[0-9]{4}-[0-9]{2}\\b.*");
    private static final Pattern CLEAN_TXNID_TRAILING_PATTERN = Pattern.compile("(?i)\\s+[A-Z0-9]*[0-9][A-Z0-9]{4,}\\b.*");



    static {

        addKeywords("Food", 
            "swiggy", "zomato", "mcdonalds", "dominos", "kfc", "pizzahut", 
            "starbucks", "pluxee", "sodexo", "eatfit", "faasos", "behrouz", 
            "freshmenu", "ccd", "cafe coffee day",
            "sweet", "sweets", "cake", "cakes", "bakery", "baker", "bakers", "bakehouse",
            "mithai", "pastry", "pastries", "dessert", "desserts", "confectionery", "confectioners",
            "bakes", "ice cream", "icecream", "waffle", "waffles");
            
        addKeywords("Groceries", 
            "blinkit", "zepto", "bigbasket", "dmart", "reliance smart", 
            "instamart", "natures basket", "spencers", "supr daily", "supr", 
            "milkbasket", "country delight", "freshtohome", "licious", 
            "more retail", "star bazaar", "bbnow", "supermart", "supermarket", "hypermarket");

        addKeywords("Shopping", 
            "amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "croma", 
            "reliance digital", "tata cliq", "tatacliq", "lifestyle", "shoppers stop", 
            "pantaloons", "max fashion", "zudio", "reliance trends", "trends", 
            "firstcry", "decathlon", "pepperfry", "urban ladder", "ikea", "design info", "designinfo");

        addKeywords("Entertainment", 
            "netflix", "spotify", "amazon prime", "prime video", "prime music", "hotstar", "bookmyshow", "pvr", "inox", 
            "zee5", "sonyliv", "jiocinema", "youtube premium", "epic games", "epicgames", "steam");

        addKeywords("Transport", 
            "uber", "ola", "rapido", "namma metro", "delhi metro", "yulu", "bounce", 
            "vogo", "blusmart", "zoomcar", "revv", "mumbai metro", "hyderabad metro", 
            "chennai metro", "fastag", "park+", "hpcl", "bpcl", "indian oil", "shell", "delhivery");

        addKeywords("Travel", 
            "makemytrip", "indigo", "ibibo", "goibibo", "cleartrip", "yatra", 
            "redbus", "easemytrip", "ixigo", "abhibus", "spicejet", "airindia", 
            "air india", "vistara", "akasa", "agoda", "booking.com", "airbnb",
            "irctc", "irctcc", "uts");

        addKeywords("Mobile & Internet", 
            "jio", "airtel", "vi", "bsnl", "broadband", "act", "hathway", "excitel", 
            "jiofiber", "airtel xstream");

        addKeywords("Utilities", 
            "bescom", "tneb", "mahavitaran", "adania", "adanie", "tata power", 
            "torrent", "bwssb", "mtnl", "indane", "bharatgas", "igm", "mahanagar");

        addKeywords("Medical", 
            "apollo", "pharmeasy", "1mg", "netmeds", "practo", "truemeds", "medplus", 
            "srl", "lal path", "dr lal", "agilus", "thyrocare", "healthians");

        addKeywords("Selfcare", 
            "salon", "spa", "urban company", "urbanclap", "enrich", "lakme", 
            "toni&guy", "javed habib");

        addKeywords("Others", 
            "sbmbank", "sbm bank", "sbm", "nps", "enps", "protean", "proteantech", "national pension system", "nobroker", "nobroker technologies", "lic of india", "lic");
    }

    private static void addKeywords(String category, String... keywords) {
        for (String keyword : keywords) {
            KEYWORD_TO_CATEGORY.put(keyword, category);
            KEYWORD_TO_PATTERN.put(keyword, Pattern.compile("\\b" + Pattern.quote(keyword) + "\\b", Pattern.CASE_INSENSITIVE));
        }
    }

    private static String extractCleanDomain(String domain) {
        String cleanDomain = DOMAIN_TLD_PATTERN.matcher(domain).replaceAll("");
        if (cleanDomain.contains(".")) {
            cleanDomain = cleanDomain.substring(cleanDomain.lastIndexOf('.') + 1);
        }
        return cleanDomain;
    }

    /**
     * Extracts merchant name and category from notification sender and body.
     *
     * @param sender The email address or SMS sender ID.
     * @param body   The text body of the notification.
     * @return A Pair containing the extracted merchant name and category.
     */
    public static Pair<String, String> extractCategoryAndMerchant(String sender, String body) {
        String searchString = (sender + " " + body).toLowerCase();
        String masterCategory = "Others";
        String matchedMerchant = null;

        // 1. Prioritize sender domain if it matches a known merchant keyword (and is not a payment gateway)
        Pair<String, String> domainMatch = extractMerchantFromSenderDomain(sender);
        if (domainMatch != null) {
            matchedMerchant = domainMatch.first;
            masterCategory = domainMatch.second;
        }

        // 2. Search text content using pre-compiled keyword patterns
        if (matchedMerchant == null) {
            Pair<String, String> keywordMatch = findKeywordMerchant(searchString);
            if (keywordMatch != null) {
                matchedMerchant = keywordMatch.first;
                masterCategory = keywordMatch.second;
            }

            // 3. Dynamic Merchant Extraction
            String dynamicMerchant = extractDynamicMerchant(searchString);
            if (dynamicMerchant != null) {
                matchedMerchant = dynamicMerchant;
                String dynamicLower = dynamicMerchant.toLowerCase();
                boolean foundCategory = false;
                for (Map.Entry<String, Pattern> entry : getSortedKeywordEntries()) {
                    if (entry.getValue().matcher(dynamicLower).find()) {
                        masterCategory = KEYWORD_TO_CATEGORY.get(entry.getKey());
                        foundCategory = true;
                        break;
                    }
                }
                if (!foundCategory && ("Shopping".equals(masterCategory) || "Bank Transfer".equals(masterCategory))) {
                    masterCategory = "Others";
                }
            }
        }

        // 4. Fallback to clean domain if still null
        if (matchedMerchant == null && sender != null && sender.contains("@")) {
            String domain = sender.substring(sender.indexOf('@') + 1).toLowerCase();
            String cleanDomain = extractCleanDomain(domain);
            if (cleanDomain.length() > 2) {
                matchedMerchant = formatMerchantName(cleanDomain);
            }
        }

        return new Pair<>(matchedMerchant, masterCategory);
    }

    private static List<Map.Entry<String, Pattern>> sortedKeywordEntries = null;

    private static synchronized List<Map.Entry<String, Pattern>> getSortedKeywordEntries() {
        if (sortedKeywordEntries == null) {
            sortedKeywordEntries = new java.util.ArrayList<>(KEYWORD_TO_PATTERN.entrySet());
            sortedKeywordEntries.sort((a, b) -> Integer.compare(b.getKey().length(), a.getKey().length()));
        }
        return sortedKeywordEntries;
    }

    /**
     * Helper to extract merchant name and category from a sender email address.
     */
    private static Pair<String, String> extractMerchantFromSenderDomain(String sender) {
        if (sender == null || !sender.contains("@")) {
            return null;
        }
        String domain = sender.substring(sender.indexOf('@') + 1).toLowerCase();
        if (domain.contains(">")) {
            domain = domain.substring(0, domain.indexOf('>'));
        }
        if (domain.contains("incometax.gov.in")) {
            return new Pair<>("Income Tax Department", "Others");
        }
        String cleanDomain = extractCleanDomain(domain);
        if (!GATEWAY_DOMAINS.contains(cleanDomain)) {
            // Check exact domain match first
            for (Map.Entry<String, String> entry : KEYWORD_TO_CATEGORY.entrySet()) {
                String keyword = entry.getKey();
                if (cleanDomain.equals(keyword)) {
                    return new Pair<>(formatMerchantName(keyword), entry.getValue());
                }
            }
            // Fallback to substring match
            for (Map.Entry<String, String> entry : KEYWORD_TO_CATEGORY.entrySet()) {
                String keyword = entry.getKey();
                if (cleanDomain.contains(keyword)) {
                    return new Pair<>(formatMerchantName(keyword), entry.getValue());
                }
            }
        }
        return null;
    }

    /**
     * Helper to find a merchant and category match using predefined keyword patterns.
     */
    private static Pair<String, String> findKeywordMerchant(String searchString) {
        for (Map.Entry<String, Pattern> entry : getSortedKeywordEntries()) {
            String keyword = entry.getKey();
            if (entry.getValue().matcher(searchString).find()) {
                return new Pair<>(formatMerchantName(keyword), KEYWORD_TO_CATEGORY.get(keyword));
            }
        }
        return null;
    }

    /**
     * Dynamic merchant extraction using regex heuristics over notification body text.
     */
    private static String extractDynamicMerchant(String body) {
        for (Pattern pattern : DYNAMIC_MERCHANT_PATTERNS) {
            Matcher matcher = pattern.matcher(body);
            if (matcher.find() && matcher.groupCount() >= 1) {
                String extracted = Objects.requireNonNull(matcher.group(1)).trim();
                if (extracted.length() > 2) {
                    if (isBlacklistedMerchant(extracted)) {
                        continue;
                    }

                    extracted = cleanVpaHandle(extracted);
                    extracted = CLEAN_AMOUNT_TRAILING_PATTERN.matcher(extracted).replaceAll("");
                    extracted = CLEAN_DATE_TRAILING_PATTERN.matcher(extracted).replaceAll("");
                    extracted = CLEAN_TXNID_TRAILING_PATTERN.matcher(extracted).replaceAll("");

                    String lowerExtracted = extracted.toLowerCase();
                    if (!isBlacklistedMerchant(extracted) && !lowerExtracted.startsWith("call ")) {
                        return MerchantMapper.formatMerchantName(lowerExtracted);
                    }
                }
            }
        }
        return null;
    }

    /**
     * Checks if an extracted string matches any blacklisted keywords or phrases.
     */
    private static boolean isBlacklistedMerchant(String extracted) {
        if (extracted == null || extracted.trim().isEmpty()) {
            return true;
        }
        String lowerExtracted = extracted.toLowerCase();
        for (String blacklisted : BLACKLISTED_KEYWORDS) {
            if (lowerExtracted.contains(blacklisted)) {
                return true;
            }
        }

        String trimmedLower = lowerExtracted.trim();
        if (EXACT_BLACK_LIST.contains(trimmedLower) || 
            trimmedLower.startsWith("account") || trimmedLower.startsWith("a/c") || trimmedLower.startsWith("acc ") ||
            trimmedLower.startsWith("info") || trimmedLower.startsWith("more info") ||
            trimmedLower.startsWith("for info") || trimmedLower.startsWith("for more info") ||
            trimmedLower.startsWith("more details") || trimmedLower.startsWith("service charge") ||
            trimmedLower.startsWith("contact info") || trimmedLower.startsWith("contact information") ||
            trimmedLower.startsWith("call ")) {
            return true;
        }

        return false;
    }

    /**
     * Cleans VPA handle addresses (e.g. "user@bank Merchant Name" -> "Merchant Name" or "user@bank" -> "user").
     */
    private static String cleanVpaHandle(String extracted) {
        if (!extracted.contains("@")) {
            return extracted;
        }
        String[] parts = extracted.split("\\s+");
        if (parts.length > 1 && parts[0].contains("@")) {
            StringBuilder friendly = new StringBuilder();
            for (int p = 1; p < parts.length; p++) {
                friendly.append(parts[p]).append(" ");
            }
            return friendly.toString().trim();
        } else if (parts.length == 1 && parts[0].contains("@")) {
            String handle = parts[0].substring(0, parts[0].indexOf('@'));
            if (handle.contains(".")) {
                handle = handle.substring(0, handle.indexOf('.')).replaceAll("[0-9]+$", "");
            }
            if (handle.length() > 2) {
                return handle;
            }
        }
        return extracted;
    }

    /**
     * Formats a raw keyword into a canonical display name via MerchantMapper.
     */
    public static String formatMerchantName(String keyword) {
        return MerchantMapper.formatMerchantName(keyword);
    }
}
