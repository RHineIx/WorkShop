// js/handlers/generalHandlers.js
import { appState } from "../state.js";
import * as ui from "../ui.js";
import { exitSelectionMode } from "./bulkActionHandlers.js";

export function setupGeneralListeners(elements) {
  // --- Theme Toggle ---
  elements.themeToggleBtn.addEventListener("click", () => {
    const isLight = document.body.classList.contains("theme-light");
    ui.setTheme(isLight ? "dark" : "light");
  });

  // --- Currency Toggle ---
  elements.currencyToggleBtn.addEventListener("click", () => {
    appState.activeCurrency = appState.activeCurrency === "IQD" ? "USD" : "IQD";
    localStorage.setItem("inventoryAppCurrency", appState.activeCurrency);
    ui.updateCurrencyDisplay();
  });

  // --- Scroll to Top Button ---
  if (elements.scrollToTopBtn) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 300) {
        elements.scrollToTopBtn.classList.add("visible");
      } else {
        elements.scrollToTopBtn.classList.remove("visible");
      }
    });

    elements.scrollToTopBtn.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }
}

export function setupViewToggleListeners(elements) {
  elements.inventoryToggleBtn.addEventListener("click", () => {
    if (appState.isSelectionModeActive) exitSelectionMode();
    ui.toggleView("inventory");
  });

  elements.dashboardToggleBtn.addEventListener("click", () => {
    if (appState.isSelectionModeActive) exitSelectionMode();
    ui.toggleView("dashboard");
  });
}