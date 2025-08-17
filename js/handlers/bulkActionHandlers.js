// js/handlers/bulkActionHandlers.js
import { appState } from "../state.js";
import { elements, openModal, updateBulkActionsBar } from "../ui.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { pushState } from "../navigation.js";
import * as renderer from "../renderer.js";
import * as notifications from "../notifications.js";
import { logAction, ACTION_TYPES } from "../logger.js";

let bulkCategoryInputManager = null;
function setupBulkCategoryInput() {
    const {
        bulkSelectedCategoriesContainer,
        bulkAvailableCategoriesList,
        bulkCategoryInputField,
        bulkAddCategoryBtn,
        categoryPillTemplate
    } = elements;
    let selectedCategories = new Set();
    const allCategories = new Set(renderer.getAllUniqueCategories());
    const render = () => {
        bulkSelectedCategoriesContainer.innerHTML = '';
        bulkAvailableCategoriesList.innerHTML = '';
        selectedCategories.forEach(text => {
            const pill = createPill(text, true);
            bulkSelectedCategoriesContainer.appendChild(pill);
        });
        allCategories.forEach(text => {
            if (!selectedCategories.has(text)) {
                const pill = createPill(text, false);
                bulkAvailableCategoriesList.appendChild(pill);
            }
        });
    };

    const createPill = (text, isSelected) => {
        const clone = categoryPillTemplate.content.cloneNode(true);
        const pill = clone.querySelector('.category-pill');
        pill.querySelector('.pill-text').textContent = text;
        pill.dataset.value = text;
        if (isSelected) {
            const removeBtn = pill.querySelector('.remove-pill-btn');
            removeBtn.addEventListener('click', () => removeCategory(text));
        } else {
            pill.querySelector('.remove-pill-btn').remove();
            pill.addEventListener('click', () => addCategory(text));
        }
        return pill;
    };
    const addCategory = (text) => {
        const cleanedText = text.trim();
        if (cleanedText && !selectedCategories.has(cleanedText)) {
            selectedCategories.add(cleanedText);
            render();
        }
    };

    const removeCategory = (text) => {
        selectedCategories.delete(text);
        render();
    };

    const handleAddAction = () => {
        addCategory(bulkCategoryInputField.value);
        bulkCategoryInputField.value = '';
        bulkCategoryInputField.focus();
    };
    bulkAddCategoryBtn.onclick = handleAddAction;
    bulkCategoryInputField.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddAction();
        }
    };
    
    render();
    
    return {
        getSelectedCategories: () => Array.from(selectedCategories)
    };
}

export function enterSelectionMode(card) {
  appState.isSelectionModeActive = true;
  pushState();
  elements.inventoryGrid.classList.add("selection-mode");
  if (card) {
    toggleSelection(card);
  }
}

export function exitSelectionMode() {
  appState.isSelectionModeActive = false;
  appState.selectedItemIds.clear();

  elements.inventoryGrid.classList.remove("selection-mode");
  elements.inventoryGrid
    .querySelectorAll(".product-card.selected")
    .forEach(card => card.classList.remove("selected"));

  updateBulkActionsBar();
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
    updateBulkActionsBar();
  }
}

