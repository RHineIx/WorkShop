// js/state.js

/**
 * The central state of the application.
 * We export it so other modules can import and use it.
 */
export const appState = {
    inventory: [],
    activeFilter: 'all',
    searchTerm: '',
    currentItemId: null,
    syncConfig: null,
    fileSha: null,
    isSyncing: false,
    selectedImageFile: null,
    imageCache: new Map(),
};