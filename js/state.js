// js/state.js

/**
 * The central state of the application.
 * All dynamic data that the application needs to function is stored here.
 * We export it so other modules can import and use it as the single source of truth.
 */
export const appState = {
    /** * @type {{items: Array<Object>, lastArchiveTimestamp: string|null}} 
     * The main inventory data, now an object containing the items array 
     * and metadata like the last archive timestamp.
     */
    inventory: {
        items: [],
        lastArchiveTimestamp: null
    },

    /** @type {'inventory' | 'dashboard'} The currently active view. */
    currentView: 'inventory',

    /** @type {'today' | 'week' | 'month'} The time period for the dashboard. */
    dashboardPeriod: 'today',

    /** @type {Array<Object>} A new list to store sales records. */
    sales: [],

    /** @type {'all' | 'low_stock'} The currently active filter for the inventory grid. */
    activeFilter: 'all',

    /** @type {string} The current search term entered by the user. */
    searchTerm: '',

    /** @type {string} The currently selected category for filtering. 'all' means no filter. */
    selectedCategory: 'all',

    /** @type {string|null} The ID of the item currently being viewed in the details modal. */
    currentItemId: null,
    
    /** @type {'IQD' | 'USD'} The currently selected currency for display. */
    activeCurrency: 'IQD',

    /** @type {Object|null} Configuration for GitHub sync { username, repo, pat }. */
    syncConfig: null,

    /** @type {string|null} The SHA hash of the inventory.json file, required for updates. */
    fileSha: null,

    /** @type {string|null} The SHA hash of the new sales.json file. */
    salesFileSha: null,

    /** @type {boolean} A flag to prevent multiple concurrent sync operations. */
    isSyncing: false,

    /** @type {File|null} The image file selected by the user for upload. */
    selectedImageFile: null,

    /** @type {Map<string, string>} A cache for blob URLs of fetched images to avoid re-fetching. */
    imageCache: new Map(),
};
