import { System } from './System';
import { buttons, codeToProp } from '../extras/buttons';

/**
 * Agent Controls System
 *
 * Minimal controls system for Node.js agents.
 * Allows setting key states programmatically.
 * Provides the same interface structure as ClientControls
 * for compatibility with systems like PlayerLocal.
 */

// Helper to create the button state object
function createButtonState() {
  return {
    $button: true, // Mark as a button object
    down: false,
    pressed: false,
    released: false,
  };
}

// Export the class directly
export class AgentControls extends System {
  constructor(world) {
    super(world);
    this._buttonStates = {};

    // Pre-populate common keys expected by PlayerLocal
    const commonKeys = [
      'keyW', 'keyA', 'keyS', 'keyD',
      'space', 'shiftLeft', 'shiftRight', 'controlLeft', 'keyC', 'keyF', 'keyE',
      'arrowUp', 'arrowDown', 'arrowLeft', 'arrowRight'
      // Add any other keys PlayerLocal might read
    ];
    commonKeys.forEach(key => {
      this._buttonStates[key] = createButtonState();
    });
    
    // Also add mouse buttons if needed (unlikely for basic agent)
    // this._buttonStates['mouseLeft'] = createButtonState();
    // this._buttonStates['mouseRight'] = createButtonState();
  }

  // Method for the agent script to set a key state
  setKey(keyName, isDown) {
    if (!this._buttonStates[keyName]) {
      // console.warn(`AgentControls: Key "${keyName}" not pre-defined, creating dynamically.`);
      this._buttonStates[keyName] = createButtonState();
    }
    const state = this._buttonStates[keyName];
    
    if (isDown && !state.down) {
      state.pressed = true; // Set pressed on the tick it goes down
      state.released = false;
    } else if (!isDown && state.down) {
      state.released = true; // Set released on the tick it goes up
      state.pressed = false;
    }
    state.down = isDown;
  }

  // Method for systems (like PlayerLocal) to get a key state object
  getKey(keyName) {
    console.log(`[AgentControls getKey] Getting state for key: "${keyName}"`); 
    if (!this._buttonStates[keyName]) {
        console.log(`[AgentControls getKey] Key "${keyName}" not found, creating default.`);
        this._buttonStates[keyName] = createButtonState();
    }
    const state = this._buttonStates[keyName];
    console.log(`[AgentControls getKey] Returning state for "${keyName}":`, state);
    return state;
  }
  
  // Mimic the proxy access of ClientControls for compatibility
  get(keyName) {
      return this.getKey(keyName);
  }

  // Reset pressed/released flags at the end of the frame (like ClientControls)
  postLateUpdate() {
    for (const key in this._buttonStates) {
      const state = this._buttonStates[key];
      state.pressed = false;
      state.released = false;
    }
  }
  
  // Return the proxied instance itself so PlayerLocal gets the correct reference
  bind(options) { 
      // console.warn("AgentControls.bind() called."); // Keep warning commented unless needed
      // PlayerLocal expects bind() to return the object with key states
      return this; 
  }

  // Dummy release/setActions, called by PlayerLocal but do nothing for agent
  release() {}
  setActions() {}

  // Provide dummy camera/pointer/screen if absolutely necessary, but avoid if possible
  get camera() { return undefined; }
  get pointer() { return undefined; }
  get screen() { return undefined; }
  get scrollDelta() { 
      console.log("[AgentControls] get scrollDelta called.");
      return { value: 0 }; 
  }
  // ... add other dummy properties if required by PlayerLocal or other systems ...
}

// Define the proxy handler separately
export const controlProxyHandler = {
    get(target, prop) {
        // Remove logging now that we know the issue
        if (prop in target || typeof target[prop] === 'function' || typeof prop === 'symbol' || prop.startsWith('_')) {
            return Reflect.get(target, prop);
        }
        // console.log(`[AgentControls Proxy] Intercepting get for key: "${String(prop)}"`); 
        return target.getKey(prop);
    }
};

// REMOVE the factory function export
// export const AgentControls = (world) => new Proxy(new AgentControlsInternal(world), controlProxyHandler); 