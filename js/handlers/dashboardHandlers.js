// js/handlers/dashboardHandlers.js
import { appState } from "../state.js";
import * as ui from "../ui.js";
import { exitSelectionMode } from "./bulkActionHandlers.js";

export function setupDashboardListeners(elements) {
  elements.timeFilterControls.addEventListener("click", e => {
    if (appState.isSelectionModeActive) exitSelectionMode();

    const button = e.target.closest(".time-filter-btn");
    if (button) {
      appState.dashboardPeriod = button.dataset.period;
      elements.timeFilterControls.querySelector(".active").classList.remove("active");
      button.classList.add("active");
      ui.renderDashboard();
    }
  });

  elements.dashboardViewContainer.addEventListener("click", e => {
    // Handler for collapsible sections
    const collapsibleHeader = e.target.closest(".collapsible-header");
    if (collapsibleHeader) {
      const targetId = collapsibleHeader.dataset.target;
      const content = document.getElementById(targetId);
      if (content) {
        collapsibleHeader.classList.toggle("collapsed");
        content.classList.toggle("collapsed");
      }
    }

    // Handler for sales log item details
    const salesItemHeader = e.target.closest(".item-header");
    if (salesItemHeader) {
      const details = salesItemHeader.nextElementSibling;
      if (details && details.classList.contains("item-details")) {
        details.classList.toggle("visible");
      }
    }
  });
}