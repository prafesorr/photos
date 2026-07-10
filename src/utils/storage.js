// В SDK 54 старые методы (getInfoAsync, copyAsync и т.д.) нужно
// импортировать из legacy-модуля. Импорт из expo-file-system приводит к
// ошибке во время запуска production-сборки.
import * as FileSystem from 'expo-file-system/legacy';

export const PHOTOS_DIR = FileSystem.documentDirectory + 'photos/';
export const SECRET_DIR = FileSystem.documentDirectory + 'secret/';
export const DELETED_DIR = FileSystem.documentDirectory + 'deleted/';
export const SECRET_DELETED_DIR = FileSystem.documentDirectory + 'secret_deleted/';

export const ensureDirs = async () => {
  for (const dir of [PHOTOS_DIR, SECRET_DIR, DELETED_DIR, SECRET_DELETED_DIR]) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
};

// Генерируем гарантированно уникальное имя файла.
// Это критично: раньше при переносе в корзину/восстановлении
// использовалось СТАРОЕ имя файла, и если такое имя уже было
// в целевой папке — copyAsync падал с ошибкой "путь совпадает сам с собой".
const generateFilename = (sourceUri) => {
  const rawExt = sourceUri.split('.').pop().split('?')[0];
  const ext = (rawExt && rawExt.length <= 5) ? rawExt : 'jpg';
  return `photo_${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${ext}`;
};

export const copyPhoto = async (fromUri, isSecret = false) => {
  const dir = isSecret ? SECRET_DIR : PHOTOS_DIR;
  const filename = generateFilename(fromUri);
  const toUri = dir + filename;

  await FileSystem.copyAsync({ from: fromUri, to: toUri });
  return { filename, uri: toUri };
};

export const moveToTrash = async (uri, isSecret = false) => {
  // Проверяем, что исходный файл вообще существует —
  // если нет, нет смысла пытаться его копировать
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error(`Исходный файл не найден: ${uri}`);
  }

  const destDir = isSecret ? SECRET_DELETED_DIR : DELETED_DIR;
  const filename = generateFilename(uri); // всегда новое имя
  const destUri = destDir + filename;

  await FileSystem.copyAsync({ from: uri, to: destUri });
  await FileSystem.deleteAsync(uri, { idempotent: true });
  return { filename, uri: destUri };
};

export const restoreFromTrash = async (uri, isSecret = false) => {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error(`Файл в корзине не найден: ${uri}`);
  }

  const destDir = isSecret ? SECRET_DIR : PHOTOS_DIR;
  const filename = generateFilename(uri); // всегда новое имя
  const destUri = destDir + filename;

  await FileSystem.copyAsync({ from: uri, to: destUri });
  await FileSystem.deleteAsync(uri, { idempotent: true });
  return { filename, uri: destUri };
};

export const removeFile = async (uri) => {
  await FileSystem.deleteAsync(uri, { idempotent: true });
};

export const forceDelete = async (uri) => {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return true;
  } catch (e) {
    console.error('Force delete failed:', e);
    return false;
  }
};
