import { create } from 'zustand';

type TrackKind = 'audio' | 'video' | 'desktop';

export type RemoteVideo = {
  id: string;
  participantId: string;
  kind: TrackKind;
};

type JitsiState = {
  roomName: string;
  joined: boolean;
  audioMuted: boolean;
  videoMuted: boolean;
  screensharing: boolean;
  remoteVideos: RemoteVideo[];

  setRoomName: (n: string) => void;
  setJoined: (v: boolean) => void;
  setAudioMuted: (v: boolean) => void;
  setVideoMuted: (v: boolean) => void;
  setScreensharing: (v: boolean) => void;
  addRemoteVideo: (v: RemoteVideo) => void;
  removeRemoteById: (id: string) => void;
  removeAllForParticipant: (participantId: string) => void;
  reset: () => void;
};

export const useJitsiStore = create<JitsiState>((set) => ({
  roomName: 'nextjs-libjitsi-demo',
  joined: false,
  audioMuted: false,
  videoMuted: false,
  screensharing: false,
  remoteVideos: [],

  setRoomName: (roomName) => set({ roomName }),
  setJoined: (joined) => set({ joined }),
  setAudioMuted: (audioMuted) => set({ audioMuted }),
  setVideoMuted: (videoMuted) => set({ videoMuted }),
  setScreensharing: (screensharing) => set({ screensharing }),

  addRemoteVideo: (v) =>
    set((s) =>
      s.remoteVideos.some((x) => x.id === v.id) ? s : { remoteVideos: [...s.remoteVideos, v] }
    ),
  removeRemoteById: (id) =>
    set((s) => ({ remoteVideos: s.remoteVideos.filter((x) => x.id !== id) })),
  removeAllForParticipant: (participantId) =>
    set((s) => ({ remoteVideos: s.remoteVideos.filter((x) => x.participantId !== participantId) })),
  reset: () =>
    set({
      joined: false,
      audioMuted: false,
      videoMuted: false,
      screensharing: false,
      remoteVideos: []
    })
}));
