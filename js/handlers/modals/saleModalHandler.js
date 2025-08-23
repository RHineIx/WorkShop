// js/handlers/modals/saleModalHandler.js
import { appState } from "../../state.js";
import * as api from "../../api.js";
import { saveLocalData } from "../../app.js";
import { elements, openModal, updateSaleTotal } from "../../ui.js";
import { filterAndRenderItems } from "../../renderer.js";
import { showStatus, hideStatus } from "../../notifications.js";
import { logAction, ACTION_TYPES } from "../../logger.js";

async function handleSaleFormSubmit(e) {
  e.preventDefault();
  const saveButton = document.getElementById("confirm-sale-btn");
  saveButton.disabled = true;

  const itemId = document.getElementById("sale-item-id").value;
  const item = appState.inventory.items.find(i => i.id === itemId);
  const quantityToSell = parseInt(
    document.getElementById("sale-quantity").value,
    10
  );
  if (!item || item.quantity < quantityToSell || quantityToSell <= 0) {
    showStatus("خطأ في البيانات أو الكمية غير متوفرة.", "error");
    saveButton.disabled = false;
    return;
  }

  const originalInventory = JSON.parse(JSON.stringify(appState.inventory));
  const originalSales = JSON.parse(JSON.stringify(appState.sales));

  const salePrice = parseFloat(document.getElementById("sale-price").value);
  const saleRecord = {
    saleId: `sale_${Date.now()}`,
    itemId: item.id,
    itemName: item.name,
    quantitySold: quantityToSell,
    sellPriceIqd:
      appState.activeCurrency === "IQD" ? salePrice : item.sellPriceIqd,
    costPriceIqd: item.costPriceIqd || 0,
    sellPriceUsd:
      appState.activeCurrency !== "IQD" ? salePrice : item.sellPriceUsd,
    costPriceUsd: item.costPriceUsd || 0,
    saleDate: document.getElementById("sale-date").value,
    notes: document.getElementById("sale-notes").value,
    timestamp: new Date().toISOString(),
  };
  const syncToastId = showStatus("جاري تسجيل البيع...", "syncing");

  item.quantity -= quantityToSell;
  appState.sales.push(saleRecord);

  saveLocalData();
  filterAndRenderItems(true);
  elements.saleModal.close();
  try {
    await api.saveInventory();
    await api.saveSales();
    await logAction({
      action: ACTION_TYPES.SALE_RECORDED,
      targetId: item.id,
      targetName: item.name,
      details: { quantity: quantityToSell, saleId: saleRecord.saleId },
    });
    hideStatus(syncToastId);
    showStatus("تم تسجيل البيع ومزامنته بنجاح!", "success");
  } catch (error) {
    console.error("Sale sync failed, rolling back:", error);
    appState.inventory = originalInventory;
    appState.sales = originalSales;
    saveLocalData();
    filterAndRenderItems(true);
    hideStatus(syncToastId);

    if (error instanceof api.ConflictError) {
      showStatus("حدث تعارض قم بتحديث الصفحة اولاً.", "error", {
        duration: 0,
        showRefreshButton: true,
      });
    } else {
      showStatus("فشل مزامنة البيع! تم استرجاع البيانات.", "error");
    }
  } finally {
    if (appState.currentView === "dashboard") {
      const { renderDashboard } = await import("../../renderer.js");
      renderDashboard();
    }
    saveButton.disabled = false;
  }
}

export function openSaleModal(itemId) {
  const item = appState.inventory.items.find(i => i.id === itemId);
  if (!item) return;
  elements.saleForm.reset();
  elements.saleItemIdInput.value = item.id;
  elements.saleItemName.textContent = item.name;

  const saleQuantityInput = document.getElementById("sale-quantity");
  const salePriceInput = document.getElementById("sale-price");

  const isIQD = appState.activeCurrency === "IQD";
  const price = isIQD ? item.sellPriceIqd || 0 : item.sellPriceUsd || 0;
  const symbol = isIQD ? "د.ع" : "$";
  elements.salePriceCurrency.textContent = symbol;
  salePriceInput.value = price;
  salePriceInput.step = isIQD ? "250" : "0.01";
  saleQuantityInput.value = 1;
  saleQuantityInput.max = item.quantity;
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  document.getElementById("sale-date").value = `${year}-${month}-${day}`;

  openModal(elements.saleModal);
  updateSaleTotal();
}

export function setupSaleModalListeners() {
  elements.saleForm.addEventListener("submit", handleSaleFormSubmit);
  elements.cancelSaleBtn.addEventListener("click", () =>
    elements.saleModal.close()
  );

  elements.saleIncreaseBtn.addEventListener("click", () => {
    const quantityInput = elements.saleQuantityInput;
    const max = parseInt(quantityInput.max, 10);
    let currentValue = parseInt(quantityInput.value, 10);
    if (currentValue < max) {
      quantityInput.value = currentValue + 1;
      updateSaleTotal();
    }
  });

  elements.saleDecreaseBtn.addEventListener("click", () => {
    const quantityInput = elements.saleQuantityInput;
    let currentValue = parseInt(quantityInput.value, 10);
    if (currentValue > 1) {
      quantityInput.value = currentValue - 1;
      updateSaleTotal();
    }
  });

  elements.saleQuantityInput.addEventListener("input", updateSaleTotal);
  document
    .getElementById("sale-price")
    .addEventListener("input", updateSaleTotal);
}