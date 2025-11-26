import { Logger } from '../../core/Logger';

/**
 * Player in a lobby
 */
export interface LobbyPlayer {
  /** Player ID */
  playerId: string;
  /** Player display name */
  name: string;
  /** Is player ready */
  ready: boolean;
  /** Is player the lobby leader */
  isLeader: boolean;
  /** Player team (if applicable) */
  team?: number;
  /** Custom player data */
  custom?: Record<string, any>;
}

/**
 * Lobby configuration
 */
export interface LobbyConfig {
  /** Lobby name */
  name: string;
  /** Game mode */
  gameMode: string;
  /** Maximum players */
  maxPlayers: number;
  /** Is lobby private (requires invite/password) */
  isPrivate: boolean;
  /** Lobby password (if private) */
  password?: string;
  /** Auto-start when all players ready */
  autoStart?: boolean;
  /** Map/level selection */
  map?: string;
  /** Custom settings */
  custom?: Record<string, any>;
}

/**
 * Lobby state
 */
export interface Lobby {
  /** Unique lobby ID */
  id: string;
  /** Lobby configuration */
  config: LobbyConfig;
  /** Players in lobby */
  players: LobbyPlayer[];
  /** Lobby creation time */
  createdAt: number;
  /** Lobby state */
  state: 'waiting' | 'starting' | 'in_progress' | 'finished';
}

/**
 * Lobby manager for creating and joining game lobbies.
 * Handles player management, ready states, and lobby lifecycle.
 *
 * @example
 * ```typescript
 * const lobbyManager = new LobbyManager();
 *
 * // Create a lobby
 * const lobby = lobbyManager.createLobby({
 *   name: 'My Game',
 *   gameMode: 'deathmatch',
 *   maxPlayers: 8,
 *   isPrivate: false
 * }, 'player1', 'Player One');
 *
 * // Join a lobby
 * lobbyManager.joinLobby(lobby.id, 'player2', 'Player Two');
 *
 * // Set player ready
 * lobbyManager.setPlayerReady(lobby.id, 'player2', true);
 * ```
 */
export class LobbyManager {
  private readonly lobbies: Map<string, Lobby> = new Map();
  private readonly debug: boolean;
  private readonly logger: Logger;
  private lobbyIdCounter: number = 0;

  constructor(debug: boolean = false) {
    this.debug = debug;
    this.logger = new Logger('LobbyManager');
  }

  /**
   * Create a new lobby
   *
   * @param config - Lobby configuration
   * @param leaderId - ID of player creating the lobby
   * @param leaderName - Name of lobby leader
   * @returns Created lobby
   */
  public createLobby(
    config: LobbyConfig,
    leaderId: string,
    leaderName: string
  ): Lobby {
    const lobbyId = `lobby_${this.lobbyIdCounter++}`;

    const leader: LobbyPlayer = {
      playerId: leaderId,
      name: leaderName,
      ready: false,
      isLeader: true
    };

    const lobby: Lobby = {
      id: lobbyId,
      config: { ...config },
      players: [leader],
      createdAt: performance.now(),
      state: 'waiting'
    };

    this.lobbies.set(lobbyId, lobby);

    if (this.debug) {
      this.logger.debug(`Created lobby ${lobbyId}`, config);
    }

    return this.cloneLobby(lobby);
  }

  /**
   * Delete a lobby
   *
   * @param lobbyId - Lobby ID to delete
   * @returns True if lobby was deleted
   */
  public deleteLobby(lobbyId: string): boolean {
    const deleted = this.lobbies.delete(lobbyId);

    if (deleted && this.debug) {
      this.logger.debug(`Deleted lobby ${lobbyId}`);
    }

    return deleted;
  }

  /**
   * Get a lobby by ID
   *
   * @param lobbyId - Lobby ID
   * @returns Lobby or undefined if not found
   */
  public getLobby(lobbyId: string): Lobby | undefined {
    const lobby = this.lobbies.get(lobbyId);
    return lobby ? this.cloneLobby(lobby) : undefined;
  }

