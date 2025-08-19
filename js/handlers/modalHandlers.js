// js/handlers/modalHandlers.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { generateUniqueSKU, compressImage } from "../utils.js";
import { saveLocalData } from "../app.js";
import {
  showConfirmationModal,
  getQuantityChangeReason,
} from "../ui_helpers.js";
import {
  elements,
  openModal,
  updateSaleTotal,
  openDetailsModal,
} from "../ui.js";
import {
  filterAndRenderItems,
  renderCategoryFilter,
  populateSupplierDropdown,
  getAllUniqueCategories,
  updateProductCardImage,
} from "../renderer.js";
import { showStatus, hideStatus } from "../notifications.js";
import { logAction, ACTION_TYPES } from "../logger.js";

let cropper = null;
let cropperPadding = 0.1;
let cropperBgColor = "#FFFFFF";
let categoryInputManager = null;

function setupCategoryInput(currentItemCategories = []) {
  const {
    selectedCategoriesContainer,
    availableCategoriesList,
    categoryInputField,
    addCategoryBtn,
    categoryPillTemplate,
  } = elements;

  let selectedCategories = new Set(currentItemCategories);
  const allCategories = new Set(getAllUniqueCategories());

  const render = () => {
    selectedCategoriesContainer.innerHTML = "";
    availableCategoriesList.innerHTML = "";

    selectedCategories.forEach(text => {
      const pill = createPill(text, true);
      selectedCategoriesContainer.appendChild(pill);
    });

    allCategories.forEach(text => {
      if (!selectedCategories.has(text)) {
        const pill = createPill(text, false);
        availableCategoriesList.appendChild(pill);
      }
    });
  };

  const createPill = (text, isSelected) => {
    const clone = categoryPillTemplate.content.cloneNode(true);
    const pill = clone.querySelector(".category-pill");
    pill.querySelector(".pill-text").textContent = text;
    pill.dataset.value = text;

    if (isSelected) {
      const removeBtn = pill.querySelector(".remove-pill-btn");
      removeBtn.addEventListener("click", () => removeCategory(text));
    } else {
      pill.querySelector(".remove-pill-btn").remove();
      pill.addEventListener("click", () => addCategory(text));
    }
    return pill;
  };

  const addCategory = text => {
    const cleanedText = text.trim();
    if (cleanedText && !selectedCategories.has(cleanedText)) {
      selectedCategories.add(cleanedText);
      allCategories.add(cleanedText);
      render();
    }
  };

  const removeCategory = text => {
    selectedCategories.delete(text);
    render();
  };

  const handleAddAction = () => {
    addCategory(categoryInputField.value);
    categoryInputField.value = "";
    categoryInputField.focus();
  };

  const handleEnterKey = e => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddAction();
    }
  };

  addCategoryBtn.addEventListener("click", handleAddAction);
  categoryInputField.addEventListener("keydown", handleEnterKey);

  render();

  const cleanup = () => {
    addCategoryBtn.removeEventListener("click", handleAddAction);
    categoryInputField.removeEventListener("keydown", handleEnterKey);
  };

  return {
    getSelectedCategories: () => Array.from(selectedCategories),
    cleanup: cleanup,
  };
}

function handlePriceConversion(sourceInput, targetInput) {
  const sourceValue = parseFloat(sourceInput.value);
  const rate = appState.exchangeRate;
  if (!isNaN(sourceValue) && sourceValue > 0 && rate > 0) {
    const usdValue = sourceValue / rate;
    targetInput.value = usdValue.toFixed(2);
  } else {
    targetInput.value = 0;
  }
}

