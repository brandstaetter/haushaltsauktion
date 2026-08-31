import { createContext, useContext, type ReactNode } from 'react';
import { de, type Strings } from '../strings/de';

const StringsContext = createContext<{ de: Strings }>({ de });

export function StringsProvider({ children }: { children: ReactNode }) {
  return <StringsContext.Provider value={{ de }}>{children}</StringsContext.Provider>;
}

export function useStrings() {
  return useContext(StringsContext);
}
