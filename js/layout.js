// js/layout.js
import { elements } from "./dom.js";

/**
 * Measures the actual height of the main header and sets the 'top' position
 * for the sticky inventory header, ensuring it never overlaps.
 */
function adjustInventoryHeaderPosition() {
  const pageControls = document.querySelector(".page-controls");
  const inventoryHeader = document.getElementById("inventory-header");

  if (!pageControls || !inventoryHeader) return;

  const headerHeight = pageControls.offsetHeight;
  // Add 8px gap for spacing between the two headers when sticky
  inventoryHeader.style.top = `${headerHeight + 4}px`;
}

/**
 * Sets up dynamic layout adjustments that need to be calculated with JavaScript.
 */
export function setupLayoutAdjustments() {
  // Adjust on initial load
  adjustInventoryHeaderPosition();

  // Adjust on window resize, debounced for performance
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(adjustInventoryHeaderPosition, 100);
  });
}