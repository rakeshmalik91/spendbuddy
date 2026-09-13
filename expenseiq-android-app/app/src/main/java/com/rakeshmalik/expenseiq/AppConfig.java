package com.rakeshmalik.expenseiq;

import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

public class AppConfig {

    public static final String WEB_HOST = "expense-manager-iq.netlify.app";
    public static final String WEB_URL = "http://" + WEB_HOST;
    // public static final String LOCAL_WEB_URL = "http://192.168.1.10:8080";
    public static final String LOCAL_WEB_URL = "http://192.168.29.83:8080";

    // Set to true to wipe all cached transactions on the next app startup. Set back
    // to false after use.
    public static final boolean WIPE_CACHE_ON_STARTUP = false;

    public static final Pattern AMOUNT_REGEX = Pattern
            .compile("(?i)(?:rs\\.?|inr|₹|amt\\.?)\\s*([0-9,]+(?:\\.[0-9]{1,2})?)");
    public static final Pattern REF_REGEX = Pattern.compile(
            "(?i)\\b(?:reference|ref|txn|upi\\s*ref|urn|utr|upi)\\b\\.?\\s*(?:no\\.?|number|id)?\\s*(?:is\\s+)?[:\\-]?\\s*([a-zA-Z0-9]*[0-9]{6,}[a-zA-Z0-9]*)(?![a-zA-Z0-9@]|\\.[a-zA-Z0-9])");
    public static final Pattern AMAZON_ORDER_RAW_REGEX = Pattern.compile("\\b([0-9]{3}-[0-9]{7}-[0-9]{7})\\b");

    public static final List<String> COMMON_SENDER_KEYWORDS = Arrays.asList(
            // Banks & Cards
            "hdfc", "icici", "sbi", "dcb", "sbm", "axis", "kotak", "pnb", "pnbsms", "boi", "yesbank", "yesbk", "idfc",
            "idfcfb", "indus", "indusind", "canbnk", "union", "fedbnk", "niyo", "sbicrd", "bobsms",
            "citi", "citibk", "hsbc", "stanc", "scb", "rbl", "rblbnk", "idbi", "ioba", "canara", "cbi", "centralbank",
            "corpbnk", "indianbank", "iob", "syndicate", "uco", "bob", "baroda", "vijaya", "allahabad", "bandhan",
            "aubank", "equitas", "ujjivan", "csb", "federal", "kvb", "karurvysya", "southindianbank", "sib",
            "cityunion", "cub", "dhanbank", "jkb", "karnatakabank", "ktkbnk", "saraswat", "shamrao", "mahabank", "bom",

            // Wallets & Payments
            "paytm", "phonepe", "phonep", "gpay", "googlepay", "gipay", "cred", "mobikwik", "mobikw", "freecharge",
            "freech",
            "payu", "razorpay", "razorp", "cashfree", "cashfr", "simpl", "lazypay", "lazyp", "juspay", "apay",
            "proteantech", "billdesk", "billd",
            "amazonpay", "bharatpe", "bhim", "pine", "pinelabs", "payzapp", "zeta", "sodexo", "epfo", "epf", "ccavenue",
            "payg", "paynear", "mobi", "oxigen", "itzcash", "citrus", "twid", "fi", "jupiter",

            // Food, Groceries & Delivery
            "swiggy", "zomato", "blinkit", "blnkit", "zepto", "dunzo", "bigbasket", "bigbkt", "kfc", "dominos",
            "pizzahut", "mcdonalds",
            "eatfit", "faasos", "behrouz", "starbucks", "ccd", "cafecoffeeday", "naturebasket", "spencers", "more",
            "freshtohome", "licious", "supr", "milkbasket", "countrydelight", "bbnow", "instamart",

            // E-commerce & Retail
            "amazon", "flipkart", "flipkt", "myntra", "ajio", "meesho", "nykaa",
            "tatacliq", "croma", "reliancedigital", "reliance", "jmart", "jiomart", "decathlon", "firstcry",
            "urbancompany", "urbanclap", "lifestyl", "shoppers", "shoppersstop", "pantaloons", "max", "zudio", "dmart",
            "bigbazaar", "smart", "trends", "pepperfry", "urbanladder", "ikea", "bookmyshow", "bms", "inox", "pvr",
            "epicgames", "steam", "designinfo",

            // Travel, Cabs & Transport
            "uber", "ola", "rapido", "goibibo", "ibibo", "makemytrip", "makemt", "mmt", "irctc", "cleartrip", "yatra",
            "redbus",
            "namma", "yulu", "vogo", "bounce", "zoomcar", "revv", "easemytrip", "ixigo", "irctcc", "uts", "abhibus",
            "indigo", "spicejet", "airindia", "vistara", "akasa", "delhivery",

            // Telecom & Utility
            "airtel", "jio", "vi", "bsnl", "pluxee", "lici", "lic", "licindia",
            "bescom", "mahavitaran", "torrent", "adania", "adanie", "tatapower", "bwssb", "mtnl", "act", "hathway",
            "excitel", "jiofiber", "airtelxstream", "indane", "hpcl", "bpcl", "bharatgas", "igm", "mahanagar");

