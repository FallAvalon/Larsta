import { t } from './i18n';

// Keep camera photos small enough for the browser's appearance storage.
export async function prepareWallpaper(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(t('Выберите файл изображения.'));
  if (file.size > 20 * 1024 * 1024) throw new Error(t('Изображение должно быть не больше 20 МБ.'));
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error(t('Не удалось открыть изображение. Попробуйте JPEG, PNG или WebP.')); }
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error(t('Не удалось обработать изображение.'));
    context.fillStyle = '#11151b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5]) {
      const result = canvas.toDataURL('image/jpeg', quality);
      if (result.length <= 2_000_000) return result;
    }
    throw new Error(t('Изображение слишком сложное. Выберите файл меньшего размера.'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
