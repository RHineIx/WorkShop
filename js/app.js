// js/app.js
import { appState } from "./state.js";
import * as api from "./api.js";
import {
  displayVersionInfo,
  setTheme,
  toggleView,
  updateCurrencyDisplay,
  elements,
} from "./ui.js";
import {
  renderInventorySkeleton,
  filterAndRenderItems,
  renderCategoryFilter,
  renderAuditLog,
  renderDashboard,
} from "./renderer.js";
import { showStatus, hideSyncStatus } from "./notifications.js";
import { setupEventListeners } from "./eventSetup.js";
import { setupLayoutAdjustments } from "./layout.js";
import { initNavigationListener } from "./navigation.js";

function migrateDataModelIfNeeded() {
  let isDataUpdated = false;
  if (appState.inventory && appState.inventory.items) {
    appState.inventory.items.forEach(item => {
      if (
        typeof item.category === "string" &&
        item.category &&
        !Array.isArray(item.categories)
      ) {
        console.log(`Migrating item: ${item.name}`);
        item.categories = [item.category];
        delete item.category;
        isDataUpdated = true;
      }
    });
  }
  return isDataUpdated;
}

export function loadConfig() {
  const savedConfig = localStorage.getItem("inventoryAppSyncConfig");
  if (savedConfig) {
    appState.syncConfig = JSON.parse(savedConfig);
  }
  const savedRate = localStorage.getItem("inventoryAppExchangeRate");
  if (savedRate) {
    appState.exchangeRate = parseFloat(savedRate);
  }
  const savedUser = localStorage.getItem("inventoryAppCurrentUser");
  if (savedUser) {
    appState.currentUser = savedUser;
  }
}

export function saveConfig() {
  localStorage.setItem(
    "inventoryAppSyncConfig",
    JSON.stringify(appState.syncConfig)
  );
  localStorage.setItem("inventoryAppExchangeRate", appState.exchangeRate);
  localStorage.setItem("inventoryAppCurrentUser", appState.currentUser);
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
      showStatus("تم الإعداد بنجاح!", "success");
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
      return true;
    }
  } catch (error) {
    console.error("Failed to process magic link:", error);
    showStatus("فشل معالجة رابط الإعداد.", "error");
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
  const savedAuditLog = localStorage.getItem("auditLogAppData");
  if (savedAuditLog) {
    appState.auditLog = JSON.parse(savedAuditLog);
  }
}

export function saveLocalData() {
  localStorage.setItem("inventoryAppData", JSON.stringify(appState.inventory));
  localStorage.setItem("salesAppData", JSON.stringify(appState.sales));
  localStorage.setItem("suppliersAppData", JSON.stringify(appState.suppliers));
  localStorage.setItem("auditLogAppData", JSON.stringify(appState.auditLog));
}

function handleUrlShortcuts() {
  const hash = window.location.hash;
  if (!hash || hash.startsWith("#setup=")) return;
  setTimeout(() => {
    switch (hash) {
      case "#add-item":
        elements.addItemBtn.click();
        break;
      case "#dashboard":
        toggleView("dashboard");
        break;
    }
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search
    );
  }, 100);
}

function registerServiceWorker(version = "latest") {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(`./sw.js?v=${version}`)
      .then(registration => {
        console.log("ServiceWorker registration successful.");

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          console.log("New service worker found. State:", newWorker.state);

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              console.log("New service worker installed and waiting.");
              showStatus("نسخة جديدة من التطبيق متوفرة!", "info", {
                duration: 0,
                showRefreshButton: true,
              });

              const refreshButton = document.querySelector(
                ".status-refresh-btn"
              );
              if (refreshButton) {
                refreshButton.onclick = () => {
                  newWorker.postMessage({ type: "SKIP_WAITING" });
                };
              }
            }
          });
        });
      })
      .catch(err => {
        console.error("ServiceWorker registration failed: ", err);
      });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      console.log("New service worker has taken control. Reloading...");
      window.location.reload();
    });
  }
}

