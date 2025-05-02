import moment from 'moment'
import { emoteUrls } from '../extras/playerEmotes'
import { readPacket, writePacket } from '../packets'
import { storage } from '../storage'
import { uuid } from '../utils'
import { hashFile } from '../utils-client'
import { System } from './System'

/**
 * Client Network System
 *
 * - runs on the client
 * - provides abstract network methods matching ServerNetwork
 *
 */
export class ClientNetwork extends System {
  constructor(world) {
    super(world)
    this.ids = -1
    this.ws = null
    this.apiUrl = null
    this.id = null
    this.isClient = true
    this.queue = []
  }

  init({ wsUrl, initialAuthToken }) {
    const authToken = initialAuthToken;
    const connectionUrl = (authToken && typeof authToken === 'string') 
                          ? `${wsUrl}?authToken=${encodeURIComponent(authToken)}`
                          : wsUrl;
    this.ws = new WebSocket(connectionUrl);
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('message', this.onPacket);
    this.ws.addEventListener('close', this.onClose);
  }

  preFixedUpdate() {
    console.log("[ClientNetwork.preFixedUpdate] Called."); 
    this.flush()
  }

  send(name, data) {
    // console.log('->', name, data)
    const packet = writePacket(name, data)
    this.ws.send(packet)
  }

  async upload(file) {
    {
      // first check if we even need to upload it
      const hash = await hashFile(file)
      const ext = file.name.split('.').pop().toLowerCase()
      const filename = `${hash}.${ext}`
      const url = `${this.apiUrl}/upload-check?filename=${filename}`
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.exists) return // console.log('already uploaded:', filename)
    }
    // then upload it
    const form = new FormData()
    form.append('file', file)
    const url = `${this.apiUrl}/upload`
    await fetch(url, {
      method: 'POST',
      body: form,
    })
  }

  enqueue(method, data) {
    console.log(`[ClientNetwork enqueue] Queuing method: ${method}`);
    this.queue.push([method, data])
  }

  flush() {
    if (this.queue.length > 0) {
        console.log(`[ClientNetwork flush] Flushing queue, size: ${this.queue.length}`);
    }
    while (this.queue.length) {
      try {
        const [method, data] = this.queue.shift()
        console.log(`[ClientNetwork flush] Executing method: ${method}`);
        this[method]?.(data)
      } catch (err) {
        console.error(`[ClientNetwork flush] Error executing method: ${err}`);
      }
    }
  }

  getTime() {
    return (performance.now() + this.serverTimeOffset) / 1000 // seconds
  }

  onPacket = e => {
    // --> Log raw message details <--
    console.log(`[ClientNetwork onPacket] Raw message received. Type: ${typeof e.data}, Size: ${e.data?.byteLength || e.data?.length || 'N/A'}`);
    
    const [method, data] = readPacket(e.data);
    if (method) { 
      console.log(`[ClientNetwork onPacket] Decoded packet method: ${method}`); 
    } else {
      console.error(`[ClientNetwork onPacket] Failed to decode packet.`);
    }
    this.enqueue(method, data);
  }

  onSnapshot(data) {
    console.log("[ClientNetwork onSnapshot] Method called.");
    this.id = data.id;
    this.serverTimeOffset = data.serverTime - performance.now();
    this.apiUrl = data.apiUrl;
    this.maxUploadSize = data.maxUploadSize;
    this.world.assetsUrl = data.assetsUrl;

    // Skip preload logic for agent, as ClientLoader is not present
    // this.world.loader.preload(...) 
    // this.world.loader.execPreload();

    // Deserialize core world state
    this.world.settings?.deserialize(data.settings);
    this.world.chat?.deserialize(data.chat);
    this.world.blueprints?.deserialize(data.blueprints);
    this.world.entities?.deserialize(data.entities);
    this.world.livekit?.deserialize(data.livekit);
    
    console.log(`[ClientNetwork onSnapshot] Received authToken: ${data.authToken}`); 
    try {
        storage.set('authToken', data.authToken); 
        console.log(`[ClientNetwork onSnapshot] Called storage.set with token.`); 
    } catch (e) {
        console.error("[ClientNetwork onSnapshot] Error calling storage.set:", e); 
    }

    // --> Restore preload logic, guarded for client environment <--
    if (this.world.loader) {
        console.log("[ClientNetwork onSnapshot] Running preload logic for client...");
        // preload environment model and avatar
        if (data.settings.model) {
          this.world.loader.preload('model', data.settings.model.url);
        } else if (this.world.environment?.base?.model) { // Check environment exists
          this.world.loader.preload('model', this.world.environment.base.model);
        }
        if (data.settings.avatar) {
          this.world.loader.preload('avatar', data.settings.avatar.url);
        }
        // preload some blueprints
        for (const item of data.blueprints) {
          if (item.preload) {
            if (item.model) {
              const type = item.model.endsWith('.vrm') ? 'avatar' : 'model';
              this.world.loader.preload(type, item.model);
            }
            if (item.script) {
              this.world.loader.preload('script', item.script);
            }
            for (const value of Object.values(item.props || {})) {
              if (value === undefined || value === null || !value?.url || !value?.type) continue;
              this.world.loader.preload(value.type, value.url);
            }
          }
        }
        // preload emotes
        for (const url of emoteUrls) {
          this.world.loader.preload('emote', url);
        }
        // preload local player avatar
        for (const item of data.entities) {
          if (item.type === 'player' && item.owner === this.id) {
            const url = item.sessionAvatar || item.avatar;
            if (url) { // Check if url is valid
                 this.world.loader.preload('avatar', url);
            }
          }
        }
        // Execute preload and emit ready *only* if loader exists
        this.world.loader.execPreload(); 
    } else {
        // Manually emit ready for agent if no loader (restoring previous agent fix)
        console.log("[ClientNetwork onSnapshot] Loader not found, emitting 'ready' event for agent.");
        this.world.emit('ready', true);
    }
  }

  onSettingsModified = data => {
    this.world.settings.set(data.key, data.value)
  }

  onChatAdded = msg => {
    this.world.chat.add(msg, false)
  }

  onChatCleared = () => {
    this.world.chat.clear()
  }

  onBlueprintAdded = blueprint => {
    this.world.blueprints.add(blueprint)
  }

  onBlueprintModified = change => {
    this.world.blueprints.modify(change)
  }

  onEntityAdded = data => {
    this.world.entities.add(data)
  }

  onEntityModified = data => {
    const entity = this.world.entities.get(data.id)
    if (!entity) return console.error('onEntityModified: no entity found', data)
    entity.modify(data)
  }

  onEntityEvent = event => {
    const [id, version, name, data] = event
    const entity = this.world.entities.get(id)
    entity?.onEvent(version, name, data)
  }

  onEntityRemoved = id => {
    this.world.entities.remove(id)
  }

  onPlayerTeleport = data => {
    this.world.entities.player?.teleport(data)
  }

  onPlayerPush = data => {
    this.world.entities.player?.push(data.force)
  }

  onPlayerSessionAvatar = data => {
    this.world.entities.player?.setSessionAvatar(data.avatar)
  }

  onPong = time => {
    this.world.stats?.onPong(time)
  }

  onKick = code => {
    this.world.emit('kick', code)
  }

  onClose = code => {
    this.world.chat.add({
      id: uuid(),
      from: null,
      fromId: null,
      body: `You have been disconnected.`,
      createdAt: moment().toISOString(),
    })
    this.world.emit('disconnect', code || true)
    console.log('disconnect', code)
  }
}
