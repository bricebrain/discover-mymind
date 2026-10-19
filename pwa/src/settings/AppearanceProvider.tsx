import type { PaletteMode } from '@mui/material';
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { applyThemePreference, readThemePreference, saveThemePreference } from './themePreference';

interface AppearanceContextValue {
  mode: PaletteMode;
  setMode: (mode: PaletteMode) => void;
  saveError: boolean;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState(readThemePreference);
  const [saveError, setSaveError] = useState(false);

  useLayoutEffect(() => { applyThemePreference(mode); }, [mode]);

  const setMode = (nextMode: PaletteMode) => {
    setSaveError(!saveThemePreference(nextMode));
    updateMode(nextMode);
  };

  return <AppearanceContext.Provider value={{ mode, setMode, saveError }}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const appearance = useContext(AppearanceContext);
  if (!appearance) throw new Error('useAppearance nécessite AppearanceProvider');
  return appearance;
}
