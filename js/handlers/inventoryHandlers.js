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

let pointerDownTime = 0;
let pointerDownX = 0;
let pointerDownY = 0;
let isDragging = false;

const moveThreshold = 16;
const longPressDuration = 600;

function handlePointerDown(e) {
  if (e.pointerType === "mouse" && e.button !== 0) return;

  const card = e.target.closest(".product-card");
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
    isDragging = true;
  }
}

function handlePointerUp(e) {
  const card = e.target.closest(".product-card");
  if (!card) return;

  if (isDragging) {
    pointerDownTime = 0;
    return;
  }

  const pressDuration = Date.now() - pointerDownTime;
  pointerDownTime = 0;

  if (pressDuration >= longPressDuration && !e.target.closest(".icon-btn")) {
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    if (!appState.isSelectionModeActive) {
      enterSelectionMode(card);
    } else {
      toggleSelection(card);
    }

    e.preventDefault();
    e.stopPropagation();
  } else {
    if (appState.isSelectionModeActive) {
      if (!e.target.closest(".icon-btn")) {
        toggleSelection(card);
      }
    } else {
      const itemId = card.dataset.id;
      if (e.target.closest(".sell-btn")) {
        const item = appState.inventory.items.find(i => i.id === itemId);
        if (item && item.quantity > 0) {
          openSaleModal(itemId);
        } else {
          showStatus("هذا المنتج نافد من المخزون.", "error");
        }
      } else if (e.target.closest(".details-btn")) {
        openDetailsModal(itemId);
      } else {
        // Handle a click on the card itself, but not on the buttons
        openDetailsModal(itemId);
      }
    }
  }
}

export function setupInventoryListeners(elements) {
  elements.inventoryGrid.addEventListener("pointerdown", handlePointerDown);
  elements.inventoryGrid.addEventListener("pointermove", handlePointerMove);
  elements.inventoryGrid.addEventListener("pointerup", handlePointerUp);
  elements.inventoryGrid.addEventListener("contextmenu", e =>
    e.preventDefault()
  );

  elements.searchBar.addEventListener(
    "input",
    debounce(e => {
      appState.searchTerm = e.target.value;
      filterAndRenderItems(true);
    }, 300)
  );
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

    const category = chip.dataset.category;
    if (appState.selectedCategory === category) return;

    appState.selectedCategory = category;

    const currentActive = elements.categoryFilterBar.querySelector(".active");
    if (currentActive) {
      currentActive.classList.remove("active");
    }
    chip.classList.add("active");

    filterAndRenderItems(true);
  });
}