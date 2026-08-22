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
 * Maps a merchant name to the best matching user category using:
 * 1. Historical transaction frequency for the same merchant (strongest signal)
 * 2. Keyword-to-synonym mapping from KEYWORD_MAPPINGS
 * 3. Fuzzy match of Android-parsed masterCategory against user categories
 */
export function getCategoryForMerchant(merchantName, masterCategory) {
    let fallbackCategory = state.categories.find(c => c.toLowerCase().includes('other')) || 'Others';

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

export function getTxnTypeForMerchant(merchantName, defaultTxnType) {
    if (merchantName) {
        const cleanMerchant = cleanMerchantName(merchantName);

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

// Strips a leading emoji+space prefix (e.g. "🍜 Food" → "Food") for matching.
export function stripEmojiPrefix(name) {
    if (!name) return '';
    return name.replace(/^\p{Emoji_Presentation}\uFE0F?\s*/u, '').replace(/^\p{Emoji}\uFE0F?\s*/u, '').trim();
}

// Maps a raw txn mode (from SMS or old data) to the closest matching current txn mode (ignoring emojis)
export function mapTxnMode(rawMode, txnModes) {
    if (!rawMode) return txnModes[0] || 'UPI';
    const cleanMode = stripEmojiPrefix(rawMode).toLowerCase();

    for (const tm of txnModes) {
        if (stripEmojiPrefix(tm).toLowerCase() === cleanMode) return tm;
    }
    for (const tm of txnModes) {
        if (stripEmojiPrefix(tm).toLowerCase().includes(cleanMode)) return tm;
    }
    return txnModes[0] || 'UPI';
}
