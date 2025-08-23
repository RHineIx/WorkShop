// js/handlers/modals/detailsModalHandler.js
import { appState } from "../../state.js";
import * as api from "../../api.js";
import { saveLocalData } from "../../app.js";
import { showConfirmationModal, getQuantityChangeReason } from "../../ui_helpers.js";
import { elements } from "../../ui.js";
import { filterAndRenderItems } from "../../renderer.js";
import { showStatus, hideStatus } from "../../notifications.js";
import { logAction, ACTION_TYPES } from "../../logger.js";
import { openItemModal } from "./itemFormHandler.js";

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

async function handleDeleteItem() {
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
}

export function setupDetailsModalListeners() {
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

  elements.detailsDeleteBtn.addEventListener("click", handleDeleteItem);
}