async function syncQuantityChange(
  originalInventory,
  itemBeforeEdit,
  currentItem,
  reason
) {
  const syncToastId = showStatus("جاري مزامنة تغيير الكمية...", "syncing");
  try {
    await api.saveInventory();
    await logAction({
      action: ACTION_TYPES.QUANTITY_UPDATED,
      targetId: currentItem.id,
      targetName: currentItem.name,
      details: {
        from: itemBeforeEdit.quantity,
        to: currentItem.quantity,
        reason: reason,
      },
    });
    hideStatus(syncToastId);
    showStatus("تمت مزامنة تغيير الكمية بنجاح!", "success");
  } catch (error) {
    console.error("Sync failed, rolling back:", error);
    appState.inventory = originalInventory;
    saveLocalData();
    filterAndRenderItems();
    hideStatus(syncToastId);

    if (error instanceof api.ConflictError) {
      showStatus("حدث تعارض قم بتحديث الصفحة اولاً.", "error", {
        duration: 0,
        showRefreshButton: true,
      });
    } else {
      showStatus("فشلت المزامنة! تم استرجاع البيانات.", "error");
    }
  }
}

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
      const { renderDashboard } = await import("../renderer.js");
      renderDashboard();
    }
    saveButton.disabled = false;
  }
}

function _getItemDataFromForm(itemId) {
  const categories = categoryInputManager.getSelectedCategories();
  return {
    id: itemId || `item_${Date.now()}`,
    sku: document.getElementById("item-sku").value,
    name: document.getElementById("item-name").value,
    categories: categories,
    oemPartNumber: document.getElementById("item-oem-pn").value.trim(),
    compatiblePartNumber: document
      .getElementById("item-compatible-pn")
      .value.trim(),
    quantity: parseInt(document.getElementById("item-quantity").value, 10) || 0,
    alertLevel:
      parseInt(document.getElementById("item-alert-level").value, 10) || 5,
    costPriceIqd:
      parseFloat(document.getElementById("item-cost-price-iqd").value) || 0,
    sellPriceIqd:
      parseFloat(document.getElementById("item-sell-price-iqd").value) || 0,
    costPriceUsd:
      parseFloat(document.getElementById("item-cost-price-usd").value) || 0,
    sellPriceUsd:
      parseFloat(document.getElementById("item-sell-price-usd").value) || 0,
    notes: document.getElementById("item-notes").value,
    supplierId: document.getElementById("item-supplier").value || null,
  };
}

async function _handleImageUploadAndUpdateState(itemData) {
  if (!appState.selectedImageFile) {
    return itemData;
  }

  const compressedBlob = await compressImage(appState.selectedImageFile);
  const blobUrl = URL.createObjectURL(compressedBlob);
  updateProductCardImage(itemData.id, blobUrl);

  const imagePath = await api.uploadImageToGitHub(
    compressedBlob,
    appState.selectedImageFile.name
  );
  itemData.imagePath = imagePath;

  const finalItemIndex = appState.inventory.items.findIndex(
    i => i.id === itemData.id
  );
  if (finalItemIndex !== -1) {
    appState.inventory.items[finalItemIndex].imagePath = imagePath;
    appState.imageCache.set(imagePath, blobUrl);
  }

  return itemData;
}

