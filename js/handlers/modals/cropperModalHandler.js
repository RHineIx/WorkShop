// js/handlers/modals/cropperModalHandler.js
import { elements, openModal } from "../../ui.js";
import { appState } from "../../state.js";
import { showStatus } from "../../notifications.js";

let cropper = null;
let cropperPadding = 0.1;
let cropperBgColor = "#FFFFFF";

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
      autoCropArea: 1,
    });
  };
  reader.readAsDataURL(file);
}

export function setupCropperModalListeners() {
  const cropperContainer = elements.cropperModal.querySelector(
    ".cropper-image-container"
  );
  if (cropperContainer) {
    cropperContainer.addEventListener("contextmenu", e => e.preventDefault());
  }

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

  return handleImageSelection;
}