  /**
   * Get all public lobbies
   *
   * @returns Array of public lobbies
   */
  public getPublicLobbies(): Lobby[] {
    const lobbies: Lobby[] = [];
    for (const lobby of this.lobbies.values()) {
      if (!lobby.config.isPrivate && lobby.state === 'waiting') {
        lobbies.push(this.cloneLobby(lobby));
      }
    }
    return lobbies;
  }

  /**
   * Join a lobby
   *
   * @param lobbyId - Lobby ID to join
   * @param playerId - Player ID
   * @param playerName - Player name
   * @param password - Lobby password (if private)
   * @returns Updated lobby
   */
  public joinLobby(
    lobbyId: string,
    playerId: string,
    playerName: string,
    password?: string
  ): Lobby {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    if (lobby.state !== 'waiting') {
      throw new Error('Lobby is not accepting players');
    }

    if (lobby.players.length >= lobby.config.maxPlayers) {
      throw new Error('Lobby is full');
    }

    if (lobby.players.some(p => p.playerId === playerId)) {
      throw new Error('Player already in lobby');
    }

    if (lobby.config.isPrivate && lobby.config.password !== password) {
      throw new Error('Invalid password');
    }

    const player: LobbyPlayer = {
      playerId,
      name: playerName,
      ready: false,
      isLeader: false
    };

    lobby.players.push(player);

    if (this.debug) {
      this.logger.debug(`Player ${playerId} joined lobby ${lobbyId}`);
    }

    return this.cloneLobby(lobby);
  }

