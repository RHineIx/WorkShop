// js/handlers/bulkActionHandlers.js
import { appState } from "../state.js";
import * as ui from "../ui.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { pushState } from "../navigation.js";
import * as renderer from "../renderer.js";
import * as notifications from "../notifications.js";

let longPressTriggered = false;
export function isLongPressTriggered() {
  return longPressTriggered;
}

export function setLongPressTriggered(value) {
  longPressTriggered = value;
}

export function enterSelectionMode(card) {
  appState.isSelectionModeActive = true;
  pushState();
  ui.getDOMElements().inventoryGrid.classList.add("selection-mode");
  if (card) {
    toggleSelection(card);
  }
}

export function exitSelectionMode() {
  appState.isSelectionModeActive = false;
  appState.selectedItemIds.clear();

  const elements = ui.getDOMElements();
  elements.inventoryGrid.classList.remove("selection-mode");
  elements.inventoryGrid
    .querySelectorAll(".product-card.selected")
    .forEach(card => card.classList.remove("selected"));

  ui.updateBulkActionsBar();
}

export function toggleSelection(card) {
  const id = card.dataset.id;
  if (!id) return;

  if (appState.selectedItemIds.has(id)) {
    appState.selectedItemIds.delete(id);
    card.classList.remove("selected");
  } else {
    appState.selectedItemIds.add(id);
    card.classList.add("selected");
  }

  if (appState.selectedItemIds.size === 0) {
    exitSelectionMode();
  } else {
    ui.updateBulkActionsBar();
  }
}

async function handleBulkCategoryChange(e) {
  e.preventDefault();
  const newCategory = e.target.elements["bulk-item-category"].value.trim();
  if (!newCategory) return;

  notifications.showStatus("التحقق من البيانات...", "syncing");
  try {
    const { data: latestInventory, sha: latestSha } =
      await api.fetchFromGitHub();

    if (latestSha !== appState.fileSha) {
      notifications.hideSyncStatus();
      notifications.showStatus(
        "البيانات غير محدّثة. تم تحديثها من جهاز آخر.",
        "error",
        {
          showRefreshButton: true,
        }
      );
      return;
    }

    appState.inventory = latestInventory;
    appState.fileSha = latestSha;

    appState.selectedItemIds.forEach(id => {
      const item = appState.inventory.items.find(i => i.id === id);
      if (item) item.category = newCategory;
    });

    await api.saveToGitHub();
    saveLocalData();
    notifications.hideSyncStatus();
    notifications.showStatus(
      `تم تحديث فئة ${appState.selectedItemIds.size} عناصر بنجاح.`,
      "success"
    );
  } catch (error) {
    notifications.hideSyncStatus();
    notifications.showStatus(`فشل تحديث الفئة: ${error.message}`, "error");
  } finally {
    ui.getDOMElements().bulkCategoryModal.close();
    exitSelectionMode();
    renderer.filterAndRenderItems(true);
    renderer.populateCategoryDatalist();
    renderer.renderCategoryFilter();
  }
}

async function handleBulkSupplierChange(e) {
  e.preventDefault();
  const newSupplierId = e.target.elements["bulk-item-supplier"].value;
  if (!newSupplierId) return;

  notifications.showStatus("التحقق من البيانات...", "syncing");
  try {
    const { data: latestInventory, sha: latestSha } =
      await api.fetchFromGitHub();

    if (latestSha !== appState.fileSha) {
      notifications.hideSyncStatus();
      notifications.showStatus(
        "البيانات غير محدّثة. تم تحديثها من جهاز آخر.",
        "error",
        {
          showRefreshButton: true,
        }
      );
      return;
    }

    appState.inventory = latestInventory;
    appState.fileSha = latestSha;

    appState.selectedItemIds.forEach(id => {
      const item = appState.inventory.items.find(i => i.id === id);
      if (item) item.supplierId = newSupplierId;
    });

    await api.saveToGitHub();
    saveLocalData();
    notifications.hideSyncStatus();
    notifications.showStatus(
      `تم تحديث مورّد ${appState.selectedItemIds.size} عناصر بنجاح.`,
      "success"
    );
  } catch (error) {
    notifications.hideSyncStatus();
    notifications.showStatus(`فشل تحديث المورّد: ${error.message}`, "error");
  } finally {
    ui.getDOMElements().bulkSupplierModal.close();
    exitSelectionMode();
    renderer.filterAndRenderItems(true);
  }
}

export function setupBulkActionListeners(elements) {
  document
    .getElementById("bulk-change-category-btn")
    .addEventListener("click", () => {
      elements.bulkCategoryForm.reset();
      ui.openModal(elements.bulkCategoryModal);
    });
  document
    .getElementById("bulk-change-supplier-btn")
    .addEventListener("click", () => {
      // --- FIX: This now correctly calls the function from the renderer module ---
      renderer.populateBulkSupplierDropdown();
      elements.bulkSupplierForm.reset();
      ui.openModal(elements.bulkSupplierModal);
    });
  document
    .getElementById("cancel-selection-btn")
    .addEventListener("click", exitSelectionMode);
  elements.bulkCategoryForm.addEventListener(
    "submit",
    handleBulkCategoryChange
  );
  elements.bulkSupplierForm.addEventListener(
    "submit",
    handleBulkSupplierChange
  );
  elements.bulkCategoryModal
    .querySelector("[data-close]")
    .addEventListener("click", () => elements.bulkCategoryModal.close());
  elements.bulkSupplierModal
    .querySelector("[data-close]")
    .addEventListener("click", () => elements.bulkSupplierModal.close());
}
