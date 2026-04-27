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
  setupData?: { names?: string[] };
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
  const [matchID, setMatchID] = useState('');
  const [numPlayers, setNumPlayers] = useState(2);
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
      const openRooms = (data.matches ?? [])
        .filter(match => (match.players?.some(player => !player.name) ?? false))
        .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
      setRooms(openRooms);
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

  async function createMatch() {
    if (!name.trim()) { setError('Enter your name first'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${SERVER}/games/${GAME}/create`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ numPlayers, setupData: { names: [name.trim()] } }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const { matchID: mid } = await res.json() as { matchID: string };

      const joinRes = await fetch(`${SERVER}/games/${GAME}/${mid}/join`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ playerID: '0', playerName: name.trim() }),
      });
      if (!joinRes.ok) throw new Error('Could not join as player 0');
      const { playerCredentials } = await joinRes.json() as { playerCredentials: string };

      onJoin(mid, '0', name.trim(), playerCredentials);
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

  return (
    <div className="lobby-shell">
      <div className="lobby-card">
        {storedMatch && (
          <div style={{
            marginBottom: 16, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(78,204,163,0.15)', border: '1px solid rgba(78,204,163,0.4)',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#4ecca3' }}>↩ Resume last game</div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <h1 className="app-title" style={{ fontSize: 32, marginBottom: 4 }}>🌸 Flower Game</h1>
            <p style={{ color: '#888', marginBottom: 20 }}>Multiplayer Card Game</p>
          </div>
          <button
            className="icon-btn"
            onClick={() => setDesignerOpen(true)}
            title="Upload custom card designs"
            style={{ whiteSpace: 'nowrap' }}
          >
            🎨 Designs
          </button>
        </div>

        <div className="lobby-grid">
          <div style={{ display: 'grid', gridTemplateRows: 'auto auto', gap: 10, minHeight: 0 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: '#aaa', fontSize: 13 }}>Your Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Alice"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: '1px solid #0f3460', background: '#0f3460',
                  color: '#fff', fontSize: 15, marginBottom: 0,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, minHeight: 0 }}>
              <div className="lobby-panel" style={{ background: '#0f3460', borderRadius: 12, padding: 14, marginBottom: 0, minWidth: 0 }}>
                <h3 style={{ marginBottom: 8, color: '#e94560' }}>Create</h3>
                <label style={{ display: 'block', marginBottom: 6, color: '#aaa', fontSize: 12 }}>
                  Players
                </label>
                <select
                  value={numPlayers}
                  onChange={e => setNumPlayers(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 8,
                    border: '1px solid #1a1a2e', background: '#1a1a2e',
                    color: '#fff', fontSize: 13, marginBottom: 10,
                  }}
                >
                  {[2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n} Players</option>
                  ))}
                </select>
                <button
                  onClick={createMatch}
                  disabled={loading}
                  style={{ ...btn, background: '#e94560', color: '#fff', width: '100%', padding: '8px 14px', fontSize: 14 }}
                >
                  {loading ? 'Creating…' : '🌱 Create'}
                </button>
              </div>

              <div className="lobby-panel" style={{ background: '#0f3460', borderRadius: 12, padding: 14, marginBottom: 0, minWidth: 0 }}>
                <h3 style={{ marginBottom: 8, color: '#4ecca3' }}>Join</h3>
                <label style={{ display: 'block', marginBottom: 6, color: '#aaa', fontSize: 12 }}>Match ID</label>
                <input
                  value={matchID}
                  onChange={e => setMatchID(e.target.value)}
                  placeholder="Paste ID"
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 8,
                    border: '1px solid #1a1a2e', background: '#1a1a2e',
                    color: '#fff', fontSize: 13, marginBottom: 10,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => void joinMatch()}
                  disabled={loading}
                  style={{ ...btn, background: '#4ecca3', color: '#1a1a2e', width: '100%', padding: '8px 14px', fontSize: 14 }}
                >
                  {loading ? 'Joining…' : '🚪 Join'}
                </button>
              </div>
            </div>
          </div>

          <div className="lobby-panel" style={{ background: '#0f3460', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              <h3 style={{ margin: 0, color: '#ffd166' }}>Open Rooms</h3>
              <span style={{ color: '#888', fontSize: 13 }}>
                {loadingRooms ? 'Refreshing…' : `${rooms.length} open room${rooms.length === 1 ? '' : 's'}`}
              </span>
              <button
                onClick={() => void loadRooms()}
                disabled={loadingRooms}
                style={{ ...btn, marginLeft: 'auto', background: '#1a1a2e', color: '#fff', padding: '8px 14px', fontSize: 13 }}
              >
                ↻ Refresh
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
              {rooms.length === 0 && !loadingRooms && (
                <div style={{ color: '#888', fontSize: 13, padding: '8px 2px' }}>
                  No open rooms right now. Create one and it’ll appear here.
                </div>
              )}

              {rooms.slice(0, 2).map(room => {
                const players = room.players ?? [];
                const totalSeats = players.length;
                const joinedSeats = players.filter(player => !!player.name).length;
                const openSeats = totalSeats - joinedSeats;
                const creator = players[0]?.name?.trim() || room.setupData?.names?.[0]?.trim() || 'Unknown';

                return (
                  <div
                    key={room.matchID}
                    className="lobby-room-card"
                    style={{
                      border: '1px solid #1a1a2e',
                      background: '#16213e',
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, color: '#fff' }}>{creator}'s room</div>
                      <div style={{ color: '#888', fontSize: 12, marginLeft: 'auto' }}>{formatTime(room.createdAt)}</div>
                    </div>

                    <div style={{ color: '#aaa', fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                      <div>Match ID: <span style={{ color: '#4ecca3', fontFamily: 'monospace' }}>{room.matchID}</span></div>
                      <div>Players: {joinedSeats}/{totalSeats} joined · {openSeats} seat{openSeats === 1 ? '' : 's'} open</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
                      {players.map((player, index) => {
                        const occupied = !!player.name?.trim();
                        return (
                          <div
                            key={player.id}
                            style={{
                              background: occupied ? '#0f3460' : '#1a1a2e',
                              border: `1px solid ${occupied ? '#244a75' : '#333'}`,
                              borderRadius: 10,
                              padding: '8px 10px',
                              fontSize: 12,
                              color: occupied ? '#d7e3ff' : '#888',
                            }}
                          >
                            <div style={{ marginBottom: 4, color: '#aaa' }}>Seat {index + 1}</div>
                            <div style={{ fontWeight: 700, color: occupied ? '#fff' : '#888' }}>
                              {occupied ? player.name : 'Empty'}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
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
                        onClick={() => setMatchID(room.matchID)}
                        style={{ ...btn, background: '#1a1a2e', color: '#fff', padding: '10px 16px' }}
                      >
                        Use ID
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: 12, background: '#4a1530', borderRadius: 8, color: '#ff6b8a', fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {designerOpen && <CardArtManager onClose={() => setDesignerOpen(false)} />}
    </div>
  );
}
