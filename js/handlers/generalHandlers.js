// js/handlers/generalHandlers.js
import { appState } from "../state.js";
import { setTheme, updateCurrencyDisplay, toggleView } from "../ui.js";
import { exitSelectionMode } from "./bulkActionHandlers.js";

export function setupGeneralListeners(elements) {
  elements.themeToggleBtn.addEventListener("click", () => {
    const isLight = document.body.classList.contains("theme-light");
    setTheme(isLight ? "dark" : "light");
  });

  elements.currencyToggleBtn.addEventListener("click", () => {
    appState.activeCurrency = appState.activeCurrency === "IQD" ? "USD" : "IQD";
    localStorage.setItem("inventoryAppCurrency", appState.activeCurrency);
    updateCurrencyDisplay();
  });

  if (elements.scrollToTopBtn) {
    const appContainer = document.getElementById("app-container");
    if (!appContainer) return;

    appContainer.addEventListener("scroll", () => {
      if (appContainer.scrollTop > 300) {
        elements.scrollToTopBtn.classList.add("visible");
      } else {
        elements.scrollToTopBtn.classList.remove("visible");
      }
    });

    elements.scrollToTopBtn.addEventListener("click", () => {
      appContainer.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }
}

export function setupViewToggleListeners(elements) {
  elements.inventoryToggleBtn.addEventListener("click", () => {
    if (appState.isSelectionModeActive) exitSelectionMode();
    toggleView("inventory");
  });

  elements.dashboardToggleBtn.addEventListener("click", () => {
    if (appState.isSelectionModeActive) exitSelectionMode();
    toggleView("dashboard");
  });
  
  // ADDED
  elements.activityLogToggleBtn.addEventListener("click", () => {
    if (appState.isSelectionModeActive) exitSelectionMode();
    toggleView("activity-log");
  });
}