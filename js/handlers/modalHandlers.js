// js/handlers/modalHandlers.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { ConflictError } from "../api.js";
import { generateUniqueSKU, compressImage } from "../utils.js";
import { saveLocalData } from "../app.js";
import {
  showConfirmationModal,
  getQuantityChangeReason,
} from "../ui_helpers.js";
import {
  getDOMElements,
  openModal,
  updateSaleTotal,
  openDetailsModal,
} from "../ui.js";
import {
  filterAndRenderItems,
  renderCategoryFilter,
  populateCategoryDatalist,
  populateSupplierDropdown,
} from "../renderer.js";
import { showStatus, hideSyncStatus } from "../notifications.js";
import { logAction, ACTION_TYPES } from "../logger.js";

let cropper = null;
let cropperPadding = 0.1;
let cropperBgColor = "#FFFFFF";
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

async function saveQuantityChanges(currentItem, reason) {
  showStatus("التحقق من البيانات...", "syncing");
  const itemBeforeEdit = appState.itemStateBeforeEdit;
  try {
    const { data: latestInventory, sha: latestSha } =
      await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      hideSyncStatus();
      showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      const originalItemIndex = appState.inventory.items.findIndex(
        i => i.id === itemBeforeEdit.id
      );
      if (originalItemIndex !== -1) {
        appState.inventory.items[originalItemIndex] = itemBeforeEdit;
      }
      filterAndRenderItems();
      return;
    }

    showStatus("جاري حفظ تغيير الكمية...", "syncing");
    appState.inventory = latestInventory;
    appState.fileSha = latestSha;

    const itemToUpdate = appState.inventory.items.find(
      i => i.id === currentItem.id
    );
    if (itemToUpdate) {
      itemToUpdate.quantity = currentItem.quantity;
    }
    await api.saveToGitHub();
    saveLocalData();
    filterAndRenderItems();

    hideSyncStatus();
    showStatus("تم حفظ التغييرات بنجاح!", "success");

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
  } catch (error) {
    hideSyncStatus();
    const originalItemIndex = appState.inventory.items.findIndex(
      i => i.id === itemBeforeEdit.id
    );
    if (originalItemIndex !== -1) {
      appState.inventory.items[originalItemIndex] = itemBeforeEdit;
    }
    filterAndRenderItems();
    showStatus("فشل حفظ التغييرات.", "error", { duration: 4000 });
  }
}

async function handleSaleFormSubmit(e) {
  e.preventDefault();
  const saveButton = document.getElementById("confirm-sale-btn");
  saveButton.disabled = true;
  showStatus("التحقق من البيانات...", "syncing");

  try {
    const { sha: latestSha } = await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      hideSyncStatus();
      showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      saveButton.disabled = false;
      return;
    }

    const itemId = document.getElementById("sale-item-id").value;
    const item = appState.inventory.items.find(i => i.id === itemId);
    const quantityToSell = parseInt(
      document.getElementById("sale-quantity").value,
      10
    );
    const salePrice = parseFloat(document.getElementById("sale-price").value);

    if (!item || item.quantity < quantityToSell || quantityToSell <= 0) {
      hideSyncStatus();
      showStatus("خطأ في البيانات أو الكمية غير متوفرة.", "error");
      saveButton.disabled = false;
      return;
    }

    showStatus("جاري تسجيل البيع...", "syncing");
    const originalQuantity = item.quantity;
    item.quantity -= quantityToSell;

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
    appState.sales.push(saleRecord);
    filterAndRenderItems(true);

    try {
      await api.saveToGitHub();
      await api.saveSales();
      saveLocalData();
      getDOMElements().saleModal.close();
      hideSyncStatus();
      showStatus("تم تسجيل البيع بنجاح!", "success");

      await logAction({
        action: ACTION_TYPES.SALE_RECORDED,
        targetId: item.id,
        targetName: item.name,
        details: { quantity: quantityToSell, saleId: saleRecord.saleId },
      });
    } catch (saveError) {
      item.quantity = originalQuantity;
      appState.sales.pop();
      filterAndRenderItems();
      throw saveError;
    }
  } catch (error) {
    hideSyncStatus();
    if (!(error instanceof ConflictError)) {
      showStatus(`فشل تسجيل البيع: ${error.message}`, "error");
    }
  } finally {
    if (appState.currentView === "dashboard") {
      const { renderDashboard } = await import("../renderer.js");
      renderDashboard();
    }
    saveButton.disabled = false;
  }
}

