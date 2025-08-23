// js/handlers/modalHandlers.js
import { setupItemFormModalListeners } from "./modals/itemFormHandler.js";
import { setupSaleModalListeners } from "./modals/saleModalHandler.js";
import { setupDetailsModalListeners } from "./modals/detailsModalHandler.js";

// Re-export functions needed by other modules to avoid breaking imports.
export { openItemModal } from "./modals/itemFormHandler.js";
export { openSaleModal } from "./modals/saleModalHandler.js";

/**
 * Main function to set up listeners for all modals by delegating
 * to specialized handlers.
 */
export function setupModalListeners() {
  setupItemFormModalListeners();
  setupSaleModalListeners();
  setupDetailsModalListeners();
}