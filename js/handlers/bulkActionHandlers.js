// js/handlers/bulkActionHandlers.js
import { appState } from "../state.js";
import * as ui from "../ui.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { pushState } from "../navigation.js";
import * as renderer from "../renderer.js";
import * as notifications from "../notifications.js";

let longPressTriggered = false;
let bulkCategoryInputManager = null;

function setupBulkCategoryInput() {
    const elements = ui.getDOMElements();
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
  const newCategories = bulkCategoryInputManager.getSelectedCategories();
  
  if (newCategories.length === 0) {
      notifications.showStatus("يرجى اختيار فئة واحدة على الأقل.", "error");
      return;
  };

  const originalInventory = JSON.parse(JSON.stringify(appState.inventory));

  appState.selectedItemIds.forEach(id => {
    const item = appState.inventory.items.find(i => i.id === id);
    if (item) item.categories = newCategories;
  });

  saveLocalData();
  renderer.filterAndRenderItems(true);
  renderer.renderCategoryFilter();
  ui.getDOMElements().bulkCategoryModal.close();
  exitSelectionMode();
  notifications.showStatus("تم تحديث الفئات محليًا.", "success", { duration: 2000 });

  const syncToastId = notifications.showStatus("جاري مزامنة الفئات...", "syncing");
  try {
    await api.saveInventory();
    notifications.updateStatus(syncToastId, "تمت مزامنة الفئات بنجاح!", "success");
  } catch (error) {
    console.error("Bulk category sync failed, rolling back:", error);
    appState.inventory = originalInventory;
    saveLocalData();
    renderer.filterAndRenderItems(true);
    renderer.renderCategoryFilter();
    notifications.updateStatus(syncToastId, "فشل المزامنة! تم استرجاع البيانات.", "error");
  }
}

async function handleBulkSupplierChange(e) {
  e.preventDefault();
  const newSupplierId = e.target.elements["bulk-item-supplier"].value;
  if (!newSupplierId) return;

  const originalInventory = JSON.parse(JSON.stringify(appState.inventory));

  appState.selectedItemIds.forEach(id => {
    const item = appState.inventory.items.find(i => i.id === id);
    if (item) item.supplierId = newSupplierId;
  });

  saveLocalData();
  renderer.filterAndRenderItems(true);
  ui.getDOMElements().bulkSupplierModal.close();
  exitSelectionMode();
  notifications.showStatus("تم تحديث المورّد محليًا.", "success", { duration: 2000 });

  const syncToastId = notifications.showStatus("جاري مزامنة المورّد...", "syncing");
  try {
    await api.saveInventory();
    notifications.updateStatus(syncToastId, "تمت مزامنة المورّد بنجاح!", "success");
  } catch (error) {
    console.error("Bulk supplier sync failed, rolling back:", error);
    appState.inventory = originalInventory;
    saveLocalData();
    renderer.filterAndRenderItems(true);
    notifications.updateStatus(syncToastId, "فشل المزامنة! تم استرجاع البيانات.", "error");
  }
}

export function setupBulkActionListeners(elements) {
  document
    .getElementById("bulk-change-category-btn")
    .addEventListener("click", () => {
      bulkCategoryInputManager = setupBulkCategoryInput();
      ui.openModal(elements.bulkCategoryModal);
    });
  document
    .getElementById("bulk-change-supplier-btn")
    .addEventListener("click", () => {
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