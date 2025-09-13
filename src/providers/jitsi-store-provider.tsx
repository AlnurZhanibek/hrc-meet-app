'use client';

import { type ReactNode, createContext, useRef, useContext } from 'react';
import { useStore } from 'zustand';

import { type JitsiStore, createJitsiStore } from '@/stores/jitsi-store';

export type JitsiStoreApi = ReturnType<typeof createJitsiStore>;

export const JitsiStoreContext = createContext<JitsiStoreApi | undefined>(undefined);

export interface JitsiStoreProviderProps {
  children: ReactNode;
}

export const JitsiStoreProvider = ({ children }: JitsiStoreProviderProps) => {
  const storeRef = useRef<JitsiStoreApi | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createJitsiStore();
  }

  return (
    <JitsiStoreContext.Provider value={storeRef.current}>{children}</JitsiStoreContext.Provider>
  );
};

export const useJitsiStore = <T,>(selector: (store: JitsiStore) => T): T => {
  const jitsiStoreContext = useContext(JitsiStoreContext);

  if (!jitsiStoreContext) {
    throw new Error(`useJitsiStore must be used within JitsiStoreProvider`);
  }

  return useStore(jitsiStoreContext, selector);
};
