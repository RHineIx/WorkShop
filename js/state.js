// js/state.js

/**
 * The central state of the application.
 * All dynamic data that the application needs to function is stored here.
 * We export it so other modules can import and use it as the single source of truth.
 */
export const appState = {
    /** @type {{items: Array<Object>, lastArchiveTimestamp: string|null}} */
    inventory: {
        items: [],
        lastArchiveTimestamp: null
    },

    /** @type {Array<Object>} A list to store supplier records.
    */
    suppliers: [],

    /** @type {Array<Object>} The database for the remote code finder feature.
    */
    remoteFinderDB: [],

    /** @type {'inventory' | 'dashboard' | 'remote_finder'} The currently active view.
    */
    currentView: 'inventory',
    
    /** @type {string|null} The selected brand in the remote finder.
    null means 'All'. */
    selectedBrand: null,

    /** @type {'today' | 'week' |
    'month'} The time period for the dashboard. */
    dashboardPeriod: 'today',

    /** @type {Array<Object>} A list to store sales records.
    */
    sales: [],

    /** @type {'all' |
    'low_stock'} The currently active filter for the inventory grid. */
    activeFilter: 'all',

    /** @type {string} The current search term entered by the user.
    */
    searchTerm: '',

    /** @type {string} The currently selected category for filtering.
    'all' means no filter. */
    selectedCategory: 'all',

    /** @type {string|null} The ID of the item currently being viewed in the details modal.
    */
    currentItemId: null,

    /** @type {Object|null} The state of the item when the details modal was opened, for change detection.
    */
    itemStateBeforeEdit: null,
    
    /** @type {'IQD' |
    'USD'} The currently selected currency for display. */
    activeCurrency: 'IQD',

    /** @type {Object|null} Configuration for GitHub sync { username, repo, pat }.
    */
    syncConfig: null,

    /** @type {string|null} The SHA hash of the inventory.json file, required for updates.
    */
    fileSha: null,

    /** @type {string|null} The SHA hash of the new sales.json file.
    */
    salesFileSha: null,

    /** @type {string|null} The SHA hash of the new suppliers.json file.
    */
    suppliersFileSha: null,
    
    /** @type {string|null} The SHA hash for the remote_finder_db.json file.
    */
    remoteFinderDBFileSha: null,

    /** @type {boolean} A flag to prevent multiple concurrent sync operations.
    */
    isSyncing: false,

    /** @type {File|null} The image file selected by the user for upload.
    */
    selectedImageFile: null,

    /** @type {Map<string, string>} A cache for blob URLs of fetched images to avoid re-fetching.
    */
    imageCache: new Map(),

    /** @type {Array<HTMLDialogElement>} A stack to keep track of open modals.
    */
    modalStack: [],
};