export function openItemModal(itemId = null) {
  const elements = getDOMElements();
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
      document.getElementById("item-category").value = item.category;
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
  }
  openModal(elements.itemModal);
}

export function openSaleModal(itemId) {
  const elements = getDOMElements();
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

async function handleItemFormSubmit(e) {
  e.preventDefault();
  const saveButton = document.getElementById("save-item-btn");
  saveButton.disabled = true;
  showStatus("التحقق من البيانات...", "syncing");

  try {
    const { data: latestInventory, sha: latestSha } =
      await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      hideSyncStatus();
      showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      saveButton.disabled = false;
      return;
    }

    showStatus("جاري الحفظ...", "syncing");
    appState.inventory = latestInventory;
    appState.fileSha = latestSha;
    const itemId = document.getElementById("item-id").value;

    const existingItemIndex = appState.inventory.items.findIndex(
      i => i.id === itemId
    );
    const originalItem =
      existingItemIndex !== -1
        ? JSON.parse(
            JSON.stringify(appState.inventory.items[existingItemIndex])
          )
        : null;
    let imagePath = originalItem ? originalItem.imagePath : null;

    if (appState.selectedImageFile) {
      showStatus("جاري ضغط ورفع الصورة...", "syncing");
      const compressedImageBlob = await compressImage(
        appState.selectedImageFile,
        {
          quality: 0.7,
          maxWidth: 1024,
          maxHeight: 1024,
        }
      );
      imagePath = await api.uploadImageToGitHub(
        compressedImageBlob,
        appState.selectedImageFile.name
      );
    }

    const itemData = {
      id: itemId || `item_${Date.now()}`,
      sku: document.getElementById("item-sku").value,
      name: document.getElementById("item-name").value,
      category: document.getElementById("item-category").value,
      oemPartNumber: document.getElementById("item-oem-pn").value.trim(),
      compatiblePartNumber: document
        .getElementById("item-compatible-pn")
        .value.trim(),
      quantity:
        parseInt(document.getElementById("item-quantity").value, 10) || 0,
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
      imagePath: imagePath,
      supplierId: document.getElementById("item-supplier").value || null,
    };

    if (existingItemIndex !== -1) {
      appState.inventory.items[existingItemIndex] = itemData;
    } else {
      appState.inventory.items.push(itemData);
    }

    await api.saveToGitHub();
    saveLocalData();

    getDOMElements().itemModal.close();
    hideSyncStatus();
    showStatus("تم حفظ التغييرات بنجاح!", "success");

    if (originalItem) {
      const compareAndLog = async (field, action) => {
        if (originalItem[field] !== itemData[field]) {
          await logAction({
            action,
            targetId: itemData.id,
            targetName: itemData.name,
            details: { from: originalItem[field], to: itemData[field] },
          });
        }
      };
      await compareAndLog("name", ACTION_TYPES.NAME_UPDATED);
      await compareAndLog("sku", ACTION_TYPES.SKU_UPDATED);
      await compareAndLog("category", ACTION_TYPES.CATEGORY_UPDATED);
      await compareAndLog("notes", ACTION_TYPES.NOTES_UPDATED);
      await compareAndLog("imagePath", ACTION_TYPES.IMAGE_UPDATED);
      await compareAndLog("supplierId", ACTION_TYPES.SUPPLIER_UPDATED);

      if (originalItem.quantity !== itemData.quantity) {
        await logAction({
          action: ACTION_TYPES.QUANTITY_UPDATED,
          targetId: itemData.id,
          targetName: itemData.name,
          details: {
            from: originalItem.quantity,
            to: itemData.quantity,
            reason: "تعديل المنتج",
          },
        });
      }
      if (originalItem.sellPriceIqd !== itemData.sellPriceIqd) {
        await logAction({
          action: ACTION_TYPES.PRICE_UPDATED,
          targetId: itemData.id,
          targetName: itemData.name,
          details: {
            from: originalItem.sellPriceIqd,
            to: itemData.sellPriceIqd,
          },
        });
      }
    } else {
      await logAction({
        action: ACTION_TYPES.ITEM_CREATED,
        targetId: itemData.id,
        targetName: itemData.name,
        details: { quantity: itemData.quantity, price: itemData.sellPriceIqd },
      });
    }

    filterAndRenderItems(true);
    renderCategoryFilter();
    populateCategoryDatalist();

    if (appState.currentItemId === itemData.id) {
      openDetailsModal(itemData.id);
    }
  } catch (error) {
    hideSyncStatus();
    showStatus(`فشل الحفظ: ${error.message}`, "error");
  } finally {
    saveButton.disabled = false;
    appState.selectedImageFile = null;
  }
}

