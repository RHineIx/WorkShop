// js/handlers/supplierHandlers.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { showStatus, hideStatus } from "../notifications.js";
import { renderSupplierList, populateSupplierDropdown, filterAndRenderItems } from "../renderer.js";
import { elements, openModal } from "../ui.js";
import { showConfirmationModal } from "../ui_helpers.js";

async function handleSupplierFormSubmit(e) {
  e.preventDefault();
  const id = elements.supplierIdInput.value;
  const name = document.getElementById("supplier-name").value.trim();
  const phone = document.getElementById("supplier-phone").value.trim();

  if (!name) {
    showStatus("يرجى إدخال اسم المورّد.", "error");
    return;
  }

  const originalSuppliers = JSON.parse(JSON.stringify(appState.suppliers));
  let updatedSupplier;
  const isEditing = !!id;
  const actionText = isEditing ? 'تعديل' : 'إضافة';
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
  
  const syncToastId = showStatus(`جاري ${actionText} المورّد...`, "syncing");

  renderSupplierList();
  populateSupplierDropdown(elements.itemSupplierSelect.value);
  elements.supplierForm.reset();
  elements.supplierIdInput.value = "";
  elements.supplierFormTitle.textContent = "إضافة مورّد جديد";
  elements.cancelEditSupplierBtn.classList.add("view-hidden");
  
  try {
    await api.saveSuppliers();
    saveLocalData();
    hideStatus(syncToastId);
    showStatus(`تم ${actionText} المورّد ومزامنته بنجاح!`, "success");
  } catch (error) {
    console.error("Supplier sync failed, rolling back:", error);
    appState.suppliers = originalSuppliers;
    renderSupplierList();
    populateSupplierDropdown(elements.itemSupplierSelect.value);
    hideStatus(syncToastId);
    showStatus(`فشل مزامنة المورّد! تم استرجاع البيانات.`, "error");
  }
}

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
    const originalInventory = JSON.parse(JSON.stringify(appState.inventory));
    const originalSuppliers = JSON.parse(JSON.stringify(appState.suppliers));
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
    filterAndRenderItems();
    populateSupplierDropdown(elements.itemSupplierSelect.value);
    const syncToastId = showStatus("جاري حذف المورّد...", "syncing");
    try {
        if (linkedProductsCount > 0) {
            await api.saveInventory();
        }
        await api.saveSuppliers();
        hideStatus(syncToastId);
        showStatus("تم حذف المورّد ومزامنته بنجاح!", "success");
    } catch (error) {
      console.error("Supplier deletion sync failed, rolling back:", error);
      appState.inventory = originalInventory;
      appState.suppliers = originalSuppliers;
      saveLocalData();
      renderSupplierList();
      filterAndRenderItems();
      populateSupplierDropdown(elements.itemSupplierSelect.value);
      hideStatus(syncToastId);
      showStatus("فشل مزامنة الحذف! تم استرجاع البيانات.", "error");
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