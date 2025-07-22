// js/state.js

/**
 * The central state of the application.
 * All dynamic data that the application needs to function is stored here.
 * We export it so other modules can import and use it as the single source of truth.
 */
export const appState = {
    /** @type {Array<Object>} The main list of all inventory items. */
    inventory: [],

    /** @type {'all' | 'low_stock'} The currently active filter for the inventory grid. */
    activeFilter: 'all',

    /** @type {string} The current search term entered by the user. */
    searchTerm: '',

    /** @type {string|null} The ID of the item currently being viewed in the details modal. */
    currentItemId: null,

    /** @type {Object|null} Configuration for GitHub sync { username, repo, pat }. */
    syncConfig: null,

    /** @type {string|null} The SHA hash of the inventory.json file, required for updates. */
    fileSha: null,

    /** @type {boolean} A flag to prevent multiple concurrent sync operations. */
    isSyncing: false,

    /** @type {File|null} The image file selected by the user for upload. */
    selectedImageFile: null,

    /** @type {Map<string, string>} A cache for blob URLs of fetched images to avoid re-fetching. */
    imageCache: new Map(),
};