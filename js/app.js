// js/app.js
import { appState } from "./state.js";
import * as api from "./api.js";
import {
  displayVersionInfo,
  setTheme,
  toggleView,
  updateCurrencyDisplay,
  getDOMElements,
} from "./ui.js";
import {
  renderInventorySkeleton,
  filterAndRenderItems,
  renderCategoryFilter,
  populateCategoryDatalist,
  renderAuditLog,
} from "./renderer.js";
import { showStatus, hideSyncStatus } from "./notifications.js";
import { setupEventListeners } from "./eventSetup.js";
import { setupLayoutAdjustments } from "./layout.js";
import { initNavigationListener } from "./navigation.js";

function migrateDataModelIfNeeded() {
  let isDataUpdated = false;
  if (appState.inventory && appState.inventory.items) {
    appState.inventory.items.forEach(item => {
      if (typeof item.category === 'string' && item.category && !Array.isArray(item.categories)) {
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
        getDOMElements().addItemBtn.click();
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

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register('./sw.js').then(registration => {
      console.log('ServiceWorker registration successful.');

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('New service worker found. State:', newWorker.state);

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('New service worker installed and waiting.');
            showStatus('نسخة جديدة من التطبيق متوفرة!', 'info', {
              duration: 0, 
              showRefreshButton: true,
            });

            const refreshButton = document.querySelector('.status-refresh-btn');
            if (refreshButton) {
              refreshButton.onclick = () => {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              };
            }
          }
        });
      });
    }).catch(err => {
      console.error('ServiceWorker registration failed: ', err);
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('New service worker has taken control. Reloading...');
      window.location.reload();
    });
  }
}


export async function initializeApp() {
  console.log("Initializing Inventory Management App...");

  registerServiceWorker();

  const magicLinkProcessed = handleMagicLink();

  setupEventListeners();
  setupLayoutAdjustments();
  initNavigationListener();

  loadConfig();
  const savedTheme = localStorage.getItem("inventoryAppTheme") || "light";
  const savedCurrency = localStorage.getItem("inventoryAppCurrency") || "IQD";
  appState.activeCurrency = savedCurrency;
  setTheme(savedTheme);
  try {
    const response = await fetch("version.json?t=" + Date.now());
    if (response.ok) {
      const versionData = await response.json();
      displayVersionInfo(versionData);
    }
  } catch (error) {
    console.error("Could not fetch version info:", error);
  }

  renderInventorySkeleton();
  
  if (appState.syncConfig) {
    showStatus("جاري مزامنة البيانات...", "syncing");
    try {
      const [inventoryResult, salesResult, suppliersResult, auditLogResult] =
        await Promise.all([
          api.fetchFromGitHub(),
          api.fetchSales(),
          api.fetchSuppliers(),
          api.fetchAuditLog(),
        ]);
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
      if (auditLogResult) {
        appState.auditLog = auditLogResult.data;
        appState.auditLogFileSha = auditLogResult.sha;
      }
      
      if (migrateDataModelIfNeeded()) {
        showStatus("جاري تحديث هيكل البيانات...", "syncing");
        await api.saveToGitHub();
        saveLocalData();
        showStatus("تم تحديث هيكل البيانات بنجاح!", "success");
      } else {
        saveLocalData();
      }

      hideSyncStatus();
      if (!magicLinkProcessed) {
        showStatus("تمت المزامنة بنجاح!", "success");
      }
    } catch (error) {
      hideSyncStatus();
      showStatus(`خطأ في المزامنة: ${error.message}`, "error", {
        duration: 5000,
      });
      loadLocalData();
      if (migrateDataModelIfNeeded()) {
          saveLocalData();
          console.log("Local data model migrated.");
      }
    }
  } else {
    loadLocalData();
    if (migrateDataModelIfNeeded()) {
        saveLocalData();
        console.log("Local data model migrated.");
    }
  }

  const { updateLastArchiveDateDisplay } = await import(
    "./handlers/syncHandlers.js"
  );
  updateLastArchiveDateDisplay();
  filterAndRenderItems();
  renderCategoryFilter();
  populateCategoryDatalist();
  renderAuditLog();
  updateCurrencyDisplay();
  handleUrlShortcuts();
  
  console.log("App Initialized Successfully.");
}