function _logItemChanges(originalItem, updatedItem) {
  const loggingPromises = [];

  if (!originalItem) {
    loggingPromises.push(
      logAction({
        action: ACTION_TYPES.ITEM_CREATED,
        targetId: updatedItem.id,
        targetName: updatedItem.name,
      })
    );
    return;
  }

  if (originalItem.name !== updatedItem.name) {
    loggingPromises.push(
      logAction({
        action: ACTION_TYPES.NAME_UPDATED,
        targetId: updatedItem.id,
        targetName: updatedItem.name,
        details: { from: originalItem.name, to: updatedItem.name },
      })
    );
  }
  if (originalItem.sku !== updatedItem.sku) {
    loggingPromises.push(
      logAction({
        action: ACTION_TYPES.SKU_UPDATED,
        targetId: updatedItem.id,
        targetName: updatedItem.name,
        details: { from: originalItem.sku, to: updatedItem.sku },
      })
    );
  }
  if (
    JSON.stringify(originalItem.categories || []) !==
    JSON.stringify(updatedItem.categories)
  ) {
    loggingPromises.push(
      logAction({
        action: ACTION_TYPES.CATEGORY_UPDATED,
        targetId: updatedItem.id,
        targetName: updatedItem.name,
        details: {
          from: originalItem.categories || [],
          to: updatedItem.categories,
        },
      })
    );
  }
  if (originalItem.quantity !== updatedItem.quantity) {
    loggingPromises.push(
      logAction({
        action: ACTION_TYPES.QUANTITY_UPDATED,
        targetId: updatedItem.id,
        targetName: updatedItem.name,
        details: {
          from: originalItem.quantity,
          to: updatedItem.quantity,
          reason: "تعديل مباشر",
        },
      })
    );
  }
  if (originalItem.sellPriceIqd !== updatedItem.sellPriceIqd) {
    loggingPromises.push(
      logAction({
        action: ACTION_TYPES.PRICE_UPDATED,
        targetId: updatedItem.id,
        targetName: updatedItem.name,
        details: {
          from: `${originalItem.sellPriceIqd} د.ع`,
          to: `${updatedItem.sellPriceIqd} د.ع`,
        },
      })
    );
  }
  if (originalItem.notes !== updatedItem.notes) {
    loggingPromises.push(
      logAction({
        action: ACTION_TYPES.NOTES_UPDATED,
        targetId: updatedItem.id,
        targetName: updatedItem.name,
      })
    );
  }
  if (originalItem.imagePath !== updatedItem.imagePath) {
    loggingPromises.push(
      logAction({
        action: ACTION_TYPES.IMAGE_UPDATED,
        targetId: updatedItem.id,
        targetName: updatedItem.name,
      })
    );
  }
  if (originalItem.supplierId !== updatedItem.supplierId) {
    loggingPromises.push(
      logAction({
        action: ACTION_TYPES.SUPPLIER_UPDATED,
        targetId: updatedItem.id,
        targetName: updatedItem.name,
      })
    );
  }

  if (loggingPromises.length > 0) {
    Promise.all(loggingPromises).catch(logError => {
      console.error("Audit log sync failed:", logError);
      showStatus("تم حفظ المنتج، لكن فشل تحديث سجل النشاط.", "warning");
    });
  }
}

async function handleItemFormSubmit(e) {
  e.preventDefault();
  const saveButton = document.getElementById("save-item-btn");
  saveButton.disabled = true;

  const originalInventory = JSON.parse(JSON.stringify(appState.inventory));
  const itemId = document.getElementById("item-id").value;
  const itemIndex = appState.inventory.items.findIndex(i => i.id === itemId);
  const originalItemForLog =
    itemIndex !== -1 ? { ...appState.inventory.items[itemIndex] } : null;

  let itemData = _getItemDataFromForm(itemId);
  if (originalItemForLog) {
    itemData.imagePath = originalItemForLog.imagePath;
  }

  const syncToastId = showStatus(
    appState.selectedImageFile ? "جاري رفع الصورة..." : "جاري حفظ المنتج...",
    "syncing"
  );

  if (itemIndex !== -1) {
    appState.inventory.items[itemIndex] = itemData;
  } else {
    appState.inventory.items.push(itemData);
  }

  elements.itemModal.close();

  try {
    itemData = await _handleImageUploadAndUpdateState(itemData);

    saveLocalData();
    filterAndRenderItems(true);
    renderCategoryFilter();

    await api.saveInventory();
    hideStatus(syncToastId);
    showStatus("تم الحفظ والمزامنة بنجاح!", "success");

    _logItemChanges(originalItemForLog, itemData);
  } catch (error) {
    console.error("Item form sync failed, rolling back:", error);
    appState.inventory = originalInventory;
    saveLocalData();
    filterAndRenderItems(true);
    renderCategoryFilter();
    hideStatus(syncToastId);

    if (error instanceof api.ConflictError) {
      showStatus("حدث تعارض قم بتحديث الصفحة اولاً.", "error", {
        duration: 0,
        showRefreshButton: true,
      });
    } else {
      showStatus("فشلت المزامنة! تم استرجاع البيانات.", "error");
    }
  } finally {
    saveButton.disabled = false;
    appState.selectedImageFile = null;
  }
}

