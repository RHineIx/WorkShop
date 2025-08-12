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

  // Unified click handler for the entire dashboard container
  elements.dashboardViewContainer.addEventListener("click", e => {
    // Handler for collapsible sections (Bestsellers, Sales Log)
    const collapsibleHeader = e.target.closest(".collapsible-header");
    if (collapsibleHeader) {
      const targetId = collapsibleHeader.dataset.target;
      const content = document.getElementById(targetId);
      if (content) {
        collapsibleHeader.classList.toggle("collapsed");
        content.classList.toggle("collapsed");
      }
      return;
    }

    // Handler for individual sale item delete button
    const deleteButton = e.target.closest('.delete-sale-btn');
    if (deleteButton) {
        e.stopPropagation(); 
        const saleItem = e.target.closest('.sale-item');
        const saleId = saleItem.dataset.saleId;
        handleSingleSaleDelete(saleId);
        return;
    }

    // Handler for expanding/collapsing sale item details
    const itemHeader = e.target.closest('.item-header');
    if (itemHeader) {
        const details = itemHeader.nextElementSibling;
        if (details && details.classList.contains("item-details")) {
            details.classList.toggle("visible");
        }
    }
  });
}
