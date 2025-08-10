// js/handlers/inventoryHandlers.js
import { appState } from "../state.js";
import * as ui from "../ui.js";
import { debounce } from "../utils.js";
import {
  enterSelectionMode,
  exitSelectionMode,
  toggleSelection,
} from "./bulkActionHandlers.js";

// --- GESTURE DETECTION LOGIC ---

// Module-scoped variables for gesture detection
let pointerDownTime = 0;
let pointerDownX = 0;
let pointerDownY = 0;
let isDragging = false; // Flag to determine if a scroll/drag has occurred

const moveThreshold = 16; // Pixels user can move before it's considered a drag
const longPressDuration = 600; // Milliseconds to hold for a long press

function handlePointerDown(e) {
  // We only care about the primary button (left-click or single touch)
  if (e.pointerType === "mouse" && e.button !== 0) return;

  const card = e.target.closest(".product-card");
  // The problematic line has been removed from here.
  // We only check if the click is outside a card.
  if (!card) {
    return;
  }

  isDragging = false;
  pointerDownTime = Date.now();
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
}

function handlePointerMove(e) {
  if (isDragging || pointerDownTime === 0) return;

  const deltaX = Math.abs(e.clientX - pointerDownX);
  const deltaY = Math.abs(e.clientY - pointerDownY);

  if (deltaX > moveThreshold || deltaY > moveThreshold) {
    isDragging = true; // It's a scroll gesture
  }
}

function handlePointerUp(e) {
  const card = e.target.closest(".product-card");
  if (!card) return;

  // If the pointer was dragged, it's a scroll, so do nothing.
  if (isDragging) {
    pointerDownTime = 0; // Reset state
    return;
  }

  const pressDuration = Date.now() - pointerDownTime;
  pointerDownTime = 0; // Reset state

  // It's a long press
  if (pressDuration >= longPressDuration && !e.target.closest(".icon-btn")) {
    if (navigator.vibrate) {
      navigator.vibrate(50); // Haptic feedback
    }

    if (!appState.isSelectionModeActive) {
      enterSelectionMode(card);
    } else {
      toggleSelection(card); // Allow toggling on long press too
    }

    // Prevent the click event that might follow
    e.preventDefault();
    e.stopPropagation();
  } else {
    // It's a normal tap/click
    if (appState.isSelectionModeActive) {
      // On selection mode, only toggle if the click is not on a button
      if (!e.target.closest(".icon-btn")) {
        toggleSelection(card);
      }
    } else {
      // This is a normal click action, we check if a button was the target
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
      // If the click was on the card itself but not a button, do nothing (or open details)
    }
  }
}

export function setupInventoryListeners(elements) {
  // --- Grid Interaction (Click and Long Press) ---
  elements.inventoryGrid.addEventListener("pointerdown", handlePointerDown);
  elements.inventoryGrid.addEventListener("pointermove", handlePointerMove);
  elements.inventoryGrid.addEventListener("pointerup", handlePointerUp);
  elements.inventoryGrid.addEventListener("contextmenu", e =>
    e.preventDefault()
  );

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
    ui.filterAndRenderItems(true); // Reset pagination
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
