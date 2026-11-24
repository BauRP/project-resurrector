/** Webcam photo save contract. A zero-sized or non-image toBlob result is
 * not a successful capture; reject it before opening IndexedDB.
 * Browser canvas JPEG may legitimately fall back to PNG on old WebViews.
 */
export function isUsableEncodedPhoto(value: unknown): value is Blob {
  return value instanceof Blob && Number.isSafeInteger(value.size) &&
    value.size >= 128 &&
    /^(?:image\/jpeg|image\/png|image\/webp)$/i.test(value.type);
}
