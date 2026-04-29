// ============================================================
// FLOWER GAME — APP ROOT
// Handles: Lobby → Game screen routing
// ============================================================

import { useEffect, useState } from 'react';
import { Client }   from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { FlowerBoard } from './board/FlowerBoard';
import { Lobby } from './lobby/Lobby';
import { MatchContext, type MatchSeatPresence } from './matchContext';

const DEFAULT_SERVER = 'https://flower.a133.mov';
const SERVER = import.meta.env.VITE_GAME_SERVER_URL || DEFAULT_SERVER;

// Client-side game definition.
// All real logic runs server-side; these are stubs.
const noop = () => {};
const FlowerGameClient = {
  name: 'flower-game',
  moves: {
    blessingFlip:         noop,
    blessingChoose:       noop,
    pass:                 noop,
    plantOwn:             noop,
    plantOpponent:        noop,
    playWindSingle:       noop,
    playWindDouble:       noop,
    playBug:              noop,
    playBee:              noop,
    doubleHappinessTake:  noop,
    doubleHappinessGive:  noop,
    tradePresent:         noop,
    tradeFate:            noop,
    letGo:                noop,
    playSeason:           noop,
    naturalDisaster:      noop,
    playEclipse:          noop,
    playGreatReset:       noop,
    discardFlower:        noop,
  },
  turn: {
    stages: {
      counterStage: {
        moves: {
          counterWind:         noop,
          counterDivine:       noop,
          allowAction:         noop,
          selectResponseCards: noop,
        },
      },
    },
  },
};

const BgioClient = Client({
  game:         FlowerGameClient as Parameters<typeof Client>[0]['game'],
  board:        FlowerBoard,
  multiplayer:  SocketIO({ server: SERVER }),
  debug:        false,
});

interface MatchInfo {
  matchID:     string;
  playerID:    string;
  playerName:  string;
  credentials: string;
}

interface MatchMetadataResponse {
  players?: Array<{ id: string | number; name?: string }>;
}

const STORAGE_KEY = 'flower-game:match';

function loadStoredMatch(): MatchInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MatchInfo;
  } catch { /* ignore */ }
  return null;
}

export function App() {
  const [match, setMatch] = useState<MatchInfo | null>(loadStoredMatch);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [seatPresence, setSeatPresence] = useState<Record<string, MatchSeatPresence>>({});
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!match) {
      setPlayerNames({});
      setSeatPresence({});
      return;
    }

    let cancelled = false;
    const fetchNames = async () => {
      try {
        const res = await fetch(`${SERVER}/games/flower-game/${match.matchID}`);
        if (!res.ok) return;
        const data = await res.json() as MatchMetadataResponse;
        if (cancelled || !data.players) return;
        const next: Record<string, string> = {};
        const nextPresence: Record<string, MatchSeatPresence> = {};
        for (const p of data.players) {
          const id = String(p.id);
          const fallbackName = `Player ${Number(id) + 1}`;
          const trimmedName = p.name?.trim() || '';
          const name = trimmedName || fallbackName;
          next[id] = name;
          nextPresence[id] = {
            name,
            occupied: Boolean(trimmedName),
          };
        }
        setPlayerNames(next);
        setSeatPresence(nextPresence);
      } catch { /* best-effort */ }
    };

    void fetchNames();
    const interval = window.setInterval(fetchNames, 3000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [match]);

  async function leaveMatch() {
    if (!match || leaving) return;
    setLeaving(true);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    try {
      await fetch(`${SERVER}/games/flower-game/${match.matchID}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerID: match.playerID, credentials: match.credentials }),
      });
    } catch { /* best-effort */ }
    setMatch(null);
    setLeaving(false);
  }

  function handleJoin(matchID: string, playerID: string, playerName: string, credentials: string) {
    const info: MatchInfo = { matchID, playerID, playerName, credentials };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(info)); } catch { /* ignore */ }
    setMatch(info);
  }

  const bugButton = (
    <a
      href="https://flowerbug.a133.mov"
      target="_blank"
      rel="noreferrer"
      style={{
        position: 'fixed', bottom: 14, right: 14, zIndex: 9999,
        background: 'rgba(20,20,40,0.82)', backdropFilter: 'blur(6px)',
        color: '#ccc', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 20, padding: '5px 12px', fontSize: 11,
        textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      🐛 Report Bug
    </a>
  );

  if (!match) {
    return (
      <>
        <Lobby onJoin={handleJoin} />
        {bugButton}
      </>
    );
  }

  return (
    <>
      <MatchContext.Provider value={{
        matchID:     match.matchID,
        playerID:    match.playerID,
        playerName:  match.playerName,
        credentials: match.credentials,
        server:      SERVER,
        seatPresence,
        onLeave:     () => void leaveMatch(),
      }}>
        <BgioClient
          key={`${match.matchID}:${match.playerID}`}
          matchID={match.matchID}
          playerID={match.playerID}
          credentials={match.credentials}
          playerNames={playerNames}
        />
      </MatchContext.Provider>
    </>
  );
}
