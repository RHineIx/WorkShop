// js/handlers/modals/itemFormHandler.js
import { appState } from "../../state.js";
import * as api from "../../api.js";
import { generateUniqueSKU, compressImage } from "../../utils.js";
import { saveLocalData } from "../../app.js";
import { elements, openModal } from "../../ui.js";
import {
  filterAndRenderItems,
  renderCategoryFilter,
  populateSupplierDropdown,
  getAllUniqueCategories,
  updateProductCardImage,
} from "../../renderer.js";
import { showStatus, hideStatus } from "../../notifications.js";
import { logAction, ACTION_TYPES } from "../../logger.js";
import { setupCropperModalListeners } from "./cropperModalHandler.js";

let categoryInputManager = null;
let handleImageSelection;

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

export function setupItemFormModalListeners() {
  handleImageSelection = setupCropperModalListeners();

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
}