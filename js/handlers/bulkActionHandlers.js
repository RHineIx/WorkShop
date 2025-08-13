// js/handlers/bulkActionHandlers.js
import { appState } from "../state.js";
import * as ui from "../ui.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { pushState } from "../navigation.js";

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
  ui.showStatus("التحقق من البيانات...", "syncing");
  try {
    const { sha: latestSha } = await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      ui.hideSyncStatus();
      ui.showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      return;
    }

    appState.selectedItemIds.forEach(id => {
      const item = appState.inventory.items.find(i => i.id === id);
      if (item) item.category = newCategory;
    });
    await api.saveToGitHub();
    saveLocalData();
    ui.hideSyncStatus();
    ui.showStatus(
      `تم تحديث فئة ${appState.selectedItemIds.size} عناصر بنجاح.`,
      "success"
    );
  } catch (error) {
    ui.hideSyncStatus();
    ui.showStatus(`فشل تحديث الفئة: ${error.message}`, "error");
  } finally {
    ui.getDOMElements().bulkCategoryModal.close();
    exitSelectionMode();
    ui.filterAndRenderItems(true);
    ui.populateCategoryDatalist();
    ui.renderCategoryFilter();
  }
}

async function handleBulkSupplierChange(e) {
  e.preventDefault();
  const newSupplierId = e.target.elements["bulk-item-supplier"].value;
  if (!newSupplierId) return;

  ui.showStatus("التحقق من البيانات...", "syncing");
  try {
    const { sha: latestSha } = await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      ui.hideSyncStatus();
      ui.showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      return;
    }

    appState.selectedItemIds.forEach(id => {
      const item = appState.inventory.items.find(i => i.id === id);
      if (item) item.supplierId = newSupplierId;
    });
    await api.saveToGitHub();
    saveLocalData();
    ui.hideSyncStatus();
    ui.showStatus(
      `تم تحديث مورّد ${appState.selectedItemIds.size} عناصر بنجاح.`,
      "success"
    );
  } catch (error) {
    ui.hideSyncStatus();
    ui.showStatus(`فشل تحديث المورّد: ${error.message}`, "error");
  } finally {
    ui.getDOMElements().bulkSupplierModal.close();
    exitSelectionMode();
    ui.filterAndRenderItems(true);
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
      ui.populateBulkSupplierDropdown();
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
