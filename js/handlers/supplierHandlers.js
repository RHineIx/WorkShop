// js/handlers/supplierHandlers.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { showStatus, hideSyncStatus, updateStatus } from "../notifications.js";
import { renderSupplierList, populateSupplierDropdown, filterAndRenderItems } from "../renderer.js";
import { getDOMElements, openModal } from "../ui.js";
import { showConfirmationModal } from "../ui_helpers.js";
import { ConflictError } from "../api.js";


async function handleSupplierFormSubmit(e) {
  e.preventDefault();
  const elements = getDOMElements();
  const id = elements.supplierIdInput.value;
  const name = document.getElementById("supplier-name").value.trim();
  const phone = document.getElementById("supplier-phone").value.trim();
  if (!name) {
    showStatus("يرجى إدخال اسم المورّد.", "error");
    return;
  }

  // --- OPTIMISTIC UI for Add/Edit Supplier ---
  const originalSuppliers = JSON.parse(JSON.stringify(appState.suppliers));
  let updatedSupplier;
  const isEditing = !!id;

  if (isEditing) {
    const supplier = appState.suppliers.find(s => s.id === id);
    if (supplier) {
      supplier.name = name;
      supplier.phone = phone;
      updatedSupplier = supplier;
    }
  } else {
    if (appState.suppliers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      showStatus("هذا المورّد موجود بالفعل.", "error");
      return;
    }
    updatedSupplier = { id: `sup_${Date.now()}`, name, phone };
    appState.suppliers.push(updatedSupplier);
  }
  
  // Update UI Immediately
  renderSupplierList();
  populateSupplierDropdown(elements.itemSupplierSelect.value);
  elements.supplierForm.reset();
  elements.supplierIdInput.value = "";
  elements.supplierFormTitle.textContent = "إضافة مورّد جديد";
  elements.cancelEditSupplierBtn.classList.add("view-hidden");
  showStatus(`تم ${isEditing ? 'تعديل' : 'إضافة'} المورّد محليًا.`, "success", { duration: 2000 });

  // Sync in background
  const syncToastId = showStatus(`جاري مزامنة المورّد...`, "syncing");
  try {
    const { sha: latestSha } = await api.fetchSuppliers();
    if (latestSha !== originalSuppliers.fileSha) {
        throw new ConflictError("Supplier list was updated elsewhere.");
    }

    await api.saveSuppliers();
    saveLocalData();
    updateStatus(syncToastId, `تمت مزامنة المورّد بنجاح!`, "success");

  } catch (error) {
    console.error("Supplier sync failed, rolling back:", error);
    appState.suppliers = originalSuppliers; // Rollback
    renderSupplierList();
    populateSupplierDropdown(elements.itemSupplierSelect.value);
    updateStatus(syncToastId, `فشل مزامنة المورّد! تم استرجاع البيانات.`, "error");
  }
}

// REFACTORED: Switched to Optimistic UI pattern
async function handleDeleteSupplier(supplierId) {
  const linkedProductsCount = appState.inventory.items.filter(
    item => item.supplierId === supplierId
  ).length;
  let confirmMessage = "هل أنت متأكد من رغبتك في حذف هذا المورّد نهائياً؟";
  if (linkedProductsCount > 0) {
    confirmMessage += `\nهذا المورّد مرتبط بـ ${linkedProductsCount} منتجات سيتم فك ارتباطها.`;
  }

  const confirmed = await showConfirmationModal({
      title: "تأكيد الحذف",
      message: confirmMessage,
      confirmText: "نعم, حذف"
  });

  if (confirmed) {
    // 1. Store original state for potential rollback
    const originalInventory = JSON.parse(JSON.stringify(appState.inventory));
    const originalSuppliers = JSON.parse(JSON.stringify(appState.suppliers));

    // 2. Update state and UI immediately
    if (linkedProductsCount > 0) {
      appState.inventory.items.forEach(item => {
        if (item.supplierId === supplierId) {
          item.supplierId = null;
        }
      });
    }
    appState.suppliers = appState.suppliers.filter(s => s.id !== supplierId);

    saveLocalData();
    renderSupplierList();
    filterAndRenderItems(); // Re-render inventory in case items were unlinked
    populateSupplierDropdown(getDOMElements().itemSupplierSelect.value);
    showStatus("تم حذف المورّد محليًا.", "success", { duration: 2000 });

    // 3. Sync in the background
    const syncToastId = showStatus("جاري مزامنة الحذف...", "syncing");
    try {
        const { sha: latestInvSha } = await api.fetchFromGitHub();
        const { sha: latestSupSha } = await api.fetchSuppliers();

        if (latestInvSha !== originalInventory.fileSha || latestSupSha !== originalSuppliers.fileSha) {
            throw new ConflictError("Data was updated elsewhere.");
        }
        
        if (linkedProductsCount > 0) {
            await api.saveToGitHub();
        }
        await api.saveSuppliers();
        updateStatus(syncToastId, "تمت مزامنة الحذف بنجاح!", "success");

    } catch (error) {
      console.error("Supplier deletion sync failed, rolling back:", error);
      appState.inventory = originalInventory; // Rollback
      appState.suppliers = originalSuppliers; // Rollback
      saveLocalData();
      renderSupplierList();
      filterAndRenderItems();
      populateSupplierDropdown(getDOMElements().itemSupplierSelect.value);
      updateStatus(syncToastId, "فشل مزامنة الحذف! تم استرجاع البيانات.", "error");
    }
  }
}

export function setupSupplierListeners(elements) {
  elements.manageSuppliersBtn.addEventListener("click", () => {
    renderSupplierList();
    openModal(elements.supplierManagerModal);
  });
  elements.closeSupplierManagerBtn.addEventListener("click", () => {
    elements.supplierManagerModal.close();
  });

  elements.supplierForm.addEventListener("submit", handleSupplierFormSubmit);
  elements.supplierListContainer.addEventListener("click", e => {
    const deleteBtn = e.target.closest(".delete-supplier-btn");
    if (deleteBtn) {
      handleDeleteSupplier(deleteBtn.dataset.id);
      return;
    }

    const editBtn = e.target.closest(".edit-supplier-btn");
    if (editBtn) {
      const supplier = appState.suppliers.find(s => s.id === editBtn.dataset.id);
      if (supplier) {
        elements.supplierFormTitle.textContent = "تعديل مورّد";
        elements.supplierIdInput.value = supplier.id;
        document.getElementById("supplier-name").value = supplier.name;
        document.getElementById("supplier-phone").value = supplier.phone;
        elements.cancelEditSupplierBtn.classList.remove("view-hidden");
      }
    }
  });
  elements.cancelEditSupplierBtn.addEventListener("click", () => {
    elements.supplierForm.reset();
    elements.supplierIdInput.value = "";
    elements.supplierFormTitle.textContent = "إضافة مورّد جديد";
    elements.cancelEditSupplierBtn.classList.add("view-hidden");
  });
}
