// js/state.js

export const appState = {
  inventory: {
    items: [],
    lastArchiveTimestamp: null,
  },
  suppliers: [],
  sales: [],
  auditLog: [],
  currentUser: 'المستخدم',
  currentView: "inventory",
  dashboardPeriod: "today",
  activeFilter: "all",
  searchTerm: "",
  selectedCategory: "all",
  currentSortOption: "default",
  currentItemId: null,
  itemStateBeforeEdit: null,
  activeCurrency: "IQD",
  syncConfig: null,
  rateLimit: {
    limit: null,
    remaining: null,
    reset: null,
  },
  fileSha: null,
  salesFileSha: null,
  suppliersFileSha: null,
  auditLogFileSha: null, // ADDED
  isSyncing: false,
  selectedImageFile: null,
  imageCache: new Map(),
  modalStack: [],
  isSelectionModeActive: false,
  selectedItemIds: new Set(),
  visibleItemCount: 20,
  scrollPosition: 0,
};