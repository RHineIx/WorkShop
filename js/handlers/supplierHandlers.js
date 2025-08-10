// js/handlers/supplierHandlers.js
import { appState } from "../state.js";
import * as ui from "../ui.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";

async function handleSupplierFormSubmit(e) {
  e.preventDefault();
  const elements = ui.getDOMElements();
  const id = elements.supplierIdInput.value;
  const name = document.getElementById("supplier-name").value.trim();
  const phone = document.getElementById("supplier-phone").value.trim();
  if (!name) {
    ui.showStatus("يرجى إدخال اسم المورّد.", "error");
    return;
  }

  if (id) {
    const supplier = appState.suppliers.find(s => s.id === id);
    if (supplier) {
      supplier.name = name;
      supplier.phone = phone;
    }
  } else {
    if (appState.suppliers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      ui.showStatus("هذا المورّد موجود بالفعل.", "error");
      return;
    }
    const newSupplier = { id: `sup_${Date.now()}`, name, phone };
    appState.suppliers.push(newSupplier);
  }

  const actionText = id ? "تعديل" : "إضافة";
  ui.showStatus(`جاري ${actionText} المورّد...`, "syncing");
  try {
    await api.saveSuppliers();
    ui.renderSupplierList();
    ui.populateSupplierDropdown(elements.itemSupplierSelect.value);
    ui.hideSyncStatus();
    ui.showStatus(`تم ${actionText} المورّد بنجاح!`, "success");
    elements.supplierForm.reset();
    elements.supplierIdInput.value = "";
    elements.supplierFormTitle.textContent = "إضافة مورّد جديد";
    elements.cancelEditSupplierBtn.classList.add("view-hidden");
  } catch (error) {
    ui.hideSyncStatus();
    ui.showStatus(`فشل حفظ المورّد: ${error.message}`, "error");
  }
}

async function handleDeleteSupplier(supplierId) {
  const linkedProductsCount = appState.inventory.items.filter(
    item => item.supplierId === supplierId
  ).length;
  let confirmMessage = "هل أنت متأكد من رغبتك في حذف هذا المورّد نهائياً؟";
  if (linkedProductsCount > 0) {
    confirmMessage = `هذا المورّد مرتبط بـ ${linkedProductsCount} منتجات.\nهل أنت متأكد من حذفه؟ سيتم فك ارتباطه من هذه المنتجات.`;
  }

  if (confirm(confirmMessage)) {
    ui.showStatus("جاري حذف المورّد...", "syncing");
    try {
      if (linkedProductsCount > 0) {
        appState.inventory.items.forEach(item => {
          if (item.supplierId === supplierId) {
            item.supplierId = null;
          }
        });
        await api.saveToGitHub(); // Save inventory changes
      }

      appState.suppliers = appState.suppliers.filter(s => s.id !== supplierId);
      await api.saveSuppliers();

      saveLocalData();
      ui.renderSupplierList();
      ui.populateSupplierDropdown(ui.getDOMElements().itemSupplierSelect.value);
      ui.hideSyncStatus();
      ui.showStatus("تم حذف المورّد بنجاح!", "success");
    } catch (error) {
      ui.hideSyncStatus();
      ui.showStatus(`فشل حذف المورّد: ${error.message}`, "error");
    }
  }
}

export function setupSupplierListeners(elements) {
  elements.manageSuppliersBtn.addEventListener("click", () => {
    ui.renderSupplierList();
    ui.openModal(elements.supplierManagerModal);
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