async function syncRemoteData() {
  if (!appState.syncConfig) {
    return;
  }

  const syncToastId = showStatus("جاري مزامنة أحدث البيانات...", "syncing", {
    duration: 0,
  });

  try {
    const [inventoryResult, salesResult, suppliersResult, auditLogResult] =
      await Promise.all([
        api.fetchFromGitHub(),
        api.fetchSales(),
        api.fetchSuppliers(),
        api.fetchAuditLog(),
      ]);

    hideSyncStatus();

    let needsUIRefresh = false;

    if (inventoryResult && inventoryResult.sha !== appState.fileSha) {
      needsUIRefresh = true;
      appState.inventory = inventoryResult.data;
      appState.fileSha = inventoryResult.sha;
    }
    if (salesResult && salesResult.sha !== appState.salesFileSha) {
      needsUIRefresh = true;
      appState.sales = salesResult.data;
      appState.salesFileSha = salesResult.sha;
    }
    if (suppliersResult && suppliersResult.sha !== appState.suppliersFileSha) {
      needsUIRefresh = true;
      appState.suppliers = suppliersResult.data;
      appState.suppliersFileSha = suppliersResult.sha;
    }
    if (auditLogResult && auditLogResult.sha !== appState.auditLogFileSha) {
      needsUIRefresh = true;
      appState.auditLog = auditLogResult.data;
      appState.auditLogFileSha = auditLogResult.sha;
    }

    if (migrateDataModelIfNeeded()) {
      showStatus("جاري تحديث هيكل البيانات...", "syncing");
      await api.saveInventory();
      needsUIRefresh = true;
      showStatus("تم تحديث هيكل البيانات بنجاح!", "success");
    }

    saveLocalData();

    if (needsUIRefresh) {
      showStatus("تم تحديث البيانات بنجاح!", "success");
      filterAndRenderItems();
      renderCategoryFilter();
      if (appState.currentView === "dashboard") renderDashboard();
      if (appState.currentView === "activity-log") renderAuditLog();
    } else {
      showStatus("البيانات محدثة بالفعل.", "info");
    }
  } catch (error) {
    hideSyncStatus();
    showStatus(`خطأ في المزامنة: ${error.message}`, "error", {
      duration: 5000,
    });
  }
}

export async function initializeApp() {
  console.log("Initializing Inventory Management App...");
  let versionData = { hash: new Date().getTime() };
  try {
    const response = await fetch(`version.json?t=${new Date().getTime()}`);
    if (response.ok) {
      versionData = await response.json();
      displayVersionInfo(versionData);
    }
  } catch (error) {
    console.error("Could not fetch version info:", error);
  }

  registerServiceWorker(versionData.hash);
  const magicLinkProcessed = handleMagicLink();

  setupEventListeners();
  setupLayoutAdjustments();
  initNavigationListener();

  loadConfig();
  const savedTheme = localStorage.getItem("inventoryAppTheme") || "light";
  const savedCurrency = localStorage.getItem("inventoryAppCurrency") || "IQD";
  appState.activeCurrency = savedCurrency;
  setTheme(savedTheme, true); // Set theme instantly without transition

  // --- LOCAL FIRST STRATEGY ---
  // 1. Load local data immediately
  loadLocalData();
  if (migrateDataModelIfNeeded()) {
    saveLocalData();
    console.log("Local data model migrated.");
  }

  // 2. Render the UI immediately with local data
  const { updateLastArchiveDateDisplay } = await import(
    "./handlers/syncHandlers.js"
  );
  updateLastArchiveDateDisplay();
  filterAndRenderItems();
  renderCategoryFilter();
  renderAuditLog();
  updateCurrencyDisplay();
  handleUrlShortcuts();

  // 3. Sync with remote data in the background
  if (!magicLinkProcessed) {
    // Don't sync immediately after a magic link setup
    syncRemoteData();
  }

  console.log("App Initialized Successfully.");
}