    public static final List<String> TRANSACTION_KEYWORDS = Arrays.asList(
            // General Banking & UPI
            "transaction", "txn", "alert", "upi", "contribution", "update",

            // Money Out (Debits)
            "debit", "debited", "deduct", "deducted", "deduction", "withdraw", "withdrawn", "withdrawal",
            "spend", "spent", "spending", "charge", "charged", "charging",

            // Money In (Credits)
            "credit", "credited", "receive", "received", "receiving", "deposit", "deposited", "depositing",
            "refund", "refunded", "refunding",

            // Transfers & Payments
            "pay", "paid", "paying", "payment", "transfer", "transferred", "transferring",
            "remit", "remitted", "remittance",

            // E-commerce, Bills & Services
            "order", "ordered", "ordering", "invoice", "invoiced", "receipt",
            "purchase", "purchased", "purchasing", "bill", "billed", "billing",
            "recharge", "recharged", "recharging", "book", "booked", "booking",
            "trip", "trips", "ride", "rides",

            // Status & Alerts
            "success", "successful", "successfully", "decline", "declined", "fail", "failed", "approved", "alert",
            "alerts");

    // Keywords to filter out promotional / spam messages
    public static final List<String> PROMO_KEYWORDS = Arrays.asList(
            "offer", "offers", "discount", "discounts", "sale", "promo", "promotional",
            "deal", "deals", "win", "won", "free", "reasons to", "act now", "don't miss", "off!", "exclusive", "save",
            "savings",
            "credit score", "credit report", "credit health", "credit habits", "cibil", "pocket friendly",
            "cover every", "cover your", "secure your", "travel insurance", "insurance cover", "every risk");

    public static final List<String> CREDIT_KEYWORDS = Arrays.asList(
            "credited", "received", "added to wallet", "money added", "amount added", "refund", "refunded", "deposit",
            "deposited");

    // Keywords that specifically indicate income (salary, NEFT credits, etc.)
    public static final List<String> INCOME_KEYWORDS = Arrays.asList(
            "salary", "neft cr", "neft received", "imps cr", "rtgs cr", "deposited",
            "credited to", "credited for", "credit alert");

    // Keywords that specifically indicate a refund — takes priority over income
    // keywords
    public static final List<String> REFUND_KEYWORDS = Arrays.asList(
            "refund", "refunded", "reversal", "reversed", "cashback credited", "cashback received");

    // Keywords indicating reminders, bill due, or upcoming payments (NOT completed
    // transactions)
    public static final List<String> REMINDER_KEYWORDS = Arrays.asList(
            "reminder", "payment reminder", "bill reminder", "due reminder",
            "is due", "due on", "due date", "overdue", "upcoming bill", "upcoming payment",
            "will be debited on", "amount due", "total due", "payable bill", "pay before",
            "mandate", "debit mandate", "nach mandate", "e-mandate", "emandate", "standing instruction", "autopay",

            // Telecom recharge prompts & plan expiration reminders (English)
            "plan validity", "validity expiring", "validity will expire", "validity has expired", "plan will expire",
            "plan is expiring",
            "pack will expire", "pack is expiring", "pack has expired", "plan has expired", "plan expired",
            "pack expiring",
            "expiring soon", "expires soon", "expire soon",
            "recharge now", "recharge with", "recharge of", "to recharge", "recharge your", "recharge for",
            "recharge to get", "recharge today",
            "terms & conditions apply", "terms and conditions apply", "t&c apply",

            // Regional - Bengali (Jio / Airtel / Vi)
            "মেয়াদ শীঘ্রই শেষ", "মেয়াদ শেষ", "প্ল্যানটির মেয়াদ", "প্ল্যানের মেয়াদ",
            "রিচার্জ করুন", "টাকার রিচার্জ", "রিচার্জের জন্য", "শর্তাবলী প্রযোজ্য",

            // Regional - Hindi
            "रिचार्ज करें", "वैधता समाप्त", "वैधता खत्म", "प्लान समाप्त",
            "नियम व शर्तें लागू", "नियम व शर्ते लागू");

    // Regex patterns to detect promotional/cashback offer amount limits (e.g. "upto
    // ₹50", "cashback upto ₹50", "flat ₹50 off")
    public static final Pattern PROMO_AMOUNT_PREFIX = Pattern.compile(
            "(?i)\\b(?:upto|up\\s+to|cashback\\s+(?:of|upto|up\\s+to)?|save\\s+(?:upto|up\\s+to)?|discount\\s+(?:of|upto|up\\s+to)?|flat|earn|get|win|won)\\s*(?:rs\\.?|inr|₹|amt\\.?|\\$)?\\s*$");
    public static final Pattern PROMO_AMOUNT_SUFFIX = Pattern
            .compile("(?i)^\\s*(?:cashback|off|discount|vouchers?|rewards?|saved|save|savings)\\b");

    public static class Sms {
        public static final int MAX_DAYS_TO_FETCH = 7;
        public static final int MAX_MESSAGES_TO_FETCH = 500;
        public static final List<String> SENDER_KEYWORDS = COMMON_SENDER_KEYWORDS;
        public static final double MIN_AMOUNT_TO_LOG = 25.0;
    }

    public static class Email {
        public static final int MAX_DAYS_TO_FETCH = 7;
        public static final int MAX_MESSAGES_TO_FETCH = 10000;
        public static final int SYNC_BATCH_SIZE = 100;
        public static final int MAX_EMAIL_SIZE_BYTES = 500 * 1024; // 500 KB limit to avoid downloading huge
                                                                   // emails/attachments
        public static final List<String> SENDER_KEYWORDS = COMMON_SENDER_KEYWORDS;
        public static final List<String> SUBJECT_KEYWORDS = TRANSACTION_KEYWORDS;
        public static final double MIN_AMOUNT_TO_LOG = 25.0;
    }
}
