import { state } from "../core/state.js";
import { KEYWORD_MAPPINGS, TXN_TYPE_MAPPINGS } from "./category_mappings.js";

/* ══════════════ CATEGORY / MERCHANT HELPERS ══════════════ */

/**
 * Normalises a merchant/person name by lowercasing and stripping common
 * honorific prefixes/suffixes (Mr, Mrs, Dr, Shri, etc.) for consistent matching.
 */
function cleanMerchantName(name) {
    if (!name) return '';
    return name.trim().toLowerCase()
        .replace(/^(mr|mrs|ms|dr|prof|shri|smt|sir)\.?\s+/gi, '')
        .replace(/\s+(mr|mrs|ms|dr|prof|shri|smt|sir)\.?$/gi, '')
        .trim();
}

/**
 * Finds a matching custom keyword mapping rule from user settings/state.
 * Supports comma-separated aliases (e.g. 'NPS, Protean') and prioritizes
 * longer (more specific) matching keyword tokens first.
 * @param {string} text - The input text to search (note, merchant, source, etc.)
 * @param {Array} [customRulesList] - Optional rules list to search (defaults to state.keywordMappings)
 */
export function findMatchingKeywordRule(text, customRulesList) {
    const rules = customRulesList || state.keywordMappings;
    if (!text || !rules || !Array.isArray(rules) || rules.length === 0) {
        return null;
    }
    const cleanText = text.trim().toLowerCase();
    if (!cleanText) return null;

    let bestRule = null;
    let maxMatchLength = 0;

    for (const rule of rules) {
        if (!rule || !rule.keyword) continue;
        const tokens = rule.keyword.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        for (const token of tokens) {
            if (cleanText.includes(token)) {
                if (token.length > maxMatchLength) {
                    maxMatchLength = token.length;
                    bestRule = rule;
                }
            }
        }
    }

    return bestRule;
}

/**
 * Maps a merchant name to the best matching user category using:
 * 0. User's manual custom keyword mappings (HIGHEST priority - overrides all defaults)
 * 1. Historical transaction frequency for the same merchant (strongest heuristic signal)
 * 2. Keyword-to-synonym mapping from KEYWORD_MAPPINGS
 * 3. Fuzzy match of Android-parsed masterCategory against user categories
 */
export function getCategoryForMerchant(merchantName, masterCategory, extraText) {
    let fallbackCategory = state.categories.find(c => c.toLowerCase().includes('other')) || 'Others';

    // 0. Highest priority: User's manual custom keyword mapping
    const customRule = findMatchingKeywordRule(merchantName)
        || (masterCategory ? findMatchingKeywordRule(masterCategory) : null)
        || (extraText ? findMatchingKeywordRule(extraText) : null);
    if (customRule && customRule.category) {
        const catMatch = resolveCategoryName(customRule.category, state.categories);
        if (catMatch) return catMatch;
    }

    // 1. First attempt: Learn from historical transactions with the same merchant name (STRONGEST signal)
    if (merchantName) {
        const cleanMerchant = cleanMerchantName(merchantName);

        if (cleanMerchant) {
            const categoryCounts = {};
            let maxCount = 0;
            let bestCategory = null;

            // Iterate through all historical transactions to count category occurrences for this merchant
            for (const e of state.expenses) {
                if (e.note) {
                    const cleanNote = cleanMerchantName(e.note);

                    if (cleanNote === cleanMerchant && e.category) {
                        categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
                        // Keep track of the category with the highest frequency of occurrences
                        if (categoryCounts[e.category] > maxCount) {
                            maxCount = categoryCounts[e.category];
                            bestCategory = e.category;
                        }
                    }
                }
            }

            // Return the most frequently used category for this merchant if found
            if (bestCategory) {
                return bestCategory;
            }
        }
    }

    // 2. Second attempt: Common keyword mapping for dynamic categories
    let bestMatch = fallbackCategory;
    if (merchantName) {
        const cleanMerchant = cleanMerchantName(merchantName);
        let targetSynonyms = null;
        for (const mapping of KEYWORD_MAPPINGS) {
            if (mapping.keywords.some(keyword => cleanMerchant.includes(keyword))) {
                targetSynonyms = mapping.synonyms;
                break;
            }
        }

        if (targetSynonyms) {
            const match = state.categories.find(c => {
                const cClean = c.toLowerCase().replace(/[^a-z0-9]/g, '');
                return cClean && targetSynonyms.some(synonym =>
                    synonym.includes(cClean) || cClean.includes(synonym)
                );
            });
            if (match) {
                bestMatch = match;
            }
        }
    }

    // 3. Third attempt: Try to fuzzy-match the Android-parsed masterCategory with user categories
    if (bestMatch === fallbackCategory && masterCategory) {
        const smsCat = masterCategory.toLowerCase();
        const match = state.categories.find(c => {
            const cClean = c.toLowerCase().replace(/[^a-z0-9]/g, '');
            return cClean && (smsCat.includes(cClean) || cClean.includes(smsCat));
        });
        if (match) {
            bestMatch = match;
        }
    }

    return bestMatch;
}

