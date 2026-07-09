import * as SQLite from 'expo-sqlite';

let db = null;

export const initDB = async () => {
  db = await SQLite.openDatabaseAsync('photos.db');
  
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      uri TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
  
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS secret_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      uri TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
  
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS deleted_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_id INTEGER,
      filename TEXT NOT NULL,
      uri TEXT NOT NULL,
      deleted_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
  
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS secret_deleted_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_id INTEGER,
      filename TEXT NOT NULL,
      uri TEXT NOT NULL,
      deleted_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
  
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
};

// Обычные фото
export const addPhoto = async (filename, uri) => {
  const result = await db.runAsync(
    'INSERT INTO photos (filename, uri) VALUES (?, ?)',
    [filename, uri]
  );
  return result.lastInsertRowId;
};

export const getPhotos = async () => {
  return await db.getAllAsync('SELECT * FROM photos ORDER BY id DESC');
};

export const deletePhoto = async (id) => {
  await db.runAsync('DELETE FROM photos WHERE id = ?', [id]);
};

// Секретные фото
export const addSecretPhoto = async (filename, uri) => {
  const result = await db.runAsync(
    'INSERT INTO secret_photos (filename, uri) VALUES (?, ?)',
    [filename, uri]
  );
  return result.lastInsertRowId;
};

export const getSecretPhotos = async () => {
  return await db.getAllAsync('SELECT * FROM secret_photos ORDER BY id DESC');
};

export const deleteSecretPhoto = async (id) => {
  await db.runAsync('DELETE FROM secret_photos WHERE id = ?', [id]);
};

// Обычная корзина
export const addToTrash = async (originalId, filename, uri) => {
  const result = await db.runAsync(
    'INSERT INTO deleted_photos (original_id, filename, uri) VALUES (?, ?, ?)',
    [originalId, filename, uri]
  );
  return result.lastInsertRowId;
};

export const getTrash = async () => {
  return await db.getAllAsync('SELECT * FROM deleted_photos ORDER BY deleted_at DESC');
};

export const restoreFromTrash = async (id) => {
  const item = await db.getFirstAsync('SELECT * FROM deleted_photos WHERE id = ?', [id]);
  if (!item) return null;
  
  await db.runAsync('INSERT INTO photos (filename, uri) VALUES (?, ?)', [item.filename, item.uri]);
  await db.runAsync('DELETE FROM deleted_photos WHERE id = ?', [id]);
  return item;
};

export const deleteFromTrash = async (id) => {
  await db.runAsync('DELETE FROM deleted_photos WHERE id = ?', [id]);
};

// Секретная корзина
export const addToSecretTrash = async (originalId, filename, uri) => {
  const result = await db.runAsync(
    'INSERT INTO secret_deleted_photos (original_id, filename, uri) VALUES (?, ?, ?)',
    [originalId, filename, uri]
  );
  return result.lastInsertRowId;
};

export const getSecretTrash = async () => {
  return await db.getAllAsync('SELECT * FROM secret_deleted_photos ORDER BY deleted_at DESC');
};

export const restoreFromSecretTrash = async (id) => {
  const item = await db.getFirstAsync('SELECT * FROM secret_deleted_photos WHERE id = ?', [id]);
  if (!item) return null;
  
  await db.runAsync('INSERT INTO secret_photos (filename, uri) VALUES (?, ?)', [item.filename, item.uri]);
  await db.runAsync('DELETE FROM secret_deleted_photos WHERE id = ?', [id]);
  return item;
};

export const deleteFromSecretTrash = async (id) => {
  await db.runAsync('DELETE FROM secret_deleted_photos WHERE id = ?', [id]);
};

// Настройки (PIN)
export const setSetting = async (key, value) => {
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  );
};

export const getSetting = async (key) => {
  const row = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value || null;
};

export const hasPin = async () => {
  const pin = await getSetting('pin_code');
  return pin !== null;
};

export const verifyPin = async (pin) => {
  const saved = await getSetting('pin_code');
  return saved === pin;
};

export const setPin = async (pin) => {
  await setSetting('pin_code', pin);
};