import { TXN_TYPE_MAPPINGS } from './txn_mode_mapping.js';

export { TXN_TYPE_MAPPINGS };

export const KEYWORD_MAPPINGS = [
    {
        keywords: ['swiggy', 'zomato', 'lunch', 'dinner', 'breakfast', 'restaurant', 'cafe'],
        synonyms: ['food', 'dining', 'restaurant', 'meal', 'cafe', 'coffee']
    },
    {
        keywords: ['cab', 'bus', 'auto', 'uber', 'ola', 'rapido', 'flight', 'train', 'irctc'],
        synonyms: ['travel', 'transport', 'cab', 'taxi', 'ride', 'bike', 'flight', 'air', 'train', 'irctc', 'rail']
    },
    {
        keywords: ['amazon', 'flipkart', 'myntra', 'ajio'],
        synonyms: ['shopping', 'online', 'ecommerce', 'clothes']
    },
    {
        keywords: ['netflix', 'spotify', 'movie'],
        synonyms: ['entertainment', 'subscription', 'movie', 'ott', 'music', 'cinema', 'theater']
    },
    {
        keywords: ['blinkit', 'zepto', 'instamart', 'milk', 'bbnow', 'bigbasket', 'dmart'],
        synonyms: ['groceries', 'grocery', 'supermarket', 'daily', 'dairy']
    },
    {
        keywords: ['hospital', 'pharmacy', 'clinic', 'doctor', 'medicine', 'apollo'],
        synonyms: ['medical', 'health', 'hospital', 'clinic', 'pharmacy', 'medicine', 'doctor']
    },
    {
        keywords: ['jio', 'airtel', 'vi', 'electricity', 'water', 'gas', 'broadband', 'wifi', 'recharge'],
        synonyms: ['bills', 'mobile', 'internet', 'recharge', 'telecom', 'phone', 'electricity', 'power', 'utility', 'water', 'gas', 'wifi', 'broadband', 'network', 'topup']
    },
    {
        keywords: ['repair', 'service', 'maintenance'],
        synonyms: ['upkeep', 'maintenance', 'repair', 'service', 'fix']
    }
];

