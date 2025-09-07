// js/eventSetup.js
import { elements } from "./ui.js";
import {
  setupGeneralListeners,
  setupViewToggleListeners,
} from "./handlers/generalHandlers.js";
import { setupInventoryListeners } from "./handlers/inventoryHandlers.js";
import { setupModalListeners } from "./handlers/modalHandlers.js";
import { setupDashboardListeners } from "./handlers/dashboardHandlers.js";
import { setupSupplierListeners } from "./handlers/supplierHandlers.js";
import { setupSyncListeners } from "./handlers/syncHandlers.js";
import { setupBulkActionListeners } from "./handlers/bulkActionHandlers.js";
import { setupActivityLogListeners } from "./handlers/activityLogHandlers.js";
import { setupVehicleSearchListeners } from "./handlers/vehicleSearchHandler.js";

export function setupEventListeners() {
  setupGeneralListeners(elements);
  setupViewToggleListeners(elements);
  setupInventoryListeners(elements);
  setupModalListeners(elements);
  setupDashboardListeners(elements);
  setupSupplierListeners(elements);
  setupSyncListeners(elements);
  setupBulkActionListeners(elements);
  setupActivityLogListeners(elements);
  setupVehicleSearchListeners(elements);
}