import { Logger } from '../../core/Logger';

/**
 * Player slot in a room
 */
export interface PlayerSlot {
  /** Slot index */
  index: number;
  /** Player ID (null if empty) */
  playerId: string | null;
  /** Player name */
  playerName: string | null;
  /** Is slot locked (cannot be joined) */
  locked: boolean;
  /** Team assignment */
  team: number | null;
  /** Ready state */
  ready: boolean;
  /** Slot-specific settings */
  settings?: Record<string, any>;
}

/**
 * Room configuration
 */
export interface RoomConfig {
  /** Room name */
  name: string;
  /** Number of player slots */
  maxSlots: number;
  /** Game mode */
  gameMode: string;
  /** Map/level */
  map: string;
  /** Team mode enabled */
  teamMode: boolean;
  /** Number of teams (if team mode) */
  teamCount?: number;
  /** Room is private */
  isPrivate: boolean;
  /** Room password */
  password?: string;
  /** Custom room settings */
  custom?: Record<string, any>;
}

/**
 * Game room
 */
export interface Room {
  /** Unique room ID */
  id: string;
  /** Room configuration */
  config: RoomConfig;
  /** Player slots */
  slots: PlayerSlot[];
  /** Room host player ID */
  hostId: string;
  /** Room state */
  state: 'waiting' | 'starting' | 'in_progress' | 'finished';
  /** Room creation time */
  createdAt: number;
}

/**
 * Room manager for game room management with player slots.
 * Handles slot assignment, team balancing, and ready states.
 *
 * @example
 * ```typescript
 * const roomManager = new RoomManager();
 *
 * // Create a room
 * const room = roomManager.createRoom({
 *   name: 'Team Deathmatch',
 *   maxSlots: 8,
 *   gameMode: 'tdm',
 *   map: 'arena',
 *   teamMode: true,
 *   teamCount: 2
 * }, 'player1');
 *
 * // Join a slot
 * roomManager.joinSlot(room.id, 0, 'player2', 'Player Two');
 *
 * // Set ready
 * roomManager.setSlotReady(room.id, 0, true);
 * ```
 */
export class RoomManager {
  private readonly rooms: Map<string, Room> = new Map();
  private readonly debug: boolean;
  private readonly logger: Logger;
  private roomIdCounter: number = 0;

  constructor(debug: boolean = false) {
    this.debug = debug;
    this.logger = new Logger('RoomManager');
  }

  /**
   * Create a new room
   *
   * @param config - Room configuration
   * @param hostId - ID of player hosting the room
   * @returns Created room
   */
  public createRoom(config: RoomConfig, hostId: string): Room {
    const roomId = `room_${this.roomIdCounter++}`;

    // Create empty slots
    const slots: PlayerSlot[] = [];
    for (let i = 0; i < config.maxSlots; i++) {
      slots.push({
        index: i,
        playerId: null,
        playerName: null,
        locked: false,
        team: config.teamMode ? i % (config.teamCount || 2) : null,
        ready: false
      });
    }

    const room: Room = {
      id: roomId,
      config: { ...config },
      slots,
      hostId,
      state: 'waiting',
      createdAt: performance.now()
    };

    this.rooms.set(roomId, room);

    if (this.debug) {
      this.logger.debug(`Created room ${roomId}`, config);
    }

    return this.cloneRoom(room);
  }

  /**
   * Delete a room
   *
   * @param roomId - Room ID to delete
   * @returns True if room was deleted
   */
  public deleteRoom(roomId: string): boolean {
    const deleted = this.rooms.delete(roomId);

    if (deleted && this.debug) {
      this.logger.debug(`Deleted room ${roomId}`);
    }

    return deleted;
  }

  /**
   * Get a room by ID
   *
   * @param roomId - Room ID
   * @returns Room or undefined if not found
   */
  public getRoom(roomId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    return room ? this.cloneRoom(room) : undefined;
  }

  /**
   * Get all public rooms
   *
   * @returns Array of public rooms
   */
  public getPublicRooms(): Room[] {
    const rooms: Room[] = [];
    for (const room of this.rooms.values()) {
      if (!room.config.isPrivate && room.state === 'waiting') {
        rooms.push(this.cloneRoom(room));
      }
    }
    return rooms;
  }

