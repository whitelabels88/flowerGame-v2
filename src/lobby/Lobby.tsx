// ============================================================
// FLOWER GAME — LOBBY
// Create or join a match via boardgame.io Lobby API.
// ============================================================

import { useEffect, useState } from 'react';
import { CardArtManager } from '../cards/CardArtManager';

const DEFAULT_SERVER = 'https://flower.a133.mov';
const SERVER = import.meta.env.VITE_GAME_SERVER_URL || DEFAULT_SERVER;
const GAME   = 'flower-game';

interface Props {
  onJoin: (matchID: string, playerID: string, playerName: string, credentials: string) => void;
}

interface LobbyPlayer {
  id: string | number;
  name?: string;
  isConnected?: boolean;
}

interface LobbyMatch {
  matchID: string;
  players?: LobbyPlayer[];
  setupData?: { names?: string[]; roomName?: string };
  gameover?: { winner?: string | number } | null;
  createdAt?: number;
  updatedAt?: number;
}

interface LobbyListResponse {
  matches?: LobbyMatch[];
}

const btn: React.CSSProperties = {
  padding: '10px 24px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 15,
};

function formatTime(ts?: number): string {
  if (!ts) return 'just now';
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

const STORAGE_KEY = 'flower-game:match';
const PLAYER_LIMITS = [2, 3, 4, 5, 6];

interface StoredMatch {
  matchID: string;
  playerID: string;
  playerName: string;
  credentials: string;
}

function loadStoredMatch(): StoredMatch | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredMatch;
  } catch { /* ignore */ }
  return null;
}