function handleImageSelection(file) {
  if (!file || !file.type.startsWith("image/")) {
    showStatus("الملف المحدد ليس صورة.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = event => {
    const { cropperModal, cropperImage, paddingDisplay, bgColorInput } =
      getDOMElements();
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
    getDOMElements().cropperModal.close();
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
        const { imagePreview, imagePlaceholder } = getDOMElements();
        const file = new File([blob], "cropped_image.webp", {
          type: "image/webp",
        });
        appState.selectedImageFile = file;
        imagePreview.src = URL.createObjectURL(file);
        imagePreview.classList.remove("image-preview-hidden");
        imagePlaceholder.style.display = "none";
        getDOMElements().cropperModal.close();
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
    if (item) {
      item.quantity++;
      elements.detailsQuantityValue.textContent = item.quantity;
    }
  });
  elements.detailsDecreaseBtn.addEventListener("click", () => {
    const item = appState.inventory.items.find(
      i => i.id === appState.currentItemId
    );
    if (item && item.quantity > 0) {
      item.quantity--;
      elements.detailsQuantityValue.textContent = item.quantity;
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
      const confirmed = await showConfirmationModal({
        title: "حفظ التغييرات؟",
        message: "لقد قمت بتغيير الكمية. هل تريد حفظ هذا التغيير؟",
        confirmText: "نعم, حفظ",
        isDanger: false,
      });

      if (confirmed) {
        const reason = await getQuantityChangeReason();
        if (reason !== null) {
          await saveQuantityChanges(currentItem, reason);
        } else {
          const originalItemIndex = appState.inventory.items.findIndex(
            i => i.id === itemBeforeEdit.id
          );
          if (originalItemIndex !== -1) {
            appState.inventory.items[originalItemIndex] = itemBeforeEdit;
          }
          filterAndRenderItems();
        }
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
      appState.inventory.items = appState.inventory.items.filter(
        item => item.id !== appState.currentItemId
      );
      elements.detailsModal.close();
      filterAndRenderItems(true);

      try {
        await api.saveToGitHub();
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
        saveLocalData();
        showStatus("تم حذف المنتج بنجاح!", "success");
        await logAction({
          action: ACTION_TYPES.ITEM_DELETED,
          targetId: itemToDelete.id,
          targetName: itemToDelete.name,
          details: { lastKnownSku: itemToDelete.sku },
        });
      } catch (error) {
        appState.inventory = originalInventory;
        appState.auditLog = originalAuditLog;
        filterAndRenderItems();
        showStatus(`فشل الحذف: ${error.message}`, "error");
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
