// js/handlers/modalHandlers.js
import { appState } from "../state.js";
import * as ui from "../ui.js";
import * as api from "../api.js";
import { ConflictError } from "../api.js";
import { generateUniqueSKU, compressImage } from "../utils.js";
import { saveLocalData } from "../app.js";
import { showConfirmationModal } from "../ui_helpers.js";

// Module-scoped variables for the cropper instance
let cropper = null;
let cropperPadding = 0.1;
let cropperBgColor = "#FFFFFF";

// --- HELPER FUNCTIONS ---

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

async function saveQuantityChanges(currentItem) {
  ui.showStatus("التحقق من البيانات...", "syncing");
  const itemBeforeEdit = appState.itemStateBeforeEdit;
  try {
    const { data: latestInventory, sha: latestSha } =
      await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      ui.showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      const originalItemIndex = appState.inventory.items.findIndex(
        i => i.id === itemBeforeEdit.id
      );
      if (originalItemIndex !== -1) {
        appState.inventory.items[originalItemIndex] = itemBeforeEdit;
      }
      ui.filterAndRenderItems();
      return;
    }

    ui.showStatus("جاري حفظ تغيير الكمية...", "syncing");
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
    ui.filterAndRenderItems(); // ADDED: Refresh UI after successful save
    ui.showStatus("تم حفظ التغييرات بنجاح!", "success");
  } catch (error) {
    const originalItemIndex = appState.inventory.items.findIndex(
      i => i.id === itemBeforeEdit.id
    );
    if (originalItemIndex !== -1) {
      appState.inventory.items[originalItemIndex] = itemBeforeEdit;
    }
    ui.filterAndRenderItems();
    ui.showStatus("فشل حفظ التغييرات.", "error", { duration: 4000 });
  }
}

// --- FORM SUBMISSION HANDLERS ---

async function handleSaleFormSubmit(e) {
  e.preventDefault();
  const saveButton = document.getElementById("confirm-sale-btn");
  saveButton.disabled = true;
  ui.showStatus("التحقق من البيانات...", "syncing");

  try {
    const { sha: latestSha } = await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      ui.showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
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
      ui.showStatus("خطأ في البيانات أو الكمية غير متوفرة.", "error");
      saveButton.disabled = false;
      return;
    }

    ui.showStatus("جاري تسجيل البيع...", "syncing");
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
    ui.filterAndRenderItems(true);

    try {
      await api.saveToGitHub();
      await api.saveSales();
      saveLocalData();
      ui.getDOMElements().saleModal.close();
      ui.hideSyncStatus();
      ui.showStatus("تم تسجيل البيع بنجاح!", "success");
    } catch (saveError) {
      item.quantity = originalQuantity;
      appState.sales.pop();
      ui.filterAndRenderItems();
      throw saveError;
    }
  } catch (error) {
    ui.hideSyncStatus();
    if (!(error instanceof ConflictError)) {
      ui.showStatus(`فشل تسجيل البيع: ${error.message}`, "error");
    }
  } finally {
    if (appState.currentView === "dashboard") {
      ui.renderDashboard();
    }
    saveButton.disabled = false;
  }
}

async function handleItemFormSubmit(e) {
  e.preventDefault();
  const saveButton = document.getElementById("save-item-btn");
  saveButton.disabled = true;
  ui.showStatus("التحقق من البيانات...", "syncing");

  try {
    const { data: latestInventory, sha: latestSha } =
      await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      ui.showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      saveButton.disabled = false;
      return;
    }

    ui.showStatus("جاري الحفظ...", "syncing");
    appState.inventory = latestInventory;
    appState.fileSha = latestSha;

    const itemId = document.getElementById("item-id").value;
    let imagePath = null;
    const existingItem = appState.inventory.items.find(i => i.id === itemId);
    if (existingItem) {
      imagePath = existingItem.imagePath;
    }

    if (appState.selectedImageFile) {
      ui.showStatus("جاري ضغط ورفع الصورة...", "syncing");
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

    const index = appState.inventory.items.findIndex(i => i.id === itemId);
    if (index !== -1) {
      appState.inventory.items[index] = itemData;
    } else {
      appState.inventory.items.push(itemData);
    }

    ui.filterAndRenderItems(true);
    ui.renderCategoryFilter();
    ui.populateCategoryDatalist();

    await api.saveToGitHub();
    saveLocalData();

    ui.getDOMElements().itemModal.close();
    ui.hideSyncStatus();
    ui.showStatus("تم حفظ التغييرات بنجاح!", "success");

    if (appState.currentItemId === itemData.id) {
      ui.openDetailsModal(itemData.id);
    }
  } catch (error) {
    ui.hideSyncStatus();
    ui.showStatus(`فشل الحفظ: ${error.message}`, "error");
  } finally {
    saveButton.disabled = false;
    appState.selectedImageFile = null;
  }
}

