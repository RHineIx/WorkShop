// js/handlers/inventoryHandlers.js
import { appState } from "../state.js";
import { debounce } from "../utils.js";
import { openDetailsModal } from "../ui.js";
import { showStatus } from "../notifications.js";
import { filterAndRenderItems, renderCategoryFilter } from "../renderer.js";
import { openSaleModal } from "./modalHandlers.js";
import {
  enterSelectionMode,
  exitSelectionMode,
  toggleSelection,
} from "./bulkActionHandlers.js";
// State for pointer interactions to detect clicks vs. drags vs. long presses
let pointerDownTime = 0;
let pointerDownX = 0;
let pointerDownY = 0;
let isDragging = false;

// Configuration thresholds
const MOVE_THRESHOLD = 16; // Pixels
const LONG_PRESS_DURATION = 600; // Milliseconds

/**
 * Handles the logic for a short click on a product card.
 * @param {HTMLElement} card The product card element that was clicked.
 * @param {EventTarget} target The specific element that was the click target.
 */
function handleCardClick(card, target) {
  if (appState.isSelectionModeActive) {
    // In selection mode, any click (that isn't a button) toggles selection.
    if (!target.closest(".icon-btn")) {
      toggleSelection(card);
    }
  } else {
    // In normal mode, clicks trigger actions.
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
      // A click anywhere else on the card opens details.
      openDetailsModal(itemId);
    }
  }
}

/**
 * Handles the logic for a long press on a product card.
 * @param {HTMLElement} card The product card element.
 * @param {Event} event The original pointer event.
 */
function handleCardLongPress(card, event) {
  // Long press shouldn't trigger if it's on an action button.
  if (event.target.closest(".icon-btn")) {
    return;
  }

  if (navigator.vibrate) {
    navigator.vibrate(50);
  }

  if (!appState.isSelectionModeActive) {
    enterSelectionMode(card);
  } else {
    toggleSelection(card);
  }

  // Prevent any further events like context menu, etc.
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Initializes the pointer state on pointerdown.
 * @param {PointerEvent} e The pointer event.
 */
function handlePointerDown(e) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (!e.target.closest(".product-card")) return;

  isDragging = false;
  pointerDownTime = Date.now();
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
}

/**
 * Detects if the pointer is being dragged.
 * @param {PointerEvent} e The pointer event.
 */
function handlePointerMove(e) {
  if (isDragging || pointerDownTime === 0) return;
  const deltaX = Math.abs(e.clientX - pointerDownX);
  const deltaY = Math.abs(e.clientY - pointerDownY);
  if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
    isDragging = true;
    pointerDownTime = 0; // Reset to cancel click/long-press
  }
}

/**
 * The main event handler for pointerup, which orchestrates the interaction logic.
 * @param {PointerEvent} e The pointer event.
 */
function handlePointerUp(e) {
  const card = e.target.closest(".product-card");
  if (!card || isDragging || pointerDownTime === 0) {
    pointerDownTime = 0;
    isDragging = false;
    return;
  }

  const pressDuration = Date.now() - pointerDownTime;
  pointerDownTime = 0;
  if (pressDuration >= LONG_PRESS_DURATION) {
    handleCardLongPress(card, e);
  } else {
    handleCardClick(card, e.target);
  }
}

export function setupInventoryListeners(elements) {
  const clearSearchBtn = document.getElementById("clear-search-btn");

  // --- Event Delegation for the entire inventory grid ---
  elements.inventoryGrid.addEventListener("pointerdown", handlePointerDown);
  elements.inventoryGrid.addEventListener("pointermove", handlePointerMove);
  elements.inventoryGrid.addEventListener("pointerup", handlePointerUp);
  // Prevent context menu on long press (especially on mobile)
  elements.inventoryGrid.addEventListener("contextmenu", e =>
    e.preventDefault()
  );
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
  elements.categoryFilterBar.addEventListener("click", e => {
    const chip = e.target.closest(".category-chip");
    if (!chip) return;

    let category = chip.dataset.category;

    // If the clicked category is already active, reset to 'all'
    if (appState.selectedCategory === category) {
      category = "all";
    }

    appState.selectedCategory = category;

    // Visually update the chips
    const currentActive = elements.categoryFilterBar.querySelector(".active");
    if (currentActive) {
      currentActive.classList.remove("active");
    }
    // Find the new chip to activate (which might be the "all" chip)
    const newActiveChip = elements.categoryFilterBar.querySelector(
      `[data-category="${category}"]`
    );
    if (newActiveChip) {
      newActiveChip.classList.add("active");
    }

    filterAndRenderItems(true);
  });
}