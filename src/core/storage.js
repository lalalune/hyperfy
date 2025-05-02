import fs from 'fs/promises';      // <-- Static import
import path from 'path';        // <-- Static import
import { fileURLToPath } from 'url'; // <-- Static import

const isBrowser = typeof window !== 'undefined';

class LocalStorage {
  get(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(key);
      // localStorage returns null if key doesn't exist
      if (data === null) return defaultValue;
      const value = JSON.parse(data);
      return value ?? defaultValue; // Use nullish coalescing
    } catch (err) {
      console.error('Error reading localStorage key:', key, err);
      return defaultValue;
    }
  }

  set(key, value) {
    try {
      if (value === undefined || value === null) {
        localStorage.removeItem(key);
      } else {
        const data = JSON.stringify(value);
        localStorage.setItem(key, data);
      }
    } catch (err) {
      console.error('Error writing localStorage key:', key, err);
    }
  }

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error('Error removing localStorage key:', key, err);
    }
  }
}

class NodeStorage {
  isNodeStorage = true; 
  _cache = null;
  _storageFilePath = null;
  _pendingWritePromise = Promise.resolve(); 
  
  constructor() { 
      if (isBrowser) {
          throw new Error("NodeStorage cannot be constructed in a browser environment.");
      }
      this._initializePath(); 
  }

  _initializePath() {
    if (this._storageFilePath) return;
    try {
        const dirname = path.dirname(fileURLToPath(import.meta.url));
        const rootDir = path.join(dirname, '../'); 
        this._storageFilePath = path.join(rootDir, 'local.json');
        // console.log(`[NodeStorage _initializePath] Calculated storage path: ${this._storageFilePath}`); 
    } catch (err) {
       console.error("Failed to calculate NodeStorage path:", err);
       this._storageFilePath = null;
    }
  }

  // Use statically imported fs
  async _readData() {
    this._initializePath(); 
    if (!this._storageFilePath) return {}; 
    if (this._cache !== null) return this._cache;
    try {
      const data = await fs.readFile(this._storageFilePath, 'utf-8'); // Uses imported fs
      this._cache = JSON.parse(data);
    } catch (error) {
       if (error.code === 'ENOENT') { this._cache = {}; }
       else { console.error(/*...*/); this._cache = {}; }
    }
    return this._cache;
  }

  // Use statically imported fs
  async _writeData(data) {
     this._initializePath(); 
     if (!this._storageFilePath) { /* ... */ return; }
    try {
      this._cache = data; 
      const jsonData = JSON.stringify(data, null, 2);
      this._pendingWritePromise = this._pendingWritePromise.then(async () => {
          await fs.writeFile(this._storageFilePath, jsonData); // Uses imported fs
      }).catch(error => {
         // ... error handling ...
      });
    } catch (error) {
      // ... error handling ...
    }
  }

  async get(key, defaultValue = null) {
      // Ensure path is calculated before reading
      this._initializePath(); 
      const data = await this._readData();
      return data.hasOwnProperty(key) ? data[key] : defaultValue;
  }

  async set(key, value) {
      // Ensure path is calculated before reading for set logic
      this._initializePath();
      const data = await this._readData();
      let changed = false;
      if (value === undefined || value === null) {
          if (data.hasOwnProperty(key)) {
              delete data[key];
              changed = true;
          }
      } else {
          if (data[key] !== value) {
              data[key] = value;
              changed = true;
          }
      }
      if (changed) {
          this._writeData(data); 
      }
  }

  async remove(key) {
    await this.set(key, null); // Use set(key, null) to handle deletion
  }

  // Method to await the last pending write
  async flushWrites() {
    console.log("[NodeStorage flushWrites] Awaiting pending write operations...");
    await this._pendingWritePromise;
    console.log("[NodeStorage flushWrites] Write operations flushed.");
  }
}

// No longer throw error here
// if (!isBrowser) throw new Error('storage not available on the server')

// TODO: use a MemoryStorage fallback for browser environments that do not allow LocalStorage, eg safari private

// Use a top-level await IIFE for async export logic
let storageInstance;
if (isBrowser) {
  storageInstance = new LocalStorage();
} else {
  // This IIFE resolves immediately with the instance
  storageInstance = new NodeStorage();
}

export const storage = storageInstance;
export { isBrowser };