  /**
   * Join a specific slot in a room
   *
   * @param roomId - Room ID
   * @param slotIndex - Slot index to join
   * @param playerId - Player ID
   * @param playerName - Player name
   * @param password - Room password (if private)
   * @returns Updated room
   */
  public joinSlot(
    roomId: string,
    slotIndex: number,
    playerId: string,
    playerName: string,
    password?: string
  ): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.state !== 'waiting') {
      throw new Error('Room is not accepting players');
    }

    if (room.config.isPrivate && room.config.password !== password) {
      throw new Error('Invalid password');
    }

    if (slotIndex < 0 || slotIndex >= room.slots.length) {
      throw new Error('Invalid slot index');
    }

    const slot = room.slots[slotIndex];
    if (slot.playerId !== null) {
      throw new Error('Slot is occupied');
    }

    if (slot.locked) {
      throw new Error('Slot is locked');
    }

    // Check if player is already in another slot
    const existingSlot = room.slots.find(s => s.playerId === playerId);
    if (existingSlot) {
      throw new Error('Player already in room');
    }

    slot.playerId = playerId;
    slot.playerName = playerName;
    slot.ready = false;

    if (this.debug) {
      this.logger.debug(`Player ${playerId} joined slot ${slotIndex} in room ${roomId}`);
    }

    return this.cloneRoom(room);
  }

  /**
   * Leave a slot
   *
   * @param roomId - Room ID
   * @param playerId - Player ID
   * @returns Updated room or null if room was deleted
   */
  public leaveSlot(roomId: string, playerId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const slot = room.slots.find(s => s.playerId === playerId);
    if (!slot) {
      throw new Error('Player not in room');
    }

    const wasHost = playerId === room.hostId;
    slot.playerId = null;
    slot.playerName = null;
    slot.ready = false;

    if (this.debug) {
      this.logger.debug(`Player ${playerId} left slot ${slot.index} in room ${roomId}`);
    }

    // If host left, assign new host or delete room
    if (wasHost) {
      const newHost = room.slots.find(s => s.playerId !== null);
      if (newHost && newHost.playerId) {
        room.hostId = newHost.playerId;
        if (this.debug) {
          this.logger.debug(`New host: ${room.hostId}`);
        }
      } else {
        // No players left, delete room
        this.rooms.delete(roomId);
        if (this.debug) {
          this.logger.debug(`Room ${roomId} deleted (empty)`);
        }
        return null;
      }
    }

    return this.cloneRoom(room);
  }

  /**
   * Set slot ready state
   *
   * @param roomId - Room ID
   * @param slotIndex - Slot index
   * @param ready - Ready state
   * @returns Updated room
   */
  public setSlotReady(roomId: string, slotIndex: number, ready: boolean): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const slot = room.slots[slotIndex];
    if (!slot || slot.playerId === null) {
      throw new Error('Slot is empty');
    }

    slot.ready = ready;

    if (this.debug) {
      this.logger.debug(`Slot ${slotIndex} ready: ${ready}`);
    }

    return this.cloneRoom(room);
  }

  /**
   * Lock/unlock a slot (host only)
   *
   * @param roomId - Room ID
   * @param hostId - Host player ID
   * @param slotIndex - Slot index
   * @param locked - Lock state
   * @returns Updated room
   */
  public setSlotLocked(
    roomId: string,
    hostId: string,
    slotIndex: number,
    locked: boolean
  ): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new Error('Only host can lock/unlock slots');
    }

    const slot = room.slots[slotIndex];
    if (!slot) {
      throw new Error('Invalid slot index');
    }

    if (slot.playerId !== null && locked) {
      throw new Error('Cannot lock occupied slot');
    }

    slot.locked = locked;

    if (this.debug) {
      this.logger.debug(`Slot ${slotIndex} locked: ${locked}`);
    }

    return this.cloneRoom(room);
  }

  /**
   * Set slot team (host only)
   *
   * @param roomId - Room ID
   * @param hostId - Host player ID
   * @param slotIndex - Slot index
   * @param team - Team number
   * @returns Updated room
   */
  public setSlotTeam(
    roomId: string,
    hostId: string,
    slotIndex: number,
    team: number
  ): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.config.teamMode) {
      throw new Error('Room is not in team mode');
    }

    if (room.hostId !== hostId) {
      throw new Error('Only host can change teams');
    }

    const slot = room.slots[slotIndex];
    if (!slot) {
      throw new Error('Invalid slot index');
    }

    if (team < 0 || team >= (room.config.teamCount || 2)) {
      throw new Error('Invalid team number');
    }

    slot.team = team;

    if (this.debug) {
      this.logger.debug(`Slot ${slotIndex} assigned to team ${team}`);
    }

    return this.cloneRoom(room);
  }

  /**
   * Update room configuration (host only)
   *
   * @param roomId - Room ID
   * @param hostId - Host player ID
   * @param updates - Configuration updates
   * @returns Updated room
   */
  public updateRoomConfig(
    roomId: string,
    hostId: string,
    updates: Partial<RoomConfig>
  ): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new Error('Only host can update room configuration');
    }

    Object.assign(room.config, updates);

    if (this.debug) {
      this.logger.debug(`Room ${roomId} configuration updated`, updates);
    }

    return this.cloneRoom(room);
  }

  /**
   * Start a room (host only)
   *
   * @param roomId - Room ID
   * @param hostId - Host player ID
   * @returns Updated room
   */
  public startRoom(roomId: string, hostId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new Error('Only host can start the room');
    }

    if (room.state !== 'waiting') {
      throw new Error('Room is not in waiting state');
    }

    room.state = 'starting';

    if (this.debug) {
      this.logger.debug(`Room ${roomId} starting`);
    }

    return this.cloneRoom(room);
  }

  /**
   * Check if all occupied slots are ready
   *
   * @param roomId - Room ID
   * @returns True if all occupied slots are ready
   */
  public areAllPlayersReady(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    const occupiedSlots = room.slots.filter(s => s.playerId !== null);
    return occupiedSlots.length > 0 && occupiedSlots.every(s => s.ready);
  }

  /**
   * Get number of occupied slots
   *
   * @param roomId - Room ID
   * @returns Number of players
   */
  public getPlayerCount(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room) {
      return 0;
    }

    return room.slots.filter(s => s.playerId !== null).length;
  }

  /**
   * Get available slots
   *
   * @param roomId - Room ID
   * @returns Array of available slot indices
   */
  public getAvailableSlots(roomId: string): number[] {
    const room = this.rooms.get(roomId);
    if (!room) {
      return [];
    }

    return room.slots
      .filter(s => s.playerId === null && !s.locked)
      .map(s => s.index);
  }

  /**
   * Balance teams automatically (host only)
   *
   * @param roomId - Room ID
   * @param hostId - Host player ID
   * @returns Updated room
   */
  public balanceTeams(roomId: string, hostId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new Error('Only host can balance teams');
    }

    if (!room.config.teamMode) {
      throw new Error('Room is not in team mode');
    }

    const occupiedSlots = room.slots.filter(s => s.playerId !== null);
    const teamCount = room.config.teamCount || 2;

    // Assign players to teams in round-robin fashion
    occupiedSlots.forEach((slot, index) => {
      slot.team = index % teamCount;
    });

    if (this.debug) {
      this.logger.debug(`Teams balanced in room ${roomId}`);
    }

    return this.cloneRoom(room);
  }

  /**
   * Kick player from room (host only)
   *
   * @param roomId - Room ID
   * @param hostId - Host player ID
   * @param targetPlayerId - Player to kick
   * @returns Updated room
   */
  public kickPlayer(
    roomId: string,
    hostId: string,
    targetPlayerId: string
  ): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new Error('Only host can kick players');
    }

    if (hostId === targetPlayerId) {
      throw new Error('Host cannot kick themselves');
    }

    const slot = room.slots.find(s => s.playerId === targetPlayerId);
    if (!slot) {
      throw new Error('Player not in room');
    }

    slot.playerId = null;
    slot.playerName = null;
    slot.ready = false;

    if (this.debug) {
      this.logger.debug(`Player ${targetPlayerId} kicked from room ${roomId}`);
    }

    return this.cloneRoom(room);
  }

  /**
   * Clone room object
   */
  private cloneRoom(room: Room): Room {
    return {
      id: room.id,
      config: { ...room.config },
      slots: room.slots.map(s => ({ ...s })),
      hostId: room.hostId,
      state: room.state,
      createdAt: room.createdAt
    };
  }

  /**
   * Get room manager statistics
   */
  public getStats(): {
    totalRooms: number;
    publicRooms: number;
    privateRooms: number;
    totalPlayers: number;
  } {
    let publicRooms = 0;
    let privateRooms = 0;
    let totalPlayers = 0;

    for (const room of this.rooms.values()) {
      if (room.config.isPrivate) {
        privateRooms++;
      } else {
        publicRooms++;
      }
      totalPlayers += room.slots.filter(s => s.playerId !== null).length;
    }

    return {
      totalRooms: this.rooms.size,
      publicRooms,
      privateRooms,
      totalPlayers
    };
  }

  /**
   * Clear all rooms
   */
  public clear(): void {
    this.rooms.clear();
    this.roomIdCounter = 0;
    if (this.debug) {
      this.logger.debug('All rooms cleared');
    }
  }
}
