// js/eventSetup.js
import * as ui from "./ui.js";
import { setupGeneralListeners, setupViewToggleListeners } from "./handlers/generalHandlers.js";
import { setupInventoryListeners } from "./handlers/inventoryHandlers.js";
import { setupModalListeners } from "./handlers/modalHandlers.js";
import { setupDashboardListeners } from "./handlers/dashboardHandlers.js";
import { setupSupplierListeners } from "./handlers/supplierHandlers.js";
import { setupSyncListeners } from "./handlers/syncHandlers.js";
import { setupBulkActionListeners } from "./handlers/bulkActionHandlers.js";

export function setupEventListeners() {
  const elements = ui.getDOMElements();

  setupGeneralListeners(elements);
  setupViewToggleListeners(elements);
  setupInventoryListeners(elements);
  setupModalListeners(elements);
  setupDashboardListeners(elements);
  setupSupplierListeners(elements);
  setupSyncListeners(elements);
  setupBulkActionListeners(elements);
}