async function handleBulkCategoryChange(e) {
  e.preventDefault();
  const newCategories = bulkCategoryInputManager.getSelectedCategories();
  if (newCategories.length === 0) {
      notifications.showStatus("يرجى اختيار فئة واحدة على الأقل.", "error");
      return;
  };
  const originalInventory = JSON.parse(JSON.stringify(appState.inventory));
  const selectedIds = Array.from(appState.selectedItemIds);

  selectedIds.forEach(id => {
    const item = appState.inventory.items.find(i => i.id === id);
    if (item) item.categories = newCategories;
  });
  saveLocalData();
  renderer.filterAndRenderItems(true);
  renderer.renderCategoryFilter();
  elements.bulkCategoryModal.close();
  exitSelectionMode();
  
  const syncToastId = notifications.showStatus("جاري حفظ تغيير الفئات...", "syncing");
  try {
    await api.saveInventory();
    notifications.hideStatus(syncToastId);
    notifications.showStatus("تم حفظ تغيير الفئات ومزامنتها بنجاح!", "success");

    const loggingPromises = selectedIds.map(id => {
        const originalItem = originalInventory.items.find(i => i.id === id);
        const updatedItem = appState.inventory.items.find(i => i.id === id);
        if (originalItem && updatedItem) {
            return logAction({
                action: ACTION_TYPES.CATEGORY_UPDATED,
                targetId: id,
                targetName: updatedItem.name,
                details: { from: originalItem.categories || [], to: updatedItem.categories }
            });
        }
        return Promise.resolve();
    });
    
    Promise.all(loggingPromises).catch(logError => {
        console.error("Bulk category logging failed:", logError);
        notifications.showStatus("تم حفظ التغييرات، لكن فشل تحديث سجل النشاط.", "warning");
    });

  } catch (error) {
    console.error("Bulk category sync failed, rolling back:", error);
    appState.inventory = originalInventory;
    saveLocalData();
    renderer.filterAndRenderItems(true);
    renderer.renderCategoryFilter();
    notifications.hideStatus(syncToastId);
    notifications.showStatus("فشل المزامنة! تم استرجاع البيانات.", "error");
  }
}

async function handleBulkSupplierChange(e) {
  e.preventDefault();
  const newSupplierId = e.target.elements["bulk-item-supplier"].value;
  if (!newSupplierId) return;

  const originalInventory = JSON.parse(JSON.stringify(appState.inventory));
  const selectedIds = Array.from(appState.selectedItemIds);

  selectedIds.forEach(id => {
    const item = appState.inventory.items.find(i => i.id === id);
    if (item) item.supplierId = newSupplierId;
  });
  saveLocalData();
  renderer.filterAndRenderItems(true);
  elements.bulkSupplierModal.close();
  exitSelectionMode();

  const syncToastId = notifications.showStatus("جاري حفظ تغيير المورّد...", "syncing");
  try {
    await api.saveInventory();
    notifications.hideStatus(syncToastId);
    notifications.showStatus("تم حفظ تغيير المورّد ومزامنته بنجاح!", "success");

    const getSupplierName = (supplierId) => {
        if (!supplierId) return "بلا مورّد";
        const supplier = appState.suppliers.find(s => s.id === supplierId);
        return supplier ? supplier.name : "مورّد محذوف";
    };

    const loggingPromises = selectedIds.map(id => {
        const originalItem = originalInventory.items.find(i => i.id === id);
        const updatedItem = appState.inventory.items.find(i => i.id === id);
        if (originalItem && updatedItem) {
            const fromSupplierName = getSupplierName(originalItem.supplierId);
            const toSupplierName = getSupplierName(updatedItem.supplierId);
            return logAction({
                action: ACTION_TYPES.SUPPLIER_UPDATED,
                targetId: id,
                targetName: updatedItem.name,
                details: { from: fromSupplierName, to: toSupplierName }
            });
        }
        return Promise.resolve();
    });

    Promise.all(loggingPromises).catch(logError => {
        console.error("Bulk supplier logging failed:", logError);
        notifications.showStatus("تم حفظ التغييرات، لكن فشل تحديث سجل النشاط.", "warning");
    });

  } catch (error) {
    console.error("Bulk supplier sync failed, rolling back:", error);
    appState.inventory = originalInventory;
    saveLocalData();
    renderer.filterAndRenderItems(true);
    notifications.hideStatus(syncToastId);
    notifications.showStatus("فشل المزامنة! تم استرجاع البيانات.", "error");
  }
}

export function setupBulkActionListeners(elements) {
  document
    .getElementById("bulk-change-category-btn")
    .addEventListener("click", () => {
      bulkCategoryInputManager = setupBulkCategoryInput();
      openModal(elements.bulkCategoryModal);
    });
  document
    .getElementById("bulk-change-supplier-btn")
    .addEventListener("click", () => {
      renderer.populateBulkSupplierDropdown();
      elements.bulkSupplierForm.reset();
      openModal(elements.bulkSupplierModal);
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
