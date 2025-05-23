import 'dotenv-flow/config'
import fs from 'fs-extra'
import path from 'path'
import { fork, execSync } from 'child_process'
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'url'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'

const dev = process.argv.includes('--dev')
const dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(dirname, '../')
const buildDir = path.join(rootDir, 'build') // This can remain for other potential build outputs or be removed if not used elsewhere
const npmPackageDir = path.join(rootDir, 'dist/npm')

// await fs.emptyDir(buildDir) // Keep if buildDir is still used for other things
await fs.emptyDir(npmPackageDir) // Ensure the new package directory is clean

/**
 * Build Node Client
 *
 * This creates a hybrid client build that can in nodejs headlessly, as such it doesn't utilize rendering and other systems
 * that use browser apis
 *
 */

let spawn

{
  // Read root package.json for details
  const rootPackageJson = await fs.readJson(path.join(rootDir, 'package.json'))

  const nodeClientCtx = await esbuild.context({
    entryPoints: ['src/node-client/index.js'],
    outfile: path.join(npmPackageDir, 'index.js'), // Changed output path
    platform: 'node',
    format: 'esm',
    bundle: true,
    treeShaking: true,
    minify: false,
    sourcemap: true,
    packages: 'external',
    loader: {},
    plugins: [
      {
        name: 'server-finalize-plugin',
        setup(build) {
          build.onEnd(async result => {
            if (result.errors.length > 0) {
              console.error('Build failed with errors:', result.errors)
              if (!dev) process.exit(1) // Exit if not in dev mode
              return
            }

            // copy over physx js
            // copy over physx js and wasm to a vendor subdirectory
            const vendorDir = path.join(npmPackageDir, 'vendor')
            await fs.ensureDir(vendorDir) // Ensure vendor directory exists
            const physxIdlSrc = path.join(rootDir, 'src/core/physx-js-webidl.js')
            const physxIdlDest = path.join(vendorDir, 'physx-js-webidl.js') // Changed destination
            await fs.copy(physxIdlSrc, physxIdlDest)
            // copy over physx wasm
            const physxWasmSrc = path.join(rootDir, 'src/core/physx-js-webidl.wasm')
            const physxWasmDest = path.join(vendorDir, 'physx-js-webidl.wasm') // Changed destination
            await fs.copy(physxWasmSrc, physxWasmDest)

            // Generate package.json for the NPM package
            const packageJson = {
              name: rootPackageJson.name || 'hyperfy', // fallback if not in root
              version: rootPackageJson.version || '0.0.0', // fallback
              type: 'module',
              main: 'index.js',
              types: 'index.d.ts',
              license: rootPackageJson.license || 'UNLICENSED', // fallback
              dependencies: {
                ses: rootPackageJson.dependencies?.ses || 'latest',
                eventemitter3: rootPackageJson.dependencies?.eventemitter3 || 'latest',
                three: rootPackageJson.dependencies?.three || 'latest',
                'lodash-es': rootPackageJson.dependencies?.['lodash-es'] || 'latest',
                // msgpackr was removed as it wasn't found in direct imports of the client bundle
              },
            }
            }
            await fs.writeJson(path.join(npmPackageDir, 'package.json'), packageJson, { spaces: 2 })

            }
            await fs.writeJson(path.join(npmPackageDir, 'package.json'), packageJson, { spaces: 2 })

            // Generate index.d.ts using dts-bundle-generator with a tsconfig file
            try {
              const tsconfigPath = path.join(rootDir, 'tsconfig.dts.json'); // Path to the new tsconfig
              const inputFile = path.join(rootDir, 'src/node-client/index.js'); // Entry point for dts-bundle-generator
              const outputFile = path.join(npmPackageDir, 'index.d.ts');

              // Ensure tsconfig.dts.json exists (created in previous step)
              if (!fs.existsSync(tsconfigPath)) {
                throw new Error(`tsconfig.dts.json not found at ${tsconfigPath}. Please create it.`);
              }
              
              // The input file for dts-bundle-generator should be relative to the CWD (rootDir) or absolute.
              // The output file path should also be correctly specified.
              execSync(`npx dts-bundle-generator --project "${tsconfigPath}" -o "${outputFile}" "${inputFile}"`, {
                stdio: 'inherit', // Show output from the command
                cwd: rootDir, // Run from project root to ensure paths in tsconfig are resolved correctly
              });
              console.log('index.d.ts generated successfully using dts-bundle-generator and tsconfig.dts.json.');
            } catch (error) {
              console.error('Error generating index.d.ts with dts-bundle-generator:', error.message);
              if (error.stdout) console.error('stdout:', error.stdout.toString());
              if (error.stderr) console.error('stderr:', error.stderr.toString());
              console.warn('Falling back to a more structured (but still potentially incomplete) manual index.d.ts generation.');
              const fallbackDtsContent = `// Fallback index.d.ts - dts-bundle-generator failed.
// This is a manually structured declaration file. It may need to be updated if the API changes.
// For best results, ensure dts-bundle-generator can run successfully.
// Check build logs for errors from dts-bundle-generator and address them.

// Assuming the package name will be 'hyperfy' or similar when used as a module.
// Adjust module name if necessary based on actual usage.
declare module '${rootPackageJson.name || 'hyperfy'}' {

  // Basic placeholder types - Ideally, these would be imported or defined by 'three'
  // If 'three' types are correctly picked up by the consumer's TypeScript, these might not be needed here.
  export interface Vector3 {
    x: number; y: number; z: number;
    set(x: number, y: number, z: number): this;
    fromArray(array: number[], offset?: number): this;
    // Add other common Vector3 methods/properties if needed
  }
  export interface Quaternion {
    x: number; y: number; z: number; w: number;
    set(x: number, y: number, z: number, w: number): this;
    fromArray(array: number[], offset?: number): this;
    // Add other common Quaternion methods/properties if needed
  }
  export interface Euler {
    x: number; y: number; z: number; order: string;
    setFromQuaternion(q: Quaternion, order?: string, update?: boolean): this;
    // Add other common Euler methods/properties if needed
  }
  export interface Matrix4 {
    // Add common Matrix4 methods/properties if needed
  }

  // Forward declaration for World if needed by System or Node constructor signatures
  export class World {}

  export class Node {
    id: string;
    name: string;
    parent: Node | null;
    children: Node[];
    position: Vector3;
    quaternion: Quaternion;
    rotation: Euler;
    scale: Vector3;
    matrix: Matrix4;
    matrixWorld: Matrix4;
    active: boolean;

    constructor(data?: Record<string, any>); // Loosen data type for fallback

    add(node: Node): this;
    remove(node: Node): this;
    get(id: string): Node | null;
    traverse(callback: (node: Node) => void): void;
    // Minimal common methods based on src/core/nodes/Node.js
    // Consider adding: clone, copy, getWorldPosition, updateTransform, clean, etc.
    // JSDoc from source files should ideally provide these details for dts-bundle-generator.
  }

  export class System {
    world: World;
    constructor(world: World);

    init?(options?: any): Promise<void> | void;
    start?(): void;
    preTick?(): void;
    // Add other lifecycle methods: preFixedUpdate, fixedUpdate, postFixedUpdate, preUpdate, update, postUpdate, lateUpdate, postLateUpdate, commit, postTick, destroy
  }
  
  export interface Storage {
    get(key: string, defaultValue?: any): any;
    set(key: string, value: any): void;
    remove(key: string): void;
  }
  export const storage: Storage;

  export class World extends EventEmitter { // Assuming World extends EventEmitter based on src/core/World.js
    // Systems - these would ideally have their own class types if complex
    settings: System; // Replace 'System' with actual 'SettingsSystem' type if defined
    collections: System;
    apps: System;
    anchors: System;
    events: System;
    scripts: System;
    chat: System;
    blueprints: System;
    entities: System;
    physics: System;
    stage: System;
    // Add other systems if present (e.g., from createNodeClientWorld)
    client?: System;
    controls?: System;
    network?: System;
    loader?: System;
    environment?: System;

    constructor();

    register(key: string, systemClass: typeof System): System; // systemClass should be newable
    init(options: { storage: Storage; assetsDir?: string; /* other options */ }): Promise<void>;
    start(): void;
    tick(time: number): void;
    // Add other public methods from World.js, e.g., resolveURL, setHot, get, etc.
    // JSDoc from source files should ideally provide these details for dts-bundle-generator.
  }
  
  // Assuming EventEmitter is a known type, e.g., from 'eventemitter3'
  // If not, a basic EventEmitter type would need to be declared here.
  // For simplicity in fallback, it's omitted but acknowledged.
  // import { EventEmitter } from 'eventemitter3'; // This would be ideal if 'eventemitter3' types are available

  export function createNodeClientWorld(options?: any): Promise<World>; // Refine options type
}
`;
              await fs.writeFile(path.join(npmPackageDir, 'index.d.ts'), fallbackDtsContent);
            }

            // start the server or stop here
            if (dev) {
              // (re)start server
              spawn?.kill('SIGTERM')
              // Ensure the fork path points to the new output location if dev mode needs to run the packaged output
              spawn = fork(path.join(npmPackageDir, 'index.js'))
            } else {
              console.log('NPM package built successfully to', npmPackageDir)
              process.exit(0)
            }
          })
        },
      },
    ],
  })
  if (dev) {
    await nodeClientCtx.watch()
  } else {
    await nodeClientCtx.rebuild()
    // nodeClientCtx.dispose() // Dispose context after build for non-watch mode
  }
}
