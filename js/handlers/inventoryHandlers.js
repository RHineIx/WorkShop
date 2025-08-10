// js/handlers/inventoryHandlers.js
import { appState } from "../state.js";
import * as ui from "../ui.js";
import { debounce } from "../utils.js";
import {
  enterSelectionMode,
  exitSelectionMode,
  toggleSelection,
  isLongPressTriggered,
  setLongPressTriggered,
} from "./bulkActionHandlers.js";

// Module-scoped variables for long-press detection
let pressTimer = null;

// Variables to detect scroll vs. long press
let startX = 0;
let startY = 0;
const moveThreshold = 10; // The distance in pixels to count as a scroll

function startPressTimer(card, event) {
  startX = event.clientX;
  startY = event.clientY;
  setLongPressTriggered(false);

  pressTimer = setTimeout(() => {
    setLongPressTriggered(true);
    if (!appState.isSelectionModeActive) {
      enterSelectionMode(card);
    }
  }, 500);
}

function clearPressTimerOnMove(event) {
  if (!pressTimer) return;

  const deltaX = Math.abs(event.clientX - startX);
  const deltaY = Math.abs(event.clientY - startY);

  if (deltaX > moveThreshold || deltaY > moveThreshold) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function clearPressTimerOnUp() {
  clearTimeout(pressTimer);
  pressTimer = null;
}

function handleGridClick(e) {
  const card = e.target.closest(".product-card");
  if (!card) return;

  // If a long press was just triggered, consume the click and do nothing
  if (isLongPressTriggered()) {
    setLongPressTriggered(false);
    return;
  }

  clearTimeout(pressTimer);

  // If we are in selection mode, the click should toggle selection
  if (appState.isSelectionModeActive) {
    toggleSelection(card);
    return;
  }

  // Handle normal clicks for sell/details buttons
  const itemId = card.dataset.id;
  if (e.target.closest(".sell-btn")) {
    const item = appState.inventory.items.find(i => i.id === itemId);
    if (item && item.quantity > 0) {
      ui.openSaleModal(itemId);
    } else {
      ui.showStatus("هذا المنتج نافد من المخزون.", "error");
    }
  } else if (e.target.closest(".details-btn")) {
    ui.openDetailsModal(itemId);
  }
}

export function setupInventoryListeners(elements) {
  // --- Grid Interaction (Click and Long Press) ---
  elements.inventoryGrid.addEventListener("pointerdown", e => startPressTimer(e.target.closest(".product-card"), e));
  elements.inventoryGrid.addEventListener("pointermove", clearPressTimerOnMove);
  elements.inventoryGrid.addEventListener("pointerup", clearPressTimerOnUp);
  elements.inventoryGrid.addEventListener("click", handleGridClick);
  elements.inventoryGrid.addEventListener("contextmenu", e => e.preventDefault());

  // --- Search, Sort, Filter ---
  elements.searchBar.addEventListener(
    "input",
    debounce(e => {
      appState.searchTerm = e.target.value;
      ui.filterAndRenderItems(true); // Reset pagination
    }, 300)
  );

  elements.sortOptions.addEventListener("change", e => {
    appState.currentSortOption = e.target.value;
    ui.filterAndRenderItems(true);
  });

  elements.statsContainer.addEventListener("click", e => {
    const card = e.target.closest(".stat-card");
    if (!card) return;
    if (appState.isSelectionModeActive) exitSelectionMode();

    appState.searchTerm = "";
    elements.searchBar.value = "";

    if (card.classList.contains("low-stock-alert")) {
      appState.activeFilter =
        appState.activeFilter === "low_stock" ? "all" : "low_stock";
    } else {
      appState.activeFilter = "all";
      appState.selectedCategory = "all";
      ui.renderCategoryFilter();
    }
    ui.filterAndRenderItems(true);
  });

  elements.categoryFilterBtn.addEventListener("click", e => {
    e.stopPropagation();
    elements.categoryFilterDropdown.classList.toggle("show");
  });
  elements.categoryFilterDropdown.addEventListener("click", e => {
    const categoryItem = e.target.closest(".category-item");
    if (categoryItem) {
      appState.selectedCategory = categoryItem.dataset.category;
      ui.filterAndRenderItems(true);
      ui.renderCategoryFilter();
      elements.categoryFilterDropdown.classList.remove("show");
    }
  });

  document.addEventListener("click", e => {
    if (!elements.searchContainer.contains(e.target)) {
      elements.categoryFilterDropdown.classList.remove("show");
    }
  });
}