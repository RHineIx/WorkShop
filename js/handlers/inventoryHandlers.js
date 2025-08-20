// js/handlers/inventoryHandlers.js
import { appState } from "../state.js";
import { debounce } from "../utils.js";
import { openDetailsModal } from "../ui.js";
import { showStatus, hideStatus } from "../notifications.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { logAction, ACTION_TYPES } from "../logger.js";
import {
  filterAndRenderItems,
  renderCategoryFilter,
  getAllUniqueCategories,
} from "../renderer.js";
import { openSaleModal } from "./modalHandlers.js";
import {
  enterSelectionMode,
  exitSelectionMode,
  toggleSelection,
} from "./bulkActionHandlers.js";
import { getNewCategoryName } from "../ui_helpers.js";

// --- Unified State for Pointer Interactions ---
let pointerDownTime = 0;
let pointerDownX = 0;
let pointerDownY = 0;
let isDragging = false;

// --- Configuration Thresholds ---
const MOVE_THRESHOLD = 10; // Pixels
const LONG_PRESS_DURATION = 600; // Milliseconds

// --- Handlers for Product Cards ---
function handleCardClick(card, target) {
  if (appState.isSelectionModeActive) {
    if (!target.closest(".icon-btn")) {
      toggleSelection(card);
    }
  } else {
    const itemId = card.dataset.id;
    if (target.closest(".sell-btn")) {
      const item = appState.inventory.items.find(i => i.id === itemId);
      if (item && item.quantity > 0) {
        openSaleModal(itemId);
      } else {
        showStatus("هذا المنتج نافد من المخزون.", "error");
      }
    } else if (target.closest(".details-btn")) {
      openDetailsModal(itemId);
    } else {
      openDetailsModal(itemId);
    }
  }
}

function handleCardLongPress(card) {
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }
  if (!appState.isSelectionModeActive) {
    enterSelectionMode(card);
  } else {
    toggleSelection(card);
  }
}

// --- Handlers for Category Chips ---
function handleCategoryClick(chip) {
  let category = chip.dataset.category;
  if (appState.selectedCategory === category) {
    category = "all";
  }
  appState.selectedCategory = category;
  const currentActive = document.querySelector(".category-filter-bar .active");
  if (currentActive) currentActive.classList.remove("active");

  const newActiveChip = document.querySelector(
    `.category-filter-bar [data-category="${category}"]`
  );
  if (newActiveChip) newActiveChip.classList.add("active");

  filterAndRenderItems(true);
}

function handleCategoryLongPress(chip) {
  const category = chip.dataset.category;
  if (category === "all" || category === "_uncategorized_") {
    return;
  }
  if (navigator.vibrate) navigator.vibrate(50);
  activateCategoryEditMode(chip);
}

// --- Category Edit Logic ---
function deactivateCategoryEditMode() {
  const activeChip = document.querySelector(".category-chip.edit-active");
  if (activeChip) {
    const editBtn = activeChip.querySelector(".category-edit-btn");
    if (editBtn) editBtn.remove();
    activeChip.classList.remove("edit-active");
  }
  document.removeEventListener("click", clickAwayHandler);
}

function clickAwayHandler(e) {
  if (!e.target.closest(".category-chip.edit-active")) {
    deactivateCategoryEditMode();
  }
}

async function handleCategoryRename(chip) {
  const oldName = chip.dataset.category;
  const newName = await getNewCategoryName(oldName);

  deactivateCategoryEditMode();

  if (!newName || newName.trim() === "" || newName === oldName) {
    return;
  }

  const trimmedNewName = newName.trim();
  const allCategories = getAllUniqueCategories();
  if (
    allCategories.some(
      c =>
        c.toLowerCase() === trimmedNewName.toLowerCase() &&
        c.toLowerCase() !== oldName.toLowerCase()
    )
  ) {
    showStatus("اسم الفئة هذا موجود بالفعل.", "error");
    return;
  }

  const originalInventory = JSON.parse(JSON.stringify(appState.inventory));

  appState.inventory.items.forEach(item => {
    if (item.categories && item.categories.includes(oldName)) {
      item.categories = item.categories.map(c =>
        c === oldName ? trimmedNewName : c
      );
    }
  });
  saveLocalData();
  renderCategoryFilter();
  filterAndRenderItems(true);

  const syncToastId = showStatus("جاري تعديل الفئة...", "syncing");
  try {
    await api.saveInventory();
    await logAction({
      action: ACTION_TYPES.CATEGORY_RENAMED,
      targetId: "categories",
      targetName: "All Categories",
      details: { from: oldName, to: trimmedNewName },
    });
    hideStatus(syncToastId);
    showStatus("تم تعديل الفئة بنجاح!", "success");
  } catch (error) {
    console.error("Category rename sync failed, rolling back:", error);
    appState.inventory = originalInventory;
    saveLocalData();
    renderCategoryFilter();
    filterAndRenderItems(true);
    hideStatus(syncToastId);
    showStatus("فشل تعديل الفئة! تم استرجاع البيانات.", "error");
  }
}

