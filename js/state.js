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
    lastArchiveTimestamp: null,
  },

  /** @type {Array<Object>} A list to store supplier records.
   */
  suppliers: [],

  /** @type {'inventory' | 'dashboard'} The currently active view.
   */
  currentView: "inventory",

  /** @type {'today' | 'week' | 'month'} The time period for the dashboard.
   */
  dashboardPeriod: "today",

  /** @type {Array<Object>} A list to store sales records.
   */
  sales: [],

  /** @type {'all' | 'low_stock'} The currently active filter for the inventory grid.
   */
  activeFilter: "all",

  /** @type {string} The current search term entered by the user.
   */
  searchTerm: "",

  /** @type {string} The currently selected category for filtering. 'all' means no filter.
   */
  selectedCategory: "all",

  /** @type {string} The currently selected sort option.
   */
  currentSortOption: "default",

  /** @type {string|null} The ID of the item currently being viewed in the details modal.
   */
  currentItemId: null,

  /** @type {Object|null} The state of the item when the details modal was opened, for change detection.
   */
  itemStateBeforeEdit: null,

  /** @type {'IQD' | 'USD'} The currently selected currency for display.
   */
  activeCurrency: "IQD",

  /** @type {Object|null} Configuration for GitHub sync { username, repo, pat }.
   */
  syncConfig: null,

  /** @type {Object|null} Information about the GitHub API rate limit.
   */
  rateLimit: {
    limit: null,
    remaining: null,
    reset: null, // Timestamp for when the limit resets
  },

  /** @type {string|null} The SHA hash of the inventory.json file, required for updates.
   */
  fileSha: null,

  /** @type {string|null} The SHA hash of the new sales.json file.
   */
  salesFileSha: null,

  /** @type {string|null} The SHA hash of the new suppliers.json file.
   */
  suppliersFileSha: null,

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

  /** @type {boolean} A flag to indicate if the app is in multi-select mode.
   */
  isSelectionModeActive: false,

  /** @type {Set<string>} A set to store the IDs of the selected items.
   */
  selectedItemIds: new Set(),

  /** @type {number} The number of items currently rendered in the inventory grid.
   */
  visibleItemCount: 20,

  /** @type {number} The scroll position of the page before a modal is opened.
   */
  scrollPosition: 0,
};