export function Lobby({ onJoin }: Props) {
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [matchID, setMatchID] = useState('');
  const [numPlayers, setNumPlayers] = useState(2);
  const [joinByIdOpen, setJoinByIdOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [rooms, setRooms] = useState<LobbyMatch[]>([]);
  const [error, setError] = useState('');
  const [designerOpen, setDesignerOpen] = useState(false);
  const [storedMatch] = useState<StoredMatch | null>(loadStoredMatch);

  async function loadRooms() {
    setLoadingRooms(true);
    try {
      const res = await fetch(`${SERVER}/games/${GAME}`);
      if (!res.ok) throw new Error(`Could not load rooms (${res.status})`);
      const data = await res.json() as LobbyListResponse;
      const sortedRooms = (data.matches ?? [])
        .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
      setRooms(sortedRooms);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRooms(false);
    }
  }

  useEffect(() => {
    void loadRooms();
    const interval = window.setInterval(() => {
      void loadRooms();
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    const previousViewport = viewport?.getAttribute('content') ?? '';

    viewport?.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    );

    const preventGesture = (event: Event) => event.preventDefault();
    document.addEventListener('gesturestart', preventGesture, { passive: false });

    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      if (viewport) viewport.setAttribute('content', previousViewport);
    };
  }, []);

  async function createMatch() {
    if (!name.trim()) { setError('Enter your name first'); return; }
    setLoading(true); setError('');
    try {
      const trimmedName = name.trim();
      const trimmedRoomName = roomName.trim();
      const res = await fetch(`${SERVER}/games/${GAME}/create`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          numPlayers,
          setupData: {
            names: [trimmedName],
            roomName: trimmedRoomName || `${trimmedName}'s room`,
          },
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const { matchID: mid } = await res.json() as { matchID: string };

      const joinRes = await fetch(`${SERVER}/games/${GAME}/${mid}/join`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ playerID: '0', playerName: trimmedName }),
      });
      if (!joinRes.ok) throw new Error('Could not join as player 0');
      const { playerCredentials } = await joinRes.json() as { playerCredentials: string };

      onJoin(mid, '0', trimmedName, playerCredentials);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function joinMatch(requestedMatchID?: string) {
    const targetMatchID = requestedMatchID ?? matchID.trim();
    if (!name.trim()) { setError('Enter your name first'); return; }
    if (!targetMatchID) { setError('Enter a Match ID'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${SERVER}/games/${GAME}/${targetMatchID}`);
      if (!res.ok) throw new Error('Match not found');
      const match = await res.json() as LobbyMatch;
      const players = match.players ?? [];
      const openSeat = players.find(player => !player.name);
      if (!openSeat) {
        const myExistingSeat = players.find(p => p.name?.trim() === name.trim());
        if (myExistingSeat) throw new Error(`You're already seated in this match. Refresh the page to reconnect — your session is saved.`);
        throw new Error('No open seats in that match');
      }

      const joinRes = await fetch(`${SERVER}/games/${GAME}/${targetMatchID}/join`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ playerID: String(openSeat.id), playerName: name.trim() }),
      });
      if (!joinRes.ok) throw new Error('Could not join that room');

      const { playerCredentials } = await joinRes.json() as { playerCredentials: string };
      onJoin(targetMatchID, String(openSeat.id), name.trim(), playerCredentials);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      void loadRooms();
    } finally {
      setLoading(false);
    }
  }

  const openRooms = rooms.filter(match => !match.gameover && (match.players?.some(player => !player.name) ?? false));
  const finishedRooms = rooms.filter(match => !!match.gameover);

  return (
    <div className="lobby-shell">
      <div className="lobby-card">
        {storedMatch && (
          <div className="lobby-resume-banner">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#4ecca3' }}>↩ Resume last game</div>
              <div style={{ fontSize: 12, color: '#7d5470', marginTop: 2 }}>
                Match <span style={{ color: '#eee', fontFamily: 'monospace' }}>{storedMatch.matchID}</span> as <b style={{ color: '#eee' }}>{storedMatch.playerName}</b>
              </div>
            </div>
            <button
              onClick={() => onJoin(storedMatch.matchID, storedMatch.playerID, storedMatch.playerName, storedMatch.credentials)}
              style={{ ...btn, background: '#4ecca3', color: '#1a1a2e', padding: '8px 18px', fontSize: 13 }}
            >
              Reconnect
            </button>
          </div>
        )}
        <section className="lobby-hero">
          <div className="lobby-hero-copy">
            <div className="lobby-kicker">Bloom a room. Invite a table.</div>
            <h1 className="app-title" style={{ fontSize: 32, marginBottom: 4 }}>🌸 Flower Game</h1>
          </div>
        </section>

        <div className="lobby-grid">
          <div className="lobby-actions-column">
            <div className="lobby-identity-card">
              <label className="lobby-field-label">Your Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Alice"
                className="lobby-input"
              />
            </div>

            <div className="lobby-join-toggle">
              <button
                type="button"
                className="lobby-toggle-button"
                onClick={() => setJoinByIdOpen(open => !open)}
                aria-expanded={joinByIdOpen}
              >
                <span>Join by ID</span>
                <span className="lobby-toggle-arrow">{joinByIdOpen ? '−' : '+'}</span>
              </button>

              {joinByIdOpen && (
                <div className="lobby-join-panel">
                  <label className="lobby-field-label">Match ID</label>
                  <input
                    value={matchID}
                    onChange={e => setMatchID(e.target.value)}
                    placeholder="Paste ID"
                    className="lobby-input"
                  />
                  <button
                    onClick={() => void joinMatch()}
                    disabled={loading}
                    style={{ ...btn, background: '#4ecca3', color: '#1a1a2e', width: '100%', padding: '10px 14px', fontSize: 14 }}
                  >
                    {loading ? 'Joining…' : '🚪 Join'}
                  </button>
                </div>
              )}
            </div>

            <div className="lobby-actions-grid">
              <section className="lobby-panel lobby-action-card">
                <div className="lobby-section-tag">Create</div>
                <h3 style={{ marginBottom: 8, color: '#e94560' }}>Start a fresh garden</h3>
                <label className="lobby-field-label">Room Name</label>
                <input
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  placeholder="e.g. Petal Party"
                  className="lobby-input"
                />
                <label className="lobby-field-label">Players</label>
                <select
                  value={numPlayers}
                  onChange={e => setNumPlayers(Number(e.target.value))}
                  className="lobby-input"
                >
                  {PLAYER_LIMITS.map(n => (
                    <option key={n} value={n}>{n} Players</option>
                  ))}
                </select>
                <button
                  onClick={createMatch}
                  disabled={loading}
                  style={{ ...btn, background: '#e94560', color: '#fff', width: '100%', padding: '10px 14px', fontSize: 14 }}
                >
                  {loading ? 'Creating…' : '🌱 Create'}
                </button>
              </section>
            </div>
          </div>

          <div className="lobby-right-column">
            <section className="lobby-panel lobby-rooms-panel">
              <div className="lobby-rooms-header">
                <h3 style={{ margin: 0, color: '#ffd166' }}>Open Rooms</h3>
                <span style={{ color: '#7d5470', fontSize: 13 }}>
                  {loadingRooms ? 'Refreshing…' : `${openRooms.length} open room${openRooms.length === 1 ? '' : 's'}`}
                </span>
                <button
                  onClick={() => void loadRooms()}
                  disabled={loadingRooms}
                  style={{ ...btn, marginLeft: 'auto', background: '#1a1a2e', color: '#fff', padding: '8px 14px', fontSize: 13 }}
                >
                  ↻ Refresh
                </button>
              </div>

              <div className="lobby-room-list">
                {openRooms.length === 0 && !loadingRooms && (
                  <div style={{ color: '#7d5470', fontSize: 13, padding: '8px 2px' }}>
                    No open rooms right now. Create one and it’ll appear here.
                  </div>
                )}

                {openRooms.map(room => {
                  const players = room.players ?? [];
                  const totalSeats = players.length;
                  const joinedSeats = players.filter(player => !!player.name).length;
                  const openSeats = totalSeats - joinedSeats;
                  const creator = players[0]?.name?.trim() || room.setupData?.names?.[0]?.trim() || 'Unknown';
                  const displayRoomName = room.setupData?.roomName?.trim() || `${creator}'s room`;

                  return (
                    <div
                      key={room.matchID}
                      className="lobby-room-card"
                    >
                      <div className="lobby-room-title-row">
                        <div>
                          <div className="lobby-room-name">{displayRoomName}</div>
                          <div className="lobby-room-host">Hosted by {creator}</div>
                        </div>
                        <div style={{ color: '#7d5470', fontSize: 12, marginLeft: 'auto' }}>{formatTime(room.createdAt)}</div>
                      </div>

                      <div style={{ color: '#7d5470', fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                        <div>Match ID: <span style={{ color: '#6b2e55', fontFamily: 'monospace', fontWeight: 700 }}>{room.matchID}</span></div>
                        <div>Players: {joinedSeats}/{totalSeats} joined · {openSeats} seat{openSeats === 1 ? '' : 's'} open</div>
                      </div>

                      <div className="lobby-room-seats">
                        {players.map((player, index) => {
                          const occupied = !!player.name?.trim();
                          return (
                            <div
                              key={player.id}
                              className={`lobby-seat-chip${occupied ? ' is-occupied' : ''}`}
                            >
                              <div style={{ marginBottom: 4, color: occupied ? '#7d5470' : '#ad8ba0' }}>Seat {index + 1}</div>
                              <div style={{ fontWeight: 700, color: occupied ? '#6b2e55' : '#ad8ba0' }}>
                                {occupied ? player.name : 'Empty'}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="lobby-room-actions">
                        <button
                          onClick={() => {
                            setMatchID(room.matchID);
                            void joinMatch(room.matchID);
                          }}
                          disabled={loading || openSeats <= 0}
                          style={{ ...btn, background: '#4ecca3', color: '#1a1a2e', flex: 1 }}
                        >
                          {loading ? 'Joining…' : 'Join Room'}
                        </button>
                        <button
                          onClick={() => {
                            setMatchID(room.matchID);
                            setJoinByIdOpen(true);
                          }}
                          style={{ ...btn, background: '#1a1a2e', color: '#fff', padding: '10px 16px' }}
                        >
                          Use ID
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="lobby-panel lobby-rooms-panel lobby-rooms-panel--finished">
              <div className="lobby-rooms-header">
                <h3 style={{ margin: 0, color: '#ffd166' }}>Finished Rooms</h3>
                <span style={{ color: '#7d5470', fontSize: 13 }}>
                  {loadingRooms ? 'Refreshing…' : `${finishedRooms.length} finished room${finishedRooms.length === 1 ? '' : 's'}`}
                </span>
              </div>

              <div className="lobby-room-list">
                {finishedRooms.length === 0 && !loadingRooms && (
                  <div style={{ color: '#7d5470', fontSize: 13, padding: '8px 2px' }}>
                    No finished rooms yet.
                  </div>
                )}

                {finishedRooms.map(room => {
                  const players = room.players ?? [];
                  const creator = players[0]?.name?.trim() || room.setupData?.names?.[0]?.trim() || 'Unknown';
                  const displayRoomName = room.setupData?.roomName?.trim() || `${creator}'s room`;
                  const winnerIdRaw = room.gameover?.winner;
                  const winnerIndex = typeof winnerIdRaw === 'number'
                    ? winnerIdRaw
                    : typeof winnerIdRaw === 'string' && winnerIdRaw !== ''
                      ? Number(winnerIdRaw)
                      : NaN;
                  const winnerPlayer = Number.isFinite(winnerIndex) ? players[winnerIndex] : undefined;
                  const winnerLabel = winnerPlayer?.name?.trim() || (Number.isFinite(winnerIndex) ? `Player ${winnerIndex + 1}` : 'Unknown');

                  return (
                    <div key={room.matchID} className="lobby-room-card lobby-room-card--finished">
                      <div className="lobby-room-title-row">
                        <div>
                          <div className="lobby-room-name">{displayRoomName}</div>
                          <div className="lobby-room-host">Winner: {winnerLabel}</div>
                        </div>
                        <div style={{ color: '#7d5470', fontSize: 12, marginLeft: 'auto' }}>{formatTime(room.updatedAt ?? room.createdAt)}</div>
                      </div>

                      <div style={{ color: '#7d5470', fontSize: 13, lineHeight: 1.5 }}>
                        <div>Match ID: <span style={{ color: '#6b2e55', fontFamily: 'monospace', fontWeight: 700 }}>{room.matchID}</span></div>
                        <div>{players.length} player{players.length === 1 ? '' : 's'} seated</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {error && (
          <div className="lobby-error-banner">
            ⚠️ {error}
          </div>
        )}
      </div>

      {designerOpen && <CardArtManager onClose={() => setDesignerOpen(false)} />}
    </div>
  );
}
