import fs from 'fs/promises';      
import path from 'path';        
import { fileURLToPath } from 'url'; 

const isBrowser = typeof window !== 'undefined';

class LocalStorage {
  isNode = false;
  get(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(key);
      if (data === null) return defaultValue;
      const value = JSON.parse(data);
      return value ?? defaultValue; 
    } catch (err) {
      // console.error('Error reading localStorage key:', key, err); // Keep error logs?
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
      // console.error('Error writing localStorage key:', key, err); // Keep error logs?
    }
  }

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      // console.error('Error removing localStorage key:', key, err);
    }
  }
}

class NodeStorage {
  isNode = true;
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
    } catch (err) {
       console.error("Failed to calculate NodeStorage path:", err);
       this._storageFilePath = null;
    }
  }

  async _readData() {
    this._initializePath(); 
    if (!this._storageFilePath) return {}; 
    if (this._cache !== null) return this._cache;
    try {
      const data = await fs.readFile(this._storageFilePath, 'utf-8');
      this._cache = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') { this._cache = {}; }
      else { 
          // console.error(`[NodeStorage _readData] Error reading storage file: ${this._storageFilePath}`, error); 
          this._cache = {}; 
      }
    }
    return this._cache;
  }

  async _writeData(data) {
     this._initializePath(); 
     if (!this._storageFilePath) { 
         // console.error("[NodeStorage _writeData] Cannot write, path not initialized.");
         return; 
     }
    try {
      this._cache = data; 
      const jsonData = JSON.stringify(data, null, 2);
      this._pendingWritePromise = this._pendingWritePromise.then(async () => {
          await fs.writeFile(this._storageFilePath, jsonData); 
      }).catch(error => {
         // console.error(`[NodeStorage _writeData] Error writing storage file: ${this._storageFilePath}`, error);
      });
    } catch (error) {
      // console.error(`[NodeStorage _writeData] Error preparing write for storage file: ${this._storageFilePath}`, error);
    }
  }

  async get(key, defaultValue = null) {
      this._initializePath(); 
      const data = await this._readData();
      return data.hasOwnProperty(key) ? data[key] : defaultValue;
  }

  async set(key, value) {
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
    await this.set(key, null); 
  }

  async flushWrites() {
    // console.log("[NodeStorage flushWrites] Awaiting pending write operations...");
    await this._pendingWritePromise;
    // console.log("[NodeStorage flushWrites] Write operations flushed.");
  }
}

// Export logic remains the same
export const storage = isBrowser ? new LocalStorage() : new NodeStorage();
// No longer need to export isBrowser
// export { isBrowser }; 
