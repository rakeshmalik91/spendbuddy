export const state = {
    expenses: [],
    trash: [],
    activityHistory: [],
    activityLoaded: false,
    categories: [],
    txnModes: [],
    scheduledTransactions: [],
    balanceData: [],
    chartInstances: {},
    sortCol: 'date',
    sortAsc: false,
    timeMode: 'month',
    previousView: 'dashboard',
    historicalLoaded: false,
    masterDataLoaded: false,
    balanceLoaded: false,
    calViewDate: new Date(),
    timeDate: new Date(),
    loadedYears: new Set(),
    app: null,
    storage: null,
    auth: null,
    modalAction: null,
    modalCleanup: null,
    rawSmsTransactions: [],
    pendingSmsTransactions: [],
    pendingScheduledTransactions: [],
    inlineEditSchedIdx: null,
    encryptionKey: null,
    encryptionEnabled: false,
    fileHashes: {},
    availableFiles: null,
    locationsConfig: [],
    trendChartCumulative: localStorage.getItem('spendbuddy_chart_cumulative') === 'true',
    trendChartType: localStorage.getItem('spendbuddy_chart_type') || 'line',
    cloudSyncInProgress: false,
    syncToastTimeout: null,
    limitDashboard: 20,
    limitTransactions: 20,
    customDateStart: null,
    customDateEnd: null,
    hideIncome: localStorage.getItem('expman_hide_income') === 'true',
    hideInvestment: localStorage.getItem('expman_hide_investment') === 'true',
    hideTransfer: localStorage.getItem('expman_hide_transfer') === 'true',
    mergeRefunds: localStorage.getItem('expman_merge_refunds') !== 'false',
    hideSourceTxnId: localStorage.getItem('expman_hide_source_txnid') === 'true',
    hideAmounts: localStorage.getItem('expman_hide_amounts') === 'true',
    keywordMappings: (() => {
        try {
            const val = localStorage.getItem('expman_keyword_mappings');
            return val ? JSON.parse(val) : [];
        } catch (_) {
            return [];
        }
    })(),
    splitBills: (() => {
        try {
            const val = localStorage.getItem('expman_split_bills');
            return val ? JSON.parse(val) : [];
        } catch (_) {
            return [];
        }
    })(),
    splitRecentPeople: (() => {
        try {
            const val = localStorage.getItem('expman_split_recent_people');
            return val ? JSON.parse(val) : [];
        } catch (_) {
            return [];
        }
    })(),
    splitBillsLoaded: false
};