export function getTxnTypeForMerchant(merchantName, defaultTxnType, extraText) {
    // 0. Highest priority: User's manual custom keyword mapping
    const customRule = findMatchingKeywordRule(merchantName) || (extraText ? findMatchingKeywordRule(extraText) : null);
    if (customRule && customRule.txnType) {
        return normalizeTxnType(customRule.txnType);
    }

    const textToMatch = merchantName || extraText;
    if (textToMatch) {
        const cleanMerchant = cleanMerchantName(textToMatch);

        if (cleanMerchant) {
            const typeCounts = {};
            let maxCount = 0;
            let bestType = null;

            for (const e of state.expenses) {
                if (e.note) {
                    const cleanNote = cleanMerchantName(e.note);

                    if (cleanNote === cleanMerchant && e.txnType) {
                        typeCounts[e.txnType] = (typeCounts[e.txnType] || 0) + 1;
                        if (typeCounts[e.txnType] > maxCount) {
                            maxCount = typeCounts[e.txnType];
                            bestType = e.txnType;
                        }
                    }
                }
            }

            if (bestType) {
                return bestType;
            }

            for (const [keyword, type] of Object.entries(TXN_TYPE_MAPPINGS)) {
                if (cleanMerchant.includes(keyword)) {
                    return type;
                }
            }
        }
    }
    return defaultTxnType;
}

// Strips leading emoji prefixes, symbols, and whitespace (e.g. "🍜 Food" → "Food", "🏦 Bank Transfer" → "Bank Transfer")
export function stripEmojiPrefix(name) {
    if (!name) return '';
    return name
        .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\uFE0F\u200D\s]+/u, '')
        .trim();
}

/**
 * Normalizes a transaction type to standard casing (Income, Expense, Investment, Transfer, Refund).
 */
export function normalizeTxnType(rawType) {
    if (!rawType) return null;
    const clean = rawType.trim().toLowerCase();
    const valid = ['Income', 'Expense', 'Investment', 'Transfer', 'Refund'];
    const match = valid.find(v => v.toLowerCase() === clean);
    return match || rawType.trim();
}

/**
 * Resolves a normalized category name to its current state.categories counterpart (with emoji if present).
 */
export function resolveCategoryName(rawCat, categories) {
    if (!rawCat) return null;
    const cats = categories || state.categories || [];
    const clean = stripEmojiPrefix(rawCat).toLowerCase();
    const match = cats.find(c => stripEmojiPrefix(c).toLowerCase() === clean || c.toLowerCase() === rawCat.toLowerCase());
    return match || stripEmojiPrefix(rawCat);
}

/**
 * Resolves a normalized txn mode name to its current state.txnModes counterpart (with emoji if present).
 */
export function resolveTxnModeName(rawMode, txnModes) {
    if (!rawMode) return null;
    const modes = txnModes || state.txnModes || [];
    const clean = stripEmojiPrefix(rawMode).toLowerCase();
    const match = modes.find(m => stripEmojiPrefix(m).toLowerCase() === clean || m.toLowerCase() === rawMode.toLowerCase());
    return match || stripEmojiPrefix(rawMode);
}

/**
 * Maps a merchant or raw txn mode to the matching txn mode, checking custom keyword mappings first.
 */
export function getTxnModeForMerchant(merchantName, rawMode, txnModes, extraText) {
    const modes = txnModes || state.txnModes || [];
    // 0. Highest priority: User's manual custom keyword mapping matching merchantName, rawMode, or extraText
    const customRule = findMatchingKeywordRule(merchantName)
        || (rawMode ? findMatchingKeywordRule(rawMode) : null)
        || (extraText ? findMatchingKeywordRule(extraText) : null);
    if (customRule && customRule.txnMode) {
        return resolveTxnModeName(customRule.txnMode, modes);
    }
    return mapTxnMode(rawMode, modes);
}

// Maps a raw txn mode (from SMS or old data) to the closest matching current txn mode (ignoring emojis)
export function mapTxnMode(rawMode, txnModes) {
    if (!rawMode) return txnModes[0] || 'UPI';

    // Check custom keyword mappings for rawMode override
    const customRule = findMatchingKeywordRule(rawMode);
    if (customRule && customRule.txnMode) {
        return resolveTxnModeName(customRule.txnMode, txnModes);
    }

    const cleanMode = stripEmojiPrefix(rawMode).toLowerCase();

    for (const tm of txnModes) {
        if (stripEmojiPrefix(tm).toLowerCase() === cleanMode) return tm;
    }

    // Apay Wallet / Wallet aliases
    if ((cleanMode.includes('wallet') && !cleanMode.includes('meal')) || cleanMode.includes('apay') || cleanMode.includes('amazon pay balance')) {
        const walletMode = txnModes.find(tm => stripEmojiPrefix(tm).toLowerCase() === 'wallet');
        if (walletMode) return walletMode;
    }

    for (const tm of txnModes) {
        if (stripEmojiPrefix(tm).toLowerCase().includes(cleanMode)) return tm;
    }
    return txnModes[0] || 'UPI';
}
