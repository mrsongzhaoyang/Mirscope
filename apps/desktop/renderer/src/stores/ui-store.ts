import { create } from 'zustand';

interface UIState {
  searchFocusTick: number;
  requestSearchFocus: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  searchFocusTick: 0,
  requestSearchFocus: () => set({ searchFocusTick: Date.now() }),
}));
