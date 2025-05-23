import 'ses'
import '../core/lockdown'
import path from 'path'
import { fileURLToPath } from 'url'

// support `__dirname` in ESM
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))

export { createNodeClientWorld } from '../core/createNodeClientWorld'
export { System } from '../core/systems/System'
export { storage } from '../core/storage'
export { World } from '../core/World.js'
export { Node } from '../core/nodes/Node.js'
