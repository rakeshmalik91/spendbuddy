// Firebase configuration is loaded from a separate credentials file encrypted with git-crypt
export { FIREBASE_CONFIG } from './firebase-credentials.js';

export const USE_LOCAL_DATA = false;

// Fallback email used for Firebase Storage paths when auth state hasn't resolved yet
export const FALLBACK_EMAIL = 'rakeshmalik91@gmail.com';

// Session validity time in minutes. Set to 0 to disable session expiration.
export const SESSION_VALIDITY_MINUTES = 0;

// Threshold for amount matching during SMS deduplication
export const SMS_DEDUPLICATION_THRESHOLD = 1;

// Maximum date window (in calendar days) for cross-source SMS/Email transaction deduplication & merging
export const SMS_DEDUPLICATION_WINDOW_DAYS = 3;

// Set to true to show all scanned SMS regardless of last accepted/rejected date
export const IGNORE_LAST_SMS_DATE = false;

// Background CSV refresh interval in milliseconds (default: 5 minutes)
export const BACKGROUND_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const SUPPORTED_CURRENCIES = [
    { code: "INR", symbol: "₹", label: "INR ₹" }
];
export const DEFAULT_CURRENCY = "INR";

export const DEFAULT_CATEGORIES = [
    '🍜 Food',
    '🍌 Groceries',
    '🏠 Rent',
    '🎁 Shopping',
    '✈️ Travel',
    '🎬 Entertainment',
    '🚕 Transport',
    '💡 Bills & Utilities',
    '💊 Medical',
    '❓ Others'
];

export const DEFAULT_TXN_MODES = [
    '📱 UPI', '🏦 Bank Transfer', '💳 Card', '💵 Cash', '👛 Wallet'
];

export const DEFAULT_TXN_TYPES = [
    'Expense', 'Refund', 'Income', 'Investment', 'Transfer'
];

// Items that cannot be renamed or deleted by the user.
// Category matching strips leading emoji+space (e.g. "🍜 Food" → "Food") before comparison.
export const PROTECTED_CATEGORIES = ['Food', 'Groceries', 'Shopping', 'Rent', 'Travel', 'Others'];
export const PROTECTED_TXN_MODES = ['UPI', 'Bank Transfer', 'Card', 'Cash', 'Wallet'];
export const PROTECTED_TXN_TYPES = ['Expense', 'Refund', 'Income', 'Investment', 'Transfer'];

// System-generated transaction ID prefixes
export const SYSTEM_TXN_PREFIX_TXN = '__TXN_';
export const SYSTEM_TXN_PREFIX_SCHEDULER = '__SCHEDULER_';
export const SYSTEM_TXN_PREFIX_QUICKADD = '__QUICKADD_';

export const SYSTEM_TXN_ID_PREFIXES = [
    SYSTEM_TXN_PREFIX_TXN,
    SYSTEM_TXN_PREFIX_SCHEDULER,
    SYSTEM_TXN_PREFIX_QUICKADD
];

// System transaction sources
export const TXN_SOURCE_SCHEDULE = 'Schedule';
export const TXN_SOURCE_QUICK_ADD = 'Quick Add';
export const SYSTEM_TXN_SOURCES = [TXN_SOURCE_SCHEDULE, TXN_SOURCE_QUICK_ADD];

// Transaction source prefixes
export const TXN_SOURCE_SMS_PREFIX = 'SMS:';
export const TXN_SOURCE_EMAIL_PREFIX = 'Email:';

// Google Drive Backup Configuration
// Client ID for Google Identity Services (GIS). If not provided, user can configure their own or use default.
export const GOOGLE_DRIVE_CLIENT_ID = '596670983606-f368a0b6043d3895236517.apps.googleusercontent.com';
export const GOOGLE_DRIVE_BACKUP_FOLDER = 'SpendBuddy Backups';
export const GOOGLE_DRIVE_BACKUP_PREFIX = 'SpendBuddy_Backup_';