// --- IMAGE & CROPPER HANDLERS ---

function handleImageSelection(file) {
  if (!file || !file.type.startsWith("image/")) {
    ui.showStatus("الملف المحدد ليس صورة.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = event => {
    const { cropperModal, cropperImage, paddingDisplay, bgColorInput } =
      ui.getDOMElements();
    cropperPadding = 0.1;
    cropperBgColor = "#FFFFFF";
    paddingDisplay.textContent = `${Math.round(cropperPadding * 100)}%`;
    bgColorInput.value = cropperBgColor;

    cropperImage.src = event.target.result;
    ui.openModal(cropperModal);

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

// --- SETUP FUNCTION ---

export function setupModalListeners(elements) {
  elements.addItemBtn.addEventListener("click", () => {
    ui.openItemModal();
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
        ui.showStatus("متصفحك لا يدعم لصق الصور.", "error");
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
        ui.showStatus("لا توجد صورة في الحافظة.", "warning");
      }
    } catch (error) {
      console.error("Failed to paste image:", error);
      ui.showStatus(`فشل لصق الصورة: ${error.message}`, "error");
    }
  });
  document.getElementById("cancel-crop-btn").addEventListener("click", () => {
    ui.getDOMElements().cropperModal.close();
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
        const { imagePreview, imagePlaceholder } = ui.getDOMElements();
        const file = new File([blob], "cropped_image.webp", {
          type: "image/webp",
        });
        appState.selectedImageFile = file;
        imagePreview.src = URL.createObjectURL(file);
        imagePreview.classList.remove("image-preview-hidden");
        imagePlaceholder.style.display = "none";
        ui.getDOMElements().cropperModal.close();
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
      // ui.filterAndRenderItems(); // REMOVED: This causes the jump
    }
  });
  elements.detailsDecreaseBtn.addEventListener("click", () => {
    const item = appState.inventory.items.find(
      i => i.id === appState.currentItemId
    );
    if (item && item.quantity > 0) {
      item.quantity--;
      elements.detailsQuantityValue.textContent = item.quantity;
      // ui.filterAndRenderItems(); // REMOVED: This causes the jump
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
        await saveQuantityChanges(currentItem);
      } else {
        const originalItemIndex = appState.inventory.items.findIndex(
          i => i.id === itemBeforeEdit.id
        );
        if (originalItemIndex !== -1) {
          appState.inventory.items[originalItemIndex] = itemBeforeEdit;
        }
        ui.filterAndRenderItems();
      }
    }
    appState.itemStateBeforeEdit = null;
    appState.currentItemId = null;
    elements.detailsModal.close();
  });
  elements.detailsEditBtn.addEventListener("click", () => {
    elements.detailsModal.close();
    ui.openItemModal(appState.currentItemId);
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
      appState.inventory.items = appState.inventory.items.filter(
        item => item.id !== appState.currentItemId
      );
      elements.detailsModal.close();
      ui.filterAndRenderItems(true);

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
        ui.showStatus("تم حذف المنتج بنجاح!", "success");
      } catch (error) {
        appState.inventory = originalInventory;
        ui.filterAndRenderItems();
        ui.showStatus(`فشل الحذف: ${error.message}`, "error");
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
      ui.updateSaleTotal();
    }
  });
  elements.saleDecreaseBtn.addEventListener("click", () => {
    const quantityInput = elements.saleQuantityInput;
    let currentValue = parseInt(quantityInput.value, 10);
    if (currentValue > 1) {
      quantityInput.value = currentValue - 1;
      ui.updateSaleTotal();
    }
  });
  elements.saleQuantityInput.addEventListener("input", ui.updateSaleTotal);
  document
    .getElementById("sale-price")
    .addEventListener("input", ui.updateSaleTotal);
}
