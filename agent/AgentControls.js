import { System } from '../build/core.js';

// Helper to create the button state object
function createButtonState() {
  return {
    $button: true, 
    down: false,
    pressed: false,
    released: false,
  };
}

// Simplified AgentControls without Proxy
export class AgentControls extends System {
  constructor(world) {
    super(world);
    // Define expected control properties directly on the instance
    const commonKeys = [
      'keyW', 'keyA', 'keyS', 'keyD',
      'space', 'shiftLeft', 'shiftRight', 'controlLeft', 'keyC', 'keyF', 'keyE',
      'arrowUp', 'arrowDown', 'arrowLeft', 'arrowRight',
      'touchA', 'touchB', // Add touch if PlayerLocal might check them
      'xrLeftStick', 'xrRightStick', // Add dummy XR if needed
      'xrLeftBtn1', 'xrLeftBtn2', 'xrRightBtn1', 'xrRightBtn2'
    ];
    commonKeys.forEach(key => {
      this[key] = createButtonState(); 
    });

    // Add other expected properties with default/dummy values
    this.scrollDelta = { value: 0 };
    this.pointer = { locked: false, delta: { x:0, y:0 } }; // Add dummy pointer needed by PlayerLocal
    this.camera = undefined; // PlayerLocal checks for this
    this.screen = undefined; // PlayerLocal checks for this

    // Add dummy XR sticks if PlayerLocal accesses them directly
    if (!this.xrLeftStick) this.xrLeftStick = { value: {x:0, y:0, z:0} };
    if (!this.xrRightStick) this.xrRightStick = { value: {x:0, y:0, z:0} };

  }

  // Method for the agent script to set a key state
  setKey(keyName, isDown) {
    if (!this[keyName] || !this[keyName].$button) {
      // console.warn(`AgentControls: Key "${keyName}" not defined or not a button state.`);
      this[keyName] = createButtonState(); // Create if missing
    }
    const state = this[keyName];
    
    if (isDown && !state.down) {
      state.pressed = true; 
      state.released = false;
    } else if (!isDown && state.down) {
      state.released = true; 
      state.pressed = false;
    }
    state.down = isDown;
  }

  // Reset pressed/released flags at the end of the frame
  postLateUpdate() {
    for (const key in this) {
       // Check if it's actually a button state object we manage
      if (this.hasOwnProperty(key) && this[key]?.$button) { 
        this[key].pressed = false;
        this[key].released = false;
      }
    }
  }
  
  // Dummy bind/release/setActions needed for PlayerLocal init check
  bind(options) { 
      return this; 
  }
  release() {}
  setActions() {}
}

// Remove Proxy handler and related export
/*
export const controlProxyHandler = { ... };
*/ 