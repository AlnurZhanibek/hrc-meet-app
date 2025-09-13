import { createStore } from 'zustand/vanilla';

export type RemoteParticipant = {
  participantId: string;
  displayName?: string;
  videoElId?: string;
  audioElId?: string; // used only where we actually play audio
};

export type JitsiState = {
  roomName: string;
  myParticipantId?: string;
  joined: boolean;
  participants: Record<string, RemoteParticipant>;
};

export type JitsiActions = {
  setRoomName: (roomName: string) => void;
  setMyParticipantId: (myParticipantId: string) => void;
  setJoined: (joined: boolean) => void;
  upsertParticipant: (p: RemoteParticipant) => void;
  removeParticipant: (pid: string) => void;
  setVideoEl: (pid: string, elId: string) => void;
  setAudioEl: (pid: string, elId: string) => void;
  reset: () => void;
};

export type JitsiStore = JitsiState & JitsiActions;

export const defaultInitState: JitsiState = {
  roomName: 'classroom-001',
  joined: false,
  participants: {}
};

export const createJitsiStore = (initState: JitsiState = defaultInitState) =>
  createStore<JitsiStore>((set) => ({
    ...initState,

    setRoomName: (roomName) => set({ roomName }),
    setJoined: (joined) => set({ joined }),
    setMyParticipantId: (myParticipantId) => set({ myParticipantId }),

    upsertParticipant: (p) =>
      set((s) => ({
        participants: {
          ...s.participants,
          [p.participantId]: { ...s.participants[p.participantId], ...p }
        }
      })),
    removeParticipant: (pid) =>
      set((s) => {
        const { [pid]: _, ...rest } = s.participants;
        return { participants: rest };
      }),
    setVideoEl: (pid, elId) =>
      set((s) => ({
        participants: {
          ...s.participants,
          [pid]: { ...s.participants[pid], videoElId: elId }
        }
      })),
    setAudioEl: (pid, elId) =>
      set((s) => ({
        participants: {
          ...s.participants,
          [pid]: { ...s.participants[pid], audioElId: elId }
        }
      })),

    reset: () =>
      set({
        joined: false,
        participants: {},
        myParticipantId: undefined
      })
  }));