function activateCategoryEditMode(chip) {
  deactivateCategoryEditMode();
  // Deactivate any other active chip first
  chip.classList.add("edit-active");

  const editBtn = document.createElement("button");
  editBtn.className = "category-edit-btn";
  editBtn.title = "تعديل الاسم";
  editBtn.innerHTML = `<iconify-icon icon="material-symbols:edit-outline-rounded" style="font-size: 16px;"></iconify-icon>`;

  editBtn.addEventListener("click", e => {
    e.stopPropagation();
    handleCategoryRename(chip);
  });
  chip.appendChild(editBtn);
  setTimeout(() => document.addEventListener("click", clickAwayHandler), 0);
}

// --- Generic Pointer Event Handlers ---
function handlePointerDown(e) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (!e.target.closest(".product-card") && !e.target.closest(".category-chip"))
    return;

  isDragging = false;
  pointerDownTime = Date.now();
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
}

function handlePointerMove(e) {
  if (pointerDownTime === 0 || isDragging) return;
  const deltaX = Math.abs(e.clientX - pointerDownX);
  const deltaY = Math.abs(e.clientY - pointerDownY);

  if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
    isDragging = true;
    pointerDownTime = 0; // Invalidate press
  }
}

function handlePointerUp(e) {
  if (isDragging || pointerDownTime === 0) {
    isDragging = false;
    pointerDownTime = 0;
    return;
  }

  const pressDuration = Date.now() - pointerDownTime;

  const card = e.target.closest(".product-card");
  const chip = e.target.closest(".category-chip");
  if (pressDuration >= LONG_PRESS_DURATION) {
    if (card) handleCardLongPress(card);
    if (chip) handleCategoryLongPress(chip);
  } else {
    if (card) handleCardClick(card, e.target);
    if (chip) handleCategoryClick(chip);
  }

  pointerDownTime = 0;
}

export function setupInventoryListeners(elements) {
  const clearSearchBtn = document.getElementById("clear-search-btn");

  // --- Main Grid Listeners ---
  elements.inventoryGrid.addEventListener("pointerdown", handlePointerDown);
  elements.inventoryGrid.addEventListener("pointermove", handlePointerMove);
  elements.inventoryGrid.addEventListener("pointerup", handlePointerUp);
  elements.inventoryGrid.addEventListener("contextmenu", e =>
    e.preventDefault()
  );

  // --- Category Bar Listeners ---
  elements.categoryFilterBar.addEventListener("pointerdown", handlePointerDown);
  elements.categoryFilterBar.addEventListener("pointermove", handlePointerMove);
  elements.categoryFilterBar.addEventListener("pointerup", handlePointerUp);
  elements.categoryFilterBar.addEventListener("contextmenu", e =>
    e.preventDefault()
  );
  // --- Other Control Listeners ---
  elements.searchBar.addEventListener(
    "input",
    debounce(e => {
      const hasValue = e.target.value.trim() !== "";
      clearSearchBtn.classList.toggle("visible", hasValue);
      appState.searchTerm = e.target.value;
      filterAndRenderItems(true);
    }, 300)
  );
  clearSearchBtn.addEventListener("click", () => {
    elements.searchBar.value = "";
    appState.searchTerm = "";
    clearSearchBtn.classList.remove("visible");
    filterAndRenderItems(true);
    elements.searchBar.focus();
  });
  elements.sortOptions.addEventListener("change", e => {
    appState.currentSortOption = e.target.value;
    filterAndRenderItems(true);
  });
  elements.statsContainer.addEventListener("click", e => {
    const card = e.target.closest(".stat-card");
    if (!card) return;
    if (appState.isSelectionModeActive) exitSelectionMode();

    appState.searchTerm = "";
    elements.searchBar.value = "";
    clearSearchBtn.classList.remove("visible");

    if (card.classList.contains("low-stock-alert")) {
      appState.activeFilter =
        appState.activeFilter === "low_stock" ? "all" : "low_stock";
    } else {
      appState.activeFilter = "all";
      appState.selectedCategory = "all";
      renderCategoryFilter();
    }
    filterAndRenderItems(true);
  });
                                                              }
