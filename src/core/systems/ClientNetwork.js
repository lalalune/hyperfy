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
    this.flush()
  }

  send(name, data) {
    const packet = writePacket(name, data)
    this.ws.send(packet)
  }

  async upload(file) {
    {
      const hash = await hashFile(file)
      const ext = file.name.split('.').pop().toLowerCase()
      const filename = `${hash}.${ext}`
      const url = `${this.apiUrl}/upload-check?filename=${filename}`
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.exists) return
    }
    const form = new FormData()
    form.append('file', file)
    const url = `${this.apiUrl}/upload`
    await fetch(url, {
      method: 'POST',
      body: form,
    })
  }

  enqueue(method, data) {
    this.queue.push([method, data])
  }

  flush() {
    while (this.queue.length) {
      try {
        const [method, data] = this.queue.shift()
        this[method]?.(data)
      } catch (err) {
      }
    }
  }

  getTime() {
    return (performance.now() + this.serverTimeOffset) / 1000
  }

  onPacket = e => {
    const [method, data] = readPacket(e.data);
    if (method) { 
    } else {
    }
    this.enqueue(method, data);
  }

  onSnapshot(data) {
    this.id = data.id;
    this.serverTimeOffset = data.serverTime - performance.now();
    this.apiUrl = data.apiUrl;
    this.maxUploadSize = data.maxUploadSize;
    this.world.assetsUrl = data.assetsUrl;

    this.world.settings?.deserialize(data.settings);
    this.world.chat?.deserialize(data.chat);
    this.world.blueprints?.deserialize(data.blueprints);
    this.world.entities?.deserialize(data.entities);
    this.world.livekit?.deserialize(data.livekit);
    
    try {
        storage.set('authToken', data.authToken); 
    } catch (e) {
    }

    if (this.world.loader) {
        this.world.loader.execPreload(); 
    } else {
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
  }
}