  /**
   * Leave a lobby
   *
   * @param lobbyId - Lobby ID
   * @param playerId - Player ID
   * @returns Updated lobby or null if lobby was deleted
   */
  public leaveLobby(lobbyId: string, playerId: string): Lobby | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    const playerIndex = lobby.players.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) {
      throw new Error('Player not in lobby');
    }

    const wasLeader = lobby.players[playerIndex].isLeader;
    lobby.players.splice(playerIndex, 1);

    if (this.debug) {
      this.logger.debug(`Player ${playerId} left lobby ${lobbyId}`);
    }

    // If leader left and players remain, assign new leader
    if (wasLeader && lobby.players.length > 0) {
      lobby.players[0].isLeader = true;
      if (this.debug) {
        this.logger.debug(`New leader: ${lobby.players[0].playerId}`);
      }
    }

    // Delete lobby if empty
    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
      if (this.debug) {
        this.logger.debug(`Lobby ${lobbyId} deleted (empty)`);
      }
      return null;
    }

    return this.cloneLobby(lobby);
  }

  /**
   * Set player ready state
   *
   * @param lobbyId - Lobby ID
   * @param playerId - Player ID
   * @param ready - Ready state
   * @returns Updated lobby
   */
  public setPlayerReady(lobbyId: string, playerId: string, ready: boolean): Lobby {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    const player = lobby.players.find(p => p.playerId === playerId);
    if (!player) {
      throw new Error('Player not in lobby');
    }

    player.ready = ready;

    if (this.debug) {
      this.logger.debug(`Player ${playerId} ready: ${ready}`);
    }

    // Check if all players are ready and auto-start
    if (lobby.config.autoStart && this.areAllPlayersReady(lobbyId)) {
      lobby.state = 'starting';
      if (this.debug) {
        this.logger.debug(`Lobby ${lobbyId} starting (all players ready)`);
      }
    }

    return this.cloneLobby(lobby);
  }

  /**
   * Set player team
   *
   * @param lobbyId - Lobby ID
   * @param playerId - Player ID
   * @param team - Team number
   * @returns Updated lobby
   */
  public setPlayerTeam(lobbyId: string, playerId: string, team: number): Lobby {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    const player = lobby.players.find(p => p.playerId === playerId);
    if (!player) {
      throw new Error('Player not in lobby');
    }

    player.team = team;

    if (this.debug) {
      this.logger.debug(`Player ${playerId} assigned to team ${team}`);
    }

    return this.cloneLobby(lobby);
  }

  /**
   * Update lobby configuration (leader only)
   *
   * @param lobbyId - Lobby ID
   * @param playerId - Player ID (must be leader)
   * @param updates - Configuration updates
   * @returns Updated lobby
   */
  public updateLobbyConfig(
    lobbyId: string,
    playerId: string,
    updates: Partial<LobbyConfig>
  ): Lobby {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    const player = lobby.players.find(p => p.playerId === playerId);
    if (!player || !player.isLeader) {
      throw new Error('Only lobby leader can update configuration');
    }

    Object.assign(lobby.config, updates);

    if (this.debug) {
      this.logger.debug(`Lobby ${lobbyId} configuration updated`, updates);
    }

    return this.cloneLobby(lobby);
  }

  /**
   * Start a lobby (leader only)
   *
   * @param lobbyId - Lobby ID
   * @param playerId - Player ID (must be leader)
   * @returns Updated lobby
   */
  public startLobby(lobbyId: string, playerId: string): Lobby {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    const player = lobby.players.find(p => p.playerId === playerId);
    if (!player || !player.isLeader) {
      throw new Error('Only lobby leader can start the lobby');
    }

    if (lobby.state !== 'waiting') {
      throw new Error('Lobby is not in waiting state');
    }

    lobby.state = 'starting';

    if (this.debug) {
      this.logger.debug(`Lobby ${lobbyId} starting`);
    }

    return this.cloneLobby(lobby);
  }

  /**
   * Check if all players are ready
   *
   * @param lobbyId - Lobby ID
   * @returns True if all players are ready
   */
  public areAllPlayersReady(lobbyId: string): boolean {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return false;
    }

    return lobby.players.length > 0 && lobby.players.every(p => p.ready);
  }

  /**
   * Get player count in lobby
   *
   * @param lobbyId - Lobby ID
   * @returns Number of players
   */
  public getPlayerCount(lobbyId: string): number {
    const lobby = this.lobbies.get(lobbyId);
    return lobby ? lobby.players.length : 0;
  }

  /**
   * Kick a player from lobby (leader only)
   *
   * @param lobbyId - Lobby ID
   * @param leaderId - Leader player ID
   * @param targetPlayerId - Player to kick
   * @returns Updated lobby
   */
  public kickPlayer(
    lobbyId: string,
    leaderId: string,
    targetPlayerId: string
  ): Lobby | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    const leader = lobby.players.find(p => p.playerId === leaderId);
    if (!leader || !leader.isLeader) {
      throw new Error('Only lobby leader can kick players');
    }

    if (leaderId === targetPlayerId) {
      throw new Error('Leader cannot kick themselves');
    }

    const playerIndex = lobby.players.findIndex(p => p.playerId === targetPlayerId);
    if (playerIndex === -1) {
      throw new Error('Player not in lobby');
    }

    lobby.players.splice(playerIndex, 1);

    if (this.debug) {
      this.logger.debug(`Player ${targetPlayerId} kicked from lobby ${lobbyId}`);
    }

    return this.cloneLobby(lobby);
  }

  /**
   * Clone lobby object
   */
  private cloneLobby(lobby: Lobby): Lobby {
    return {
      id: lobby.id,
      config: { ...lobby.config },
      players: lobby.players.map(p => ({ ...p })),
      createdAt: lobby.createdAt,
      state: lobby.state
    };
  }

  /**
   * Get lobby manager statistics
   */
  public getStats(): {
    totalLobbies: number;
    publicLobbies: number;
    privateLobbies: number;
    totalPlayers: number;
  } {
    let publicLobbies = 0;
    let privateLobbies = 0;
    let totalPlayers = 0;

    for (const lobby of this.lobbies.values()) {
      if (lobby.config.isPrivate) {
        privateLobbies++;
      } else {
        publicLobbies++;
      }
      totalPlayers += lobby.players.length;
    }

    return {
      totalLobbies: this.lobbies.size,
      publicLobbies,
      privateLobbies,
      totalPlayers
    };
  }

  /**
   * Clear all lobbies
   */
  public clear(): void {
    this.lobbies.clear();
    this.lobbyIdCounter = 0;
    if (this.debug) {
      this.logger.debug('All lobbies cleared');
    }
  }
}
