// js/utils.js

/**
 * Sanitizes a string to prevent XSS attacks by converting HTML special characters
 * into their corresponding entities.
 * @param {string} str The potentially unsafe string to sanitize.
 * @returns {string} A safe string with HTML characters encoded.
 */
export const sanitizeHTML = str => {
  const temp = document.createElement("div");
  temp.textContent = str;
  return temp.innerHTML;
};
/**
 * Generates a random, non-unique SKU string in the format "KEY-XXXXXXXX".
 * @returns {string} A randomly generated SKU.
 */
const generateSKU = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `KEY-${result}`;
};

/**
 * Generates a SKU and ensures it is unique by checking against a Set of existing SKUs.
 * It will continue generating SKUs until a unique one is found.
 * @param {Set<string>} existingSkus - A Set containing all SKUs that are currently in use.
 * @returns {string} A guaranteed unique SKU.
 */
export const generateUniqueSKU = existingSkus => {
  let newSku;
  do {
    newSku = generateSKU();
  } while (existingSkus.has(newSku));
  return newSku;
};
/**
 * Compresses an image file using the canvas element.
 * Resizes the image to a max width/height and adjusts quality.
 * @param {File} file The image file to compress.
 * @param {object} options Compression options { maxWidth, maxHeight, quality }.
 * @returns {Promise<Blob>} A promise that resolves with the compressed image as a Blob.
 */
export const compressImage = (file, options = {}) => {
  return new Promise((resolve, reject) => {
    const { maxWidth = 1024, maxHeight = 1024, quality = 0.6 } = options;
    const reader = new FileReader();

    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate the new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        // Create a canvas and draw the resized image
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        // Get the compressed image Blob
        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error("Canvas to Blob conversion failed."));
              return;
            }
            resolve(blob);
          },
          "image/webp",
          quality
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
/**
 * Creates and returns a new debounced version of the passed function
 * that will postpone its execution until after `delay` milliseconds
 * have elapsed since the last time it was invoked.
 * @param {Function} func The function to debounce.
 * @param {number} delay The number of milliseconds to delay.
 * @returns {Function} Returns the new debounced function.
 */
export const debounce = (func, delay) => {
  let timeoutId;
  // Return a new function that wraps the original function
  return (...args) => {
    // Clear the previous timeout if the function is called again
    clearTimeout(timeoutId);
    // Set a new timeout
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
};

export const b64toBlob = (b64Data, contentType = "", sliceSize = 512) => {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: contentType });
};

export const toBase64 = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = error => reject(error);
  });