// js/app.js
import { appState } from "./state.js";
import * as api from "./api.js";
import * as ui from "./ui.js";
import { setupEventListeners } from "./eventSetup.js";
import { setupLayoutAdjustments } from "./layout.js"; // Import the new function

// --- LOCAL STORAGE & CONFIG ---
export function loadConfig() {
  const savedConfig = localStorage.getItem("inventoryAppSyncConfig");
  if (savedConfig) {
    appState.syncConfig = JSON.parse(savedConfig);
  }
  const savedRate = localStorage.getItem("inventoryAppExchangeRate");
  if (savedRate) {
    appState.exchangeRate = parseFloat(savedRate);
  }
}

export function saveConfig() {
  localStorage.setItem(
    "inventoryAppSyncConfig",
    JSON.stringify(appState.syncConfig)
  );
  localStorage.setItem("inventoryAppExchangeRate", appState.exchangeRate);
}

function handleMagicLink() {
  if (!window.location.hash.startsWith("#setup=")) {
    return false;
  }

  try {
    const encodedData = window.location.hash.substring(7);
    const decodedJson = atob(encodedData);
    const config = JSON.parse(decodedJson);

    if (config.username && config.repo && config.pat) {
      appState.syncConfig = config;
      saveConfig();
      ui.showStatus("تم الإعداد بنجاح!", "success");
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
      return true;
    }
  } catch (error) {
    console.error("Failed to process magic link:", error);
    ui.showStatus("فشل معالجة رابط الإعداد.", "error");
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search
    );
  }
  return false;
}

function loadLocalData() {
  const savedInventory = localStorage.getItem("inventoryAppData");
  if (savedInventory) {
    let parsedData = JSON.parse(savedInventory);
    if (Array.isArray(parsedData)) {
      appState.inventory = { items: parsedData, lastArchiveTimestamp: null };
    } else {
      appState.inventory = parsedData;
    }
  }
  const savedSales = localStorage.getItem("salesAppData");
  if (savedSales) {
    appState.sales = JSON.parse(savedSales);
  }
  const savedSuppliers = localStorage.getItem("suppliersAppData");
  if (savedSuppliers) {
    appState.suppliers = JSON.parse(savedSuppliers);
  }
}

export function saveLocalData() {
  localStorage.setItem("inventoryAppData", JSON.stringify(appState.inventory));
  localStorage.setItem("salesAppData", JSON.stringify(appState.sales));
  localStorage.setItem("suppliersAppData", JSON.stringify(appState.suppliers));
}

function handleUrlShortcuts() {
  const hash = window.location.hash;
  if (!hash || hash.startsWith("#setup=")) return;

  setTimeout(() => {
    switch (hash) {
      case "#add-item":
        ui.getDOMElements().addItemBtn.click();
        break;
      case "#dashboard":
        ui.toggleView("dashboard");
        break;
    }
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search
    );
  }, 100);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then(registration => {
          console.log(
            "ServiceWorker registration successful with scope: ",
            registration.scope
          );
        })
        .catch(err => {
          console.log("ServiceWorker registration failed: ", err);
        });
    });
  }
}

// --- INITIALIZATION ---
export async function initializeApp() {
  console.log("Initializing Inventory Management App...");

  const magicLinkProcessed = handleMagicLink();

  setupEventListeners();
  setupLayoutAdjustments(); // Call the new layout function

  loadConfig();
  const savedTheme = localStorage.getItem("inventoryAppTheme") || "light";
  const savedCurrency = localStorage.getItem("inventoryAppCurrency") || "IQD";
  appState.activeCurrency = savedCurrency;
  ui.setTheme(savedTheme);

  try {
    const response = await fetch("version.json?t=" + Date.now());
    if (response.ok) {
      const versionData = await response.json();
      ui.displayVersionInfo(versionData);
    }
  } catch (error) {
    console.error("Could not fetch version info:", error);
  }

  ui.renderInventorySkeleton();

  if (appState.syncConfig) {
    ui.showStatus("جاري مزامنة البيانات...", "syncing");
    try {
      const [inventoryResult, salesResult, suppliersResult] = await Promise.all(
        [api.fetchFromGitHub(), api.fetchSales(), api.fetchSuppliers()]
      );
      if (inventoryResult) {
        appState.inventory = inventoryResult.data;
        appState.fileSha = inventoryResult.sha;
      }
      if (salesResult) {
        appState.sales = salesResult.data;
        appState.salesFileSha = salesResult.sha;
      }
      if (suppliersResult) {
        appState.suppliers = suppliersResult.data;
        appState.suppliersFileSha = suppliersResult.sha;
      }

      saveLocalData();
      ui.hideSyncStatus();
      if (!magicLinkProcessed) {
        ui.showStatus("تمت المزامنة بنجاح!", "success");
      }
    } catch (error) {
      ui.hideSyncStatus();
      ui.showStatus(`خطأ في المزامنة: ${error.message}`, "error", {
        duration: 5000,
      });
      loadLocalData();
    }
  } else {
    loadLocalData();
  }

  const { updateLastArchiveDateDisplay } = await import(
    "./handlers/syncHandlers.js"
  );
  updateLastArchiveDateDisplay();
  ui.filterAndRenderItems();
  ui.renderCategoryFilter();
  ui.populateCategoryDatalist();
  ui.updateCurrencyDisplay();

  handleUrlShortcuts();
  registerServiceWorker();

  console.log("App Initialized Successfully.");
}
