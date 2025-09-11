// src/store/jitsiStore.ts
import { create } from 'zustand';

export type RemoteParticipant = {
  participantId: string;
  // element ids for DOM nodes
  videoElId?: string;
  audioElId?: string;
};

type JitsiState = {
  roomName: string;
  joined: boolean;
  audioMuted: boolean;
  setAudioMuted: (audioMuted: boolean) => void;
  videoMuted: boolean;
  setVideoMuted: (videoMuted: boolean) => void;
  participants: Record<string, RemoteParticipant>;
  upsertParticipant: (p: RemoteParticipant) => void;
  setVideoEl: (pid: string, elId: string) => void;
  setAudioEl: (pid: string, elId: string) => void;
  removeParticipant: (pid: string) => void;
  reset: () => void;
  setRoomName: (roomName: string) => void;
  setJoined: (joined: boolean) => void;
};

export const useJitsiStore = create<JitsiState>((set) => ({
  roomName: 'room',
  joined: false,
  audioMuted: false,
  setAudioMuted: (audioMuted) => set({ audioMuted }),
  videoMuted: false,
  setVideoMuted: (videoMuted) => set({ videoMuted }),
  participants: {},
  upsertParticipant: (p) =>
    set((s) => ({
      participants: {
        ...s.participants,
        [p.participantId]: { ...s.participants[p.participantId], ...p }
      }
    })),
  setVideoEl: (pid, elId) =>
    set((s) => ({
      participants: { ...s.participants, [pid]: { ...s.participants[pid], videoElId: elId } }
    })),
  setAudioEl: (pid, elId) =>
    set((s) => ({
      participants: { ...s.participants, [pid]: { ...s.participants[pid], audioElId: elId } }
    })),
  removeParticipant: (pid) =>
    set((s) => {
      const { [pid]: _, ...rest } = s.participants;
      return { participants: rest };
    }),
  reset: () => set({ participants: {} }),
  setRoomName: (roomName) => set({ roomName }),
  setJoined: (joined) => set({ joined })
}));
