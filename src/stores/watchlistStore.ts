import { create } from "zustand";

interface WatchlistUiState {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

export const useWatchlistStore = create<WatchlistUiState>((set) => ({
  activeId: null,
  setActiveId: (id) => set({ activeId: id }),
}));
