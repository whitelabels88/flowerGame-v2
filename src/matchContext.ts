import { createContext } from 'react';

export interface MatchCtx {
  matchID: string;
  playerID: string;
  playerName: string;
  credentials: string;
  server: string;
  onLeave: () => void;
}

export const MatchContext = createContext<MatchCtx | null>(null);
