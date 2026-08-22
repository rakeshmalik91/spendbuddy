export const TXN_TYPE_MAPPINGS = {
    'salary': 'Income',
    'wage': 'Income',
    'itr': 'Income',
    'refund': 'Refund',
    'cashback': 'Refund',
    'reversal': 'Refund',
    'returned': 'Refund',
    'dividend': 'Income',
    'interest': 'Income',
    'bonus': 'Income',
    'investment': 'Investment',
    'sip': 'Investment',
    'lic': 'Investment',
    'nps': 'Investment',
    'mutual': 'Investment',
    'transfer': 'Transfer',
    'sent': 'Transfer',
    'atm': 'Transfer',
    'atm withdrawal': 'Transfer',
    'cash withdrawal': 'Transfer'
};

/**
 * Gets the mapped transaction type based on category or keyword matching from TXN_TYPE_MAPPINGS.
 * @param {string} cat Category or text string
 * @returns {string|null} The mapped transaction type, or null if no mapping found.
 */
export function getTxnTypeFromMapping(cat) {
    if (!cat || typeof cat !== 'string') return null;
    const cleanCat = cat.toLowerCase();
    for (const [keyword, type] of Object.entries(TXN_TYPE_MAPPINGS)) {
        if (cleanCat.includes(keyword)) {
            return type;
        }
    }
    return null;
}
