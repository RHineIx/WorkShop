// js/handlers/dashboardHandlers.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { showConfirmationModal } from "../ui_helpers.js";
import { showStatus, hideSyncStatus } from "../notifications.js";
import { renderDashboard } from "../renderer.js";

/**
 * Handles the deletion of a single sale record after user confirmation.
 * @param {string} saleId - The ID of the sale record to delete.
 */
async function handleSingleSaleDelete(saleId) {
  if (!saleId) return;

  const confirmed = await showConfirmationModal({
    title: "تأكيد الحذف",
    message:
      "هل أنت متأكد من حذف هذا السجل نهائياً؟ لا يمكن التراجع عن هذا الإجراء.",
    confirmText: "نعم, حذف",
  });

  if (confirmed) {
    showStatus("جاري حذف السجل...", "syncing");
    const originalSales = JSON.parse(JSON.stringify(appState.sales));
    try {
      appState.sales = appState.sales.filter(sale => sale.saleId !== saleId);

      await api.saveSales();
      saveLocalData();

      hideSyncStatus();
      showStatus(`تم حذف السجل بنجاح.`, "success");
    } catch (error) {
      console.error("Failed to delete sale record:", error);
      appState.sales = originalSales; // Rollback on failure
      hideSyncStatus();
      showStatus(`فشل حذف السجل: ${error.message}`, "error");
    } finally {
      renderDashboard();
    }
  }
}

export function setupDashboardListeners(elements) {
  elements.timeFilterControls.addEventListener("click", e => {
    const button = e.target.closest(".time-filter-btn");
    if (button) {
      appState.dashboardPeriod = button.dataset.period;
      elements.timeFilterControls
        .querySelector(".active")
        .classList.remove("active");
      button.classList.add("active");
      renderDashboard();
    }
  });

  elements.dashboardViewContainer.addEventListener("click", e => {
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

    const deleteButton = e.target.closest(".delete-sale-btn");
    if (deleteButton) {
      e.stopPropagation();
      const saleItem = e.target.closest(".sale-item");
      const saleId = saleItem.dataset.saleId;
      handleSingleSaleDelete(saleId);
      return;
    }

    const itemHeader = e.target.closest(".item-header");
    if (itemHeader) {
      const details = itemHeader.nextElementSibling;
      if (details && details.classList.contains("item-details")) {
        details.classList.toggle("visible");
      }
    }
  });
}
