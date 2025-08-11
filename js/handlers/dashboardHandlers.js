import { appState } from "../state.js";
import * as ui from "../ui.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";

/**
 * Handles the deletion of a single sale record after user confirmation.
 * @param {string} saleId - The ID of the sale record to delete.
 */
async function handleSingleSaleDelete(saleId) {
    if (!saleId) return;

    if (!confirm(`هل أنت متأكد من حذف هذا السجل نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`)) {
        return;
    }

    ui.showStatus("جاري حذف السجل...", "syncing");
    const originalSales = JSON.parse(JSON.stringify(appState.sales));

    try {
        appState.sales = appState.sales.filter(sale => sale.saleId !== saleId);
        
        await api.saveSales();
        saveLocalData();
        
        ui.hideSyncStatus();
        ui.showStatus(`تم حذف السجل بنجاح.`, "success");

    } catch (error) {
        console.error("Failed to delete sale record:", error);
        appState.sales = originalSales; // Rollback on failure
        ui.hideSyncStatus();
        ui.showStatus(`فشل حذف السجل: ${error.message}`, "error");
    } finally {
        ui.renderDashboard();
    }
}

/**
 * Handles all click events within the sales log container.
 * Differentiates between clicking the delete button and clicking the card header.
 * @param {Event} e - The click event object.
 */
function handleSalesLogClick(e) {
    const deleteButton = e.target.closest('.delete-sale-btn');
    if (deleteButton) {
        // Stop the click from bubbling up to the item-header
        e.stopPropagation(); 
        const saleItem = e.target.closest('.sale-item');
        const saleId = saleItem.dataset.saleId;
        handleSingleSaleDelete(saleId);
        return; // Action is complete
    }

    const itemHeader = e.target.closest('.item-header');
    if (itemHeader) {
        const details = itemHeader.nextElementSibling;
        if (details && details.classList.contains("item-details")) {
            details.classList.toggle("visible");
        }
    }
}

export function setupDashboardListeners(elements) {
  elements.timeFilterControls.addEventListener("click", e => {
    const button = e.target.closest(".time-filter-btn");
    if (button) {
      appState.dashboardPeriod = button.dataset.period;
      elements.timeFilterControls.querySelector(".active").classList.remove("active");
      button.classList.add("active");
      ui.renderDashboard();
    }
  });

  const salesLogContainer = elements.dashboardViewContainer.querySelector("#sales-log-content");
  if(salesLogContainer) {
      // Use a simple click listener
      salesLogContainer.addEventListener("click", handleSalesLogClick);
  }
}
