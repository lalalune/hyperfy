import 'ses';

import { performance } from 'perf_hooks'; // Node.js performance hooks
import * as THREE from 'three'; // <-- Add THREE import

import { AgentControls } from './AgentControls.js';

// --- Configuration ---
const WS_URL = process.env.WS_URL || 'ws://localhost:3000/ws';
const TICK_RATE = 50; // Hz (how often world.tick runs)
const MOVE_INTERVAL = 1000; // ms (how often the agent changes direction)
const CHAT_INTERVAL = 5000; // ms (how often the agent sends a chat message) - Updated
const LOG_INTERVAL = 1000; // ms (how often to log user data)
// ---------------------

let tickIntervalId = null;
let moveIntervalId = null;
let chatIntervalId = null;
let logIntervalId = null; // <-- Add ID for log interval
let lastChatMsgCount = 0;

let world;
if (typeof window !== 'undefined') {
  // Browser environment
  window.world = world
  window.THREE = THREE
  window.env = process.env
} else if (typeof global !== 'undefined') {
  // Node.js environment
  global.world = world
  global.THREE = THREE
  global.env = process.env
}

import { createClientWorld, loadNodePhysX, storage } from '../build/core.js';

async function runAgent() {
  console.log(`Agent connecting to ${WS_URL}...`);

  // Asynchronously get the stored auth token BEFORE initializing the world
  console.log("Attempting to retrieve stored authToken...");
  const initialAuthToken = await storage.get('authToken');
  console.log(`Retrieved initialAuthToken: ${initialAuthToken}`);


  function registerSystem(key, SystemClass, proxyHandler = null) {
    const system = new SystemClass(world)
    world[key] = proxyHandler ? new Proxy(system, proxyHandler) : system
    world.systems.push(system) // Push the original system for the update loop
    return system
  }

  // Specify 'node' environment to load only necessary core systems
  world = createClientWorld({ env: 'node' });

  registerSystem('controls', AgentControls)

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
    initialAuthToken: initialAuthToken // <-- Pass the retrieved token here
  };

  try {
    await world.init(config);
    console.log('World initialized...');

    // Start the simulation loop IMMEDIATELY after init
    startSimulation();

    // Start the other functions - they will wait internally for the player
    startRandomMovement();
    startChatSubscription();
    startRandomChatting();
    startUserDataLogging();

    // Keep listening for disconnect/kick
    world.on('disconnect', (reason) => {
      console.log('Agent Disconnected.', reason);
      stopAgent();
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
      // console.log(`[Agent tickLoop] Running at time: ${now}`); // <-- Log loop entry
      try {
          world.tick(now); 
          // console.log(`[Agent tickLoop] world.tick completed.`); // <-- Log after tick (if no error)
      } catch (e) {
          console.error("[Agent tickLoop] Error during world.tick:", e); // <-- Catch errors
          // Optionally stop the loop on error:
          // if (tickIntervalId) clearTimeout(tickIntervalId);
          // stopAgent(); 
          // return; 
      }
      lastTickTime = now;
      // Schedule next tick precisely
      const elapsed = performance.now() - now;
      const delay = Math.max(0, tickIntervalMs - elapsed);
      // console.log(`[Agent tickLoop] Scheduling next tick with delay: ${delay.toFixed(2)}ms`); // <-- Log scheduling
      tickIntervalId = setTimeout(tickLoop, delay); 
  }
  
  console.log(`[Agent startSimulation] Starting simulation tick at ${TICK_RATE}Hz.`); // <-- Log start func
  tickLoop(); // Start the first tick
}


function startRandomMovement() {
  if (moveIntervalId) clearInterval(moveIntervalId);
  console.log(`[Agent startRandomMovement] Initializing interval every ${MOVE_INTERVAL}ms.`);
  
  // Store the currently active key to easily turn it off
  let currentKey = null;

  moveIntervalId = setInterval(() => {
    // --> WAIT for player entity <--
    if (!world || !world.entities?.player) {
      // console.log("[Agent startRandomMovement] Waiting for player entity...");
      return; 
    }
    const controls = world.controls; // Get controls inside interval once player exists
    if (!controls || typeof controls.setKey !== 'function') {
      console.error("[Agent startRandomMovement] AgentControls system not found or missing setKey method!");
      clearInterval(moveIntervalId); // Stop trying if controls are wrong
      return;
    }

    // Turn off the previously active key (if any)
    if (currentKey) {
      controls.setKey(currentKey, false);
      currentKey = null;
    }
    // Reset shift key
    controls.setKey('shiftLeft', false);

    const direction = Math.floor(Math.random() * 5); // 0:W, 1:A, 2:S, 3:D, 4:Stop
    let moveKey = null;

    switch (direction) {
      case 0: moveKey = 'keyW'; console.log("Agent moving: FORWARD"); break;
      case 1: moveKey = 'keyA'; console.log("Agent moving: LEFT"); break;
      case 2: moveKey = 'keyS'; console.log("Agent moving: BACKWARD"); break;
      case 3: moveKey = 'keyD'; console.log("Agent moving: RIGHT"); break;
      case 4: /* Stop */ console.log("Agent moving: STOP"); break;
    }

    // Set the new key state
    if (moveKey) {
      controls.setKey(moveKey, true);
      currentKey = moveKey; // Remember which key is active
    }

    // Maybe randomly run sometimes?
    if (moveKey && Math.random() < 0.2) {
        controls.setKey('shiftLeft', true);
    }

  }, MOVE_INTERVAL);
}

function startChatSubscription() {
  if (!world || !world.chat) {
    console.error("Cannot subscribe to chat: World or Chat system not available.");
    return;
  }
  console.log("[Agent startChatSubscription] Initializing chat subscription...");
  lastChatMsgCount = 0; // Start count at 0, will sync on first message

  world.chat.subscribe(msgs => {
    // --> WAIT for player entity (ensures world/chat exist too) <--
    if (!world || !world.entities?.player) return;
    
    // console.log(`[DEBUG] Chat subscribe callback received. Msgs length: ${msgs.length}, Last count: ${lastChatMsgCount}`);
    if (msgs.length > lastChatMsgCount) {
      // ... rest of logging logic ...
    }
    lastChatMsgCount = msgs.length;
  });
}

function startRandomChatting() {
  if (chatIntervalId) clearInterval(chatIntervalId);
  console.log(`[Agent startRandomChatting] Initializing interval every ${CHAT_INTERVAL}ms.`);

  const messagesToSend = [
    "hello",
    "hi",
    "hey",
  ];

  chatIntervalId = setInterval(() => {
    // --> WAIT for player entity <--
    if (!world || !world.chat || !world.entities?.player) {
      // console.log("[Agent startRandomChatting] Waiting for player/chat...");
      return; 
    }

    // ... rest of chat sending logic ...

  }, CHAT_INTERVAL);
}

function startUserDataLogging() {
  if (logIntervalId) clearInterval(logIntervalId);
  console.log(`[Agent startUserDataLogging] Initializing interval every ${LOG_INTERVAL}ms.`);

  const baseForward = new THREE.Vector3(0, 0, -1);
  const currentDirection = new THREE.Vector3();

  logIntervalId = setInterval(() => {
    // --> WAIT for player entity <--
    if (!world || !world.entities?.player) {
       // console.log("[Agent startUserDataLogging] Waiting for player entity...");
       return;
    }

    // ... rest of logging logic ...

  }, LOG_INTERVAL);
}

// Make stopAgent async to await storage flush
async function stopAgent() { 
  console.log('Stopping agent...');
  if (tickIntervalId) clearTimeout(tickIntervalId);
  if (moveIntervalId) clearInterval(moveIntervalId);
  if (chatIntervalId) clearInterval(chatIntervalId); 
  if (logIntervalId) clearInterval(logIntervalId);
  tickIntervalId = null;
  moveIntervalId = null;
  chatIntervalId = null; 
  logIntervalId = null; 
  
  // Flush storage writes before destroying world or exiting
  if (storage?.isNodeStorage) { // Check if it's NodeStorage using the flag
      try {
          await storage.flushWrites();
      } catch(e) {
          console.error("Error flushing storage writes during shutdown:", e);
      }
  } else if (storage) {
      console.log("[stopAgent] Storage is not NodeStorage, skipping flush.");
  }

  world?.destroy(); 
  world = null;
  console.log('Agent stopped.');
  process.exit(0);
}

// Handle graceful shutdown - make handlers async
process.on('SIGINT', async () => { 
    console.log("SIGINT received.");
    await stopAgent(); 
});
process.on('SIGTERM', async () => { 
    console.log("SIGTERM received.");
    await stopAgent(); 
});

// Start the agent
runAgent();
