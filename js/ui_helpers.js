// js/ui_helpers.js
import { elements, openModal } from "./ui.js";
export function showConfirmationModal({
  title,
  message,
  confirmText = "نعم, تأكيد",
  cancelText = "إلغاء",
  isDanger = true,
}) {
  return new Promise(resolve => {
    const {
      confirmModal,
      confirmTitle,
      confirmMessage,
      confirmOkBtn,
      confirmCancelBtn,
      confirmModalIcon,
    } = elements;

    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmText;
    confirmCancelBtn.textContent = cancelText;

    confirmOkBtn.classList.toggle("danger", isDanger);
    confirmOkBtn.classList.toggle("primary", !isDanger);
    confirmModalIcon.classList.toggle("danger", isDanger);
    confirmModalIcon.classList.toggle("info", !isDanger);

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onModalClose = () => {
      cleanup();
      resolve(false);
    };
    const cleanup = () => {
      confirmOkBtn.removeEventListener("click", onConfirm);
      confirmCancelBtn.removeEventListener("click", onCancel);
      confirmModal.removeEventListener("close", onModalClose);
      if (confirmModal.open) confirmModal.close();
    };

    confirmOkBtn.addEventListener("click", onConfirm, { once: true });
    confirmCancelBtn.addEventListener("click", onCancel, { once: true });
    confirmModal.addEventListener("close", onModalClose, { once: true });

    openModal(confirmModal);
  });
}

// ADDED: New helper function for the reason modal
export function getQuantityChangeReason() {
  return new Promise(resolve => {
    const { reasonModal, reasonForm, quantityChangeReasonInput } = elements;

    quantityChangeReasonInput.value = "";

    const onSubmit = e => {
      e.preventDefault();
      cleanup();
      resolve(quantityChangeReasonInput.value.trim());
    };

    const onSaveWithoutReason = () => {
      cleanup();
      resolve(""); // Resolve with an empty string
    };

    const onModalClose = () => {
      cleanup();
      resolve(null); // Resolve with null if the user cancels (e.g., presses ESC)
    };

    const cleanup = () => {
      reasonForm.removeEventListener("submit", onSubmit);
      elements.saveWithoutReasonBtn.removeEventListener(
        "click",
        onSaveWithoutReason
      );
      reasonModal.removeEventListener("close", onModalClose);
      if (reasonModal.open) reasonModal.close();
    };

    reasonForm.addEventListener("submit", onSubmit, { once: true });
    elements.saveWithoutReasonBtn.addEventListener(
      "click",
      onSaveWithoutReason,
      { once: true }
    );
    reasonModal.addEventListener("close", onModalClose, { once: true });

    openModal(reasonModal);
  });
}