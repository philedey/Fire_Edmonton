const DB_NAME = 'edmonton-fire-dashboard';
const DB_VERSION = 1;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('geojson')) {
        db.createObjectStore('geojson', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedMapData() {
  try {
    const db = await openDB();
    const tx = db.transaction(['geojson', 'metadata'], 'readonly');

    const meta = await idbGet(tx.objectStore('metadata'), 'mapCache');
    if (!meta) return null;

    const geojsonEntry = await idbGet(tx.objectStore('geojson'), 'mapPoints');
    if (!geojsonEntry) return null;

    return {
      geojson: geojsonEntry.value,
      lastFetched: meta.value.lastFetched,
      featureCount: meta.value.featureCount,
    };
  } catch (err) {
    console.warn('Cache read failed:', err);
    return null;
  }
}

export async function setCachedMapData(geojson) {
  try {
    const db = await openDB();
    const tx = db.transaction(['geojson', 'metadata'], 'readwrite');

    tx.objectStore('geojson').put({ key: 'mapPoints', value: geojson });
    tx.objectStore('metadata').put({
      key: 'mapCache',
      value: {
        lastFetched: new Date().toISOString(),
        featureCount: geojson.features.length,
      },
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Cache write failed:', err);
  }
}

export function isCacheStale(lastFetched) {
  if (!lastFetched) return true;
  return (Date.now() - new Date(lastFetched).getTime()) > CACHE_MAX_AGE_MS;
}
