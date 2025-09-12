import { create } from 'zustand';

export type Role = 'instructor' | 'student';

export type RemoteParticipant = {
  participantId: string;
  displayName?: string;
  videoElId?: string;
  audioElId?: string; // used only where we actually play audio
};

type State = {
  // session
  role: Role;
  roomName: string;
  myParticipantId?: string;
  instructorId?: string;

  // joined / tracks
  joined: boolean;

  // roster
  participants: Record<string, RemoteParticipant>;

  // instructor control
  currentAudioStudent?: string; // who has the mic now (participantId)

  // setters
  setRole: (r: Role) => void;
  setRoomName: (n: string) => void;
  setJoined: (v: boolean) => void;
  setMyParticipantId: (id: string) => void;
  setInstructorId: (id: string | undefined) => void;

  upsertParticipant: (p: RemoteParticipant) => void;
  removeParticipant: (pid: string) => void;
  setVideoEl: (pid: string, elId: string) => void;
  setAudioEl: (pid: string, elId: string) => void;

  setCurrentAudioStudent: (pid?: string) => void;
  reset: () => void;
};

export const useJitsiStore = create<State>((set) => ({
  role: 'student',
  roomName: 'classroom-001',
  joined: false,
  participants: {},

  setRole: (role) => set({ role }),
  setRoomName: (roomName) => set({ roomName }),
  setJoined: (joined) => set({ joined }),
  setMyParticipantId: (myParticipantId) => set({ myParticipantId }),
  setInstructorId: (instructorId) => set({ instructorId }),

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

  setCurrentAudioStudent: (pid) => set({ currentAudioStudent: pid }),
  reset: () =>
    set({
      joined: false,
      participants: {},
      instructorId: undefined,
      myParticipantId: undefined,
      currentAudioStudent: undefined
    })
}));
