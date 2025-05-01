import { createClientWorld, loadNodePhysX } from './build/core.js';
import { performance } from 'perf_hooks'; // Node.js performance hooks

// --- Configuration ---
const WS_URL = process.env.WS_URL || 'ws://localhost:8080';
const TICK_RATE = 50; // Hz (how often world.tick runs)
const MOVE_INTERVAL = 1000; // ms (how often the agent changes direction)
// ---------------------

let world;
let tickIntervalId = null;
let moveIntervalId = null;

async function runAgent() {
  console.log(`Agent connecting to ${WS_URL}...`);
  world = createClientWorld();

  // Mock viewport/UI elements needed by some client systems
  const mockElement = {
    appendChild: () => {},
    removeChild: () => {},
    offsetWidth: 1920,
    offsetHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {},
    style: {},
  };

  const config = {
    wsUrl: WS_URL,
    loadPhysX: loadNodePhysX,
    viewport: mockElement, // Mock
    ui: mockElement, // Mock
    // storage: null, // Optional: Provide storage if needed by systems
    // baseEnvironment: { ... } // Optional: Define if needed
  };

  try {
    await world.init(config);
    console.log('World initialized...');

    world.on('ready', () => {
      console.log('Agent Ready! Player ID:', world.entities.player?.data?.id);
      if (!world.entities.player) {
        console.error("Agent connected but couldn't find player entity.");
        stopAgent();
        return;
      }
      startSimulation();
      startRandomMovement();
    });

    world.on('disconnect', (reason) => {
      console.log('Agent Disconnected.', reason);
      stopAgent();
      // Optional: Implement reconnection logic here
    });

    world.on('kick', (code) => {
      console.log('Agent Kicked:', code);
      stopAgent();
    });

  } catch (error) {
    console.error('Failed to initialize agent:', error);
    stopAgent();
  }
}

function startSimulation() {
  if (tickIntervalId) clearInterval(tickIntervalId);
  const tickIntervalMs = 1000 / TICK_RATE;
  let lastTickTime = performance.now();

  function tickLoop() {
      const now = performance.now();
      // world.tick expects time in seconds, but internally uses ms. Let's pass ms.
      // Correction: world.tick internally divides by 1000, so pass ms.
      world.tick(now);
      lastTickTime = now;
      // Schedule next tick precisely
      const elapsed = performance.now() - now;
      const delay = Math.max(0, tickIntervalMs - elapsed);
      tickIntervalId = setTimeout(tickLoop, delay);
  }
  
  console.log(`Starting simulation tick at ${TICK_RATE}Hz.`);
  tickLoop(); // Start the first tick
}


function startRandomMovement() {
  if (moveIntervalId) clearInterval(moveIntervalId);
  console.log(`Starting random movement every ${MOVE_INTERVAL}ms.`);

  const controls = world.controls;
  if (!controls) {
      console.error("Controls system not found!");
      return;
  }

  moveIntervalId = setInterval(() => {
    if (!world || !world.entities.player) {
      console.log("No player entity, stopping movement.");
      stopAgent();
      return;
    }

    // Reset previous movement keys
    controls.keyW.down = false;
    controls.keyA.down = false;
    controls.keyS.down = false;
    controls.keyD.down = false;
    controls.shiftLeft.down = false; // Ensure not running unless intended

    const direction = Math.floor(Math.random() * 5); // 0:W, 1:A, 2:S, 3:D, 4:Stop

    switch (direction) {
      case 0: // Forward
        console.log("Agent moving: FORWARD");
        controls.keyW.down = true;
        break;
      case 1: // Left
        console.log("Agent moving: LEFT");
        controls.keyA.down = true;
        break;
      case 2: // Backward
        console.log("Agent moving: BACKWARD");
        controls.keyS.down = true;
        break;
      case 3: // Right
        console.log("Agent moving: RIGHT");
        controls.keyD.down = true;
        break;
      case 4: // Stop
        console.log("Agent moving: STOP");
        // Keys already reset above
        break;
    }

    // Maybe randomly run sometimes?
    if (Math.random() < 0.2) {
        controls.shiftLeft.down = true;
    }


  }, MOVE_INTERVAL);
}

function stopAgent() {
  console.log('Stopping agent...');
  if (tickIntervalId) clearTimeout(tickIntervalId);
  if (moveIntervalId) clearInterval(moveIntervalId);
  tickIntervalId = null;
  moveIntervalId = null;
  world?.destroy(); // Clean up world resources
  world = null;
  console.log('Agent stopped.');
   // Exit the process if running as a standalone script
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', stopAgent);
process.on('SIGTERM', stopAgent);

// Start the agent
runAgent();
