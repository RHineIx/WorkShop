// js/navigation.js
import { appState } from "./state.js";
import { toggleView } from "./ui.js";
import { exitSelectionMode } from "./handlers/bulkActionHandlers.js";

/**
 * Handles the logic for the browser's back button press.
 * It checks the app's state in a specific order and performs the appropriate action.
 */
function handleBackButton() {
  // 1. If a modal is open, close the topmost one.
  if (appState.modalStack.length > 0) {
    const topModal = appState.modalStack[appState.modalStack.length - 1];
    topModal.close();
    return;
  }

  // 2. If in bulk selection mode, exit the mode.
  if (appState.isSelectionModeActive) {
    exitSelectionMode();
    return;
  }

  // 3. If on a view other than the main inventory view, navigate back to it.
  if (appState.currentView !== "inventory") {
    toggleView("inventory");
    return;
  }
}

/**
 * Adds a "dummy" state to the browser's history.
 * This allows us to intercept the next `popstate` event (back button press).
 */
export function pushState() {
  history.pushState({ intercepted: true }, "");
}

/**
 * Initializes the back button listener.
 * It listens for the `popstate` event and triggers our custom handler.
 */
export function initNavigationListener() {
  // Add an initial state to handle the very first back press if needed.
  history.replaceState({ intercepted: false }, "");

  window.addEventListener("popstate", event => {
    // We only handle states that we've pushed ourselves.
    // This allows normal browser back/forward navigation to work if ever needed.
    if (event.state && event.state.intercepted) {
      handleBackButton();
    }
  });
  }