export function openItemModal(itemId = null) {
  elements.itemForm.reset();
  appState.selectedImageFile = null;
  elements.imagePreview.src = "#";
  elements.imagePreview.classList.add("image-preview-hidden");
  elements.imagePlaceholder.style.display = "flex";
  elements.regenerateSkuBtn.style.display = "none";

  if (itemId) {
    const item = appState.inventory.items.find(i => i.id === itemId);
    if (item) {
      elements.modalTitle.textContent = "تعديل منتج";
      elements.itemIdInput.value = item.id;
      document.getElementById("item-sku").value = item.sku;
      document.getElementById("item-name").value = item.name;

      categoryInputManager = setupCategoryInput(item.categories || []);

      document.getElementById("item-oem-pn").value = item.oemPartNumber || "";
      document.getElementById("item-compatible-pn").value =
        item.compatiblePartNumber || "";
      document.getElementById("item-quantity").value = item.quantity;
      document.getElementById("item-alert-level").value = item.alertLevel;
      document.getElementById("item-cost-price-iqd").value =
        item.costPriceIqd || 0;
      document.getElementById("item-sell-price-iqd").value =
        item.sellPriceIqd || 0;
      document.getElementById("item-cost-price-usd").value =
        item.costPriceUsd || 0;
      document.getElementById("item-sell-price-usd").value =
        item.sellPriceUsd || 0;
      document.getElementById("item-notes").value = item.notes;
      populateSupplierDropdown(item.supplierId);
      if (item.imagePath) {
        if (item.imagePath.startsWith("http")) {
          elements.imagePreview.src = item.imagePath;
          elements.imagePreview.classList.remove("image-preview-hidden");
          elements.imagePlaceholder.style.display = "none";
        } else {
          api.fetchImageWithAuth(item.imagePath).then(blobUrl => {
            if (blobUrl) {
              elements.imagePreview.src = blobUrl;
              elements.imagePreview.classList.remove("image-preview-hidden");
              elements.imagePlaceholder.style.display = "none";
            }
          });
        }
      }
    }
  } else {
    elements.modalTitle.textContent = "إضافة منتج جديد";
    elements.itemIdInput.value = "";
    elements.regenerateSkuBtn.style.display = "flex";
    populateSupplierDropdown();

    categoryInputManager = setupCategoryInput([]);
  }
  openModal(elements.itemModal);
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

function handleImageSelection(file) {
  if (!file || !file.type.startsWith("image/")) {
    showStatus("الملف المحدد ليس صورة.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = event => {
    const { cropperModal, cropperImage, paddingDisplay, bgColorInput } =
      elements;
    cropperPadding = 0.1;
    cropperBgColor = "#FFFFFF";
    paddingDisplay.textContent = `${Math.round(cropperPadding * 100)}%`;
    bgColorInput.value = cropperBgColor;

    cropperImage.src = event.target.result;
    openModal(cropperModal);
    if (cropper) {
      cropper.destroy();
    }

    cropper = new Cropper(cropperImage, {
      aspectRatio: 1,
      viewMode: 1,
      background: false,
      autoCropArea: 0.8,
    });
  };
  reader.readAsDataURL(file);
}

export function setupModalListeners(elements) {
  elements.addItemBtn.addEventListener("click", () => {
    openItemModal();
    const existingSkus = new Set(
      appState.inventory.items.map(item => item.sku)
    );
    document.getElementById("item-sku").value = generateUniqueSKU(existingSkus);
  });
  elements.itemForm.addEventListener("submit", handleItemFormSubmit);

  elements.itemModal.addEventListener("close", () => {
    if (
      categoryInputManager &&
      typeof categoryInputManager.cleanup === "function"
    ) {
      categoryInputManager.cleanup();
      categoryInputManager = null;
    }
  });
  elements.cancelItemBtn.addEventListener("click", () =>
    elements.itemModal.close()
  );
  elements.regenerateSkuBtn.addEventListener("click", () => {
    const existingSkus = new Set(
      appState.inventory.items.map(item => item.sku)
    );
    document.getElementById("item-sku").value = generateUniqueSKU(existingSkus);
  });
  elements.imageUploadInput.addEventListener("change", e => {
    handleImageSelection(e.target.files[0]);
    e.target.value = "";
  });
  elements.pasteImageBtn.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard?.read) {
        showStatus("متصفحك لا يدعم لصق الصور.", "error");
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      const imageItem = clipboardItems.find(item =>
        item.types.some(type => type.startsWith("image/"))
      );
      if (imageItem) {
        const imageType = imageItem.types.find(type =>
          type.startsWith("image/")
        );
        const imageBlob = await imageItem.getType(imageType);
        const file = new File(
          [imageBlob],
          `pasted_image.${imageType.split("/")[1]}`,
          { type: imageBlob.type }
        );
        handleImageSelection(file);
      } else {
        showStatus("لا توجد صورة في الحافظة.", "warning");
      }
    } catch (error) {
      console.error("Failed to paste image:", error);
      showStatus(`فشل لصق الصورة: ${error.message}`, "error");
    }
  });
  document.getElementById("cancel-crop-btn").addEventListener("click", () => {
    elements.cropperModal.close();
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
  });
  document.getElementById("crop-image-btn").addEventListener("click", () => {
    if (!cropper) return;
    const croppedCanvas = cropper.getCroppedCanvas();
    if (!croppedCanvas) return;
    const finalSize =
      Math.max(croppedCanvas.width, croppedCanvas.height) /
      (1 - cropperPadding * 2);
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = finalSize;
    finalCanvas.height = finalSize;
    const ctx = finalCanvas.getContext("2d");
    ctx.fillStyle = cropperBgColor;
    ctx.fillRect(0, 0, finalSize, finalSize);
    ctx.drawImage(
      croppedCanvas,
      (finalSize - croppedCanvas.width) / 2,
      (finalSize - croppedCanvas.height) / 2
    );
    finalCanvas.toBlob(
      blob => {
        const { imagePreview, imagePlaceholder } = elements;
        const file = new File([blob], "cropped_image.webp", {
          type: "image/webp",
        });
        appState.selectedImageFile = file;
        imagePreview.src = URL.createObjectURL(file);
        imagePreview.classList.remove("image-preview-hidden");
        imagePlaceholder.style.display = "none";
        elements.cropperModal.close();
        cropper.destroy();
        cropper = null;
      },
      "image/webp",
      0.8
    );
  });
  elements.decreasePaddingBtn.addEventListener("click", () => {
    if (cropperPadding > 0) {
      cropperPadding = Math.max(0, cropperPadding - 0.05);
      elements.paddingDisplay.textContent = `${Math.round(
        cropperPadding * 100
      )}%`;
    }
  });
  elements.increasePaddingBtn.addEventListener("click", () => {
    if (cropperPadding < 0.4) {
      cropperPadding = Math.min(0.4, cropperPadding + 0.05);
      elements.paddingDisplay.textContent = `${Math.round(
        cropperPadding * 100
      )}%`;
    }
  });
  elements.bgColorInput.addEventListener(
    "input",
    e => (cropperBgColor = e.target.value)
  );

  const costIqdInput = document.getElementById("item-cost-price-iqd");
  const costUsdInput = document.getElementById("item-cost-price-usd");
  const sellIqdInput = document.getElementById("item-sell-price-iqd");
  const sellUsdInput = document.getElementById("item-sell-price-usd");
  costIqdInput.addEventListener("input", () =>
    handlePriceConversion(costIqdInput, costUsdInput)
  );
  sellIqdInput.addEventListener("input", () =>
    handlePriceConversion(sellIqdInput, sellUsdInput)
  );
  elements.detailsIncreaseBtn.addEventListener("click", () => {
    const item = appState.inventory.items.find(
      i => i.id === appState.currentItemId
    );
    const quantityInput = elements.detailsQuantityValue;
    if (item) {
      let qty = parseInt(quantityInput.value, 10) || 0;
      qty++;
      quantityInput.value = qty;
      item.quantity = qty;
    }
  });
  elements.detailsDecreaseBtn.addEventListener("click", () => {
    const item = appState.inventory.items.find(
      i => i.id === appState.currentItemId
    );
    const quantityInput = elements.detailsQuantityValue;
    if (item) {
      let qty = parseInt(quantityInput.value, 10) || 0;
      if (qty > 0) {
        qty--;
        quantityInput.value = qty;
        item.quantity = qty;
      }
    }
  });
  elements.detailsQuantityValue.addEventListener("change", e => {
    const item = appState.inventory.items.find(
      i => i.id === appState.currentItemId
    );
    if (item) {
      const newQty = parseInt(e.target.value, 10) || 0;
      if (newQty < 0) {
        e.target.value = 0;
        item.quantity = 0;
      } else {
        item.quantity = newQty;
      }
    }
  });
  elements.closeDetailsModalBtn.addEventListener("click", async () => {
    const itemBeforeEdit = appState.itemStateBeforeEdit;
    const currentItem = appState.inventory.items.find(
      i => i.id === appState.currentItemId
    );

    if (
      itemBeforeEdit &&
      currentItem &&
      itemBeforeEdit.quantity !== currentItem.quantity
    ) {
      const reason = await getQuantityChangeReason();
      if (reason !== null) {
        const originalInventory = JSON.parse(
          JSON.stringify(appState.inventory)
        );
        saveLocalData();
        filterAndRenderItems();
        syncQuantityChange(
          originalInventory,
          itemBeforeEdit,
          currentItem,
          reason
        );
      } else {
        const originalItemIndex = appState.inventory.items.findIndex(
          i => i.id === itemBeforeEdit.id
        );
        if (originalItemIndex !== -1) {
          appState.inventory.items[originalItemIndex] = itemBeforeEdit;
        }
        filterAndRenderItems();
      }
    }

    appState.itemStateBeforeEdit = null;
    appState.currentItemId = null;
    elements.detailsModal.close();
  });
  elements.detailsEditBtn.addEventListener("click", () => {
    elements.detailsModal.close();
    openItemModal(appState.currentItemId);
  });
  elements.detailsDeleteBtn.addEventListener("click", async () => {
    const itemToDelete = appState.inventory.items.find(
      item => item.id === appState.currentItemId
    );
    if (!itemToDelete) return;

    const confirmed = await showConfirmationModal({
      title: "تأكيد الحذف",
      message: `هل أنت متأكد من رغبتك في حذف المنتج "${itemToDelete.name}"؟ لا يمكن التراجع عن هذا الإجراء.`,
      confirmText: "نعم, قم بالحذف",
    });

    if (confirmed) {
      const originalInventory = JSON.parse(JSON.stringify(appState.inventory));
      const originalAuditLog = JSON.parse(JSON.stringify(appState.auditLog));

      const syncToastId = showStatus("جاري حذف المنتج...", "syncing");

      appState.inventory.items = appState.inventory.items.filter(
        item => item.id !== appState.currentItemId
      );
      elements.detailsModal.close();
      saveLocalData();
      filterAndRenderItems(true);

      try {
        await api.saveInventory();
        if (itemToDelete?.imagePath) {
          api
            .getGitHubDirectoryListing("images")
            .then(repoImages => {
              const imageFile = repoImages.find(
                file => file.path === itemToDelete.imagePath
              );
              if (imageFile)
                api.deleteFileFromGitHub(
                  imageFile.path,
                  imageFile.sha,
                  `Cleanup: Delete image for item ${itemToDelete.name}`
                );
            })
            .catch(err =>
              console.error("Could not fetch images to delete:", err)
            );
        }

        await logAction({
          action: ACTION_TYPES.ITEM_DELETED,
          targetId: itemToDelete.id,
          targetName: itemToDelete.name,
          details: { lastKnownSku: itemToDelete.sku },
        });
        hideStatus(syncToastId);
        showStatus("تم حذف المنتج بنجاح!", "success");
      } catch (error) {
        appState.inventory = originalInventory;
        appState.auditLog = originalAuditLog;
        saveLocalData();
        filterAndRenderItems(true);
        hideStatus(syncToastId);
        if (error instanceof api.ConflictError) {
          showStatus("حدث تعارض قم بتحديث الصفحة اولاً.", "error", {
            duration: 0,
            showRefreshButton: true,
          });
        } else {
          showStatus(`فشل الحذف: ${error.message}`, "error");
        }
      }
    }
  });

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
