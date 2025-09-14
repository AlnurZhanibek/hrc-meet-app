'use client';

import { useEffect, useRef } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import {
  JitsiTrack,
  JitsiParticipant,
  JitsiLocalTrack,
  JitsiConnection,
  JitsiConference
} from 'types-lib-jitsi-meet';
import { useJitsiStore } from '@/providers/jitsi-store-provider';

const JITSI_DOMAIN = 'meet.hrcs.space'; // your self-hosted domain
const SERVICE_URL = `wss://${JITSI_DOMAIN}/xmpp-websocket`; // your XMPP WS

export default function ClassroomPage() {
  const {
    roomName,
    setRoomName,
    joined,
    setJoined,
    participants,
    upsertParticipant,
    removeParticipant,
    setVideoEl,
    setAudioEl,
    myParticipantId,
    setMyParticipantId,
    reset
  } = useJitsiStore((state) => state);

  const localTracksRef = useRef<JitsiLocalTrack[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const connectionRef = useRef<JitsiConnection | null>(null);
  const conferenceRef = useRef<JitsiConference | null>(null);

  // -------- helpers
  const attachTrackTo = (track: JitsiTrack, elId?: string | null) => {
    if (!elId) return;
    const el = document.getElementById(elId) as HTMLMediaElement | null;
    if (el) track.attach(el);
  };

  const detachTrackFrom = (track: JitsiTrack, elId?: string | null) => {
    if (!elId) return;
    const el = document.getElementById(elId) as HTMLMediaElement | null;
    if (el) track.detach?.(el);
  };

  const cleanup = () => {
    for (const t of localTracksRef.current) {
      try {
        if (t.getType && t.getType() === 'video' && localVideoRef.current)
          t.detach(localVideoRef.current);
      } catch {}
      try {
        t.dispose?.();
      } catch {}
    }
    localTracksRef.current = [];

    try {
      conferenceRef.current?.leave?.();
    } catch {}
    try {
      connectionRef.current?.disconnect?.();
    } catch {}

    setJoined(false);
  };

  useEffect(
    () => () => {
      cleanup();
      reset();
    },
    []
  ); // unmount

  // --------- Join flow
  const join = async () => {
    if (typeof window === 'undefined') return;
    const JitsiMeetJS = window.JitsiMeetJS;
    if (!JitsiMeetJS) {
      alert('Jitsi script not loaded yet.');
      return;
    }

    const jwt = localStorage.getItem('token');

    JitsiMeetJS.init();
    JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);

    const options = {
      hosts: { domain: JITSI_DOMAIN, muc: `muc.${JITSI_DOMAIN}`, focus: `focus.${JITSI_DOMAIN}` },
      serviceUrl: SERVICE_URL
    };

    const connection = new JitsiMeetJS.JitsiConnection(null, jwt, options);
    connectionRef.current = connection;

    const onConnectionSuccess = async () => {
      const conf = connection.initJitsiConference(roomName, {
        openBridgeChannel: 'websocket',
        p2p: { enabled: true } // keep SFU behavior consistent
      });
      conferenceRef.current = conf;

      // --- events
      conf.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, async () => {
        const me = conf.getMyUserId?.();
        setMyParticipantId(me);

        try {
          const tracks: JitsiLocalTrack[] = await JitsiMeetJS.createLocalTracks({
            devices: ['audio', 'video']
          });
          localTracksRef.current = [...localTracksRef.current, ...tracks];

          for (const t of tracks) {
            if (t.getType() === 'video' && localVideoRef.current) {
              t.attach(localVideoRef.current);
            }
            await conf.addTrack(t);
          }
        } catch {}

        setJoined(true);
      });

      // keep roster + attach tracks
      conf.on(JitsiMeetJS.events.conference.USER_JOINED, (pid: string, user?: JitsiParticipant) => {
        upsertParticipant({
          participantId: pid,
          displayName: user?.getDisplayName?.()
        });
      });
      conf.on(JitsiMeetJS.events.conference.USER_LEFT, (pid: string) => {
        removeParticipant(pid);
      });

      conf.on(JitsiMeetJS.events.conference.TRACK_ADDED, (track: JitsiTrack) => {
        if (track.isLocal && track.isLocal()) return;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const pid = track.getParticipantId?.() || track.ownerEndpointId || 'unknown';
        const kind = track.getType(); // 'audio' | 'video'
        upsertParticipant({ participantId: pid });

        const videoId = `${pid}-video`;
        const audioId = `${pid}-audio`;
        setVideoEl(pid, videoId);
        setAudioEl(pid, audioId);

        setTimeout(() => {
          attachTrackTo(track, kind === 'audio' ? audioId : videoId);
        }, 0);
      });

      conf.on(JitsiMeetJS.events.conference.TRACK_REMOVED, (track: JitsiTrack) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const pid = track.getParticipantId?.();
        const kind = track.getType?.();
        if (!pid || !kind) return;

        // best-effort detach
        detachTrackFrom(track, kind === 'audio' ? `${pid}-audio` : `${pid}-video`);
      });

      conf.join();
    };

    const onConnectionFailed = () => {
      alert('Jitsi connection failed');
      cleanup();
    };
    const onDisconnected = () => {
      cleanup();
    };

    connection.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
      onConnectionSuccess
    );
    connection.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_FAILED,
      onConnectionFailed
    );
    connection.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
      onDisconnected
    );

    connection.connect();
  };

  return (
    <Stack gap="lg" p="lg">
      <Group justify="space-between">
        <Title order={2}>Classroom</Title>
        <Badge color={joined ? 'green' : 'gray'}>{joined ? 'Joined' : 'Idle'}</Badge>
      </Group>

      <Group wrap="wrap" align="flex-end">
        <TextInput
          label="Room"
          value={roomName}
          onChange={(e) => setRoomName(e.currentTarget.value)}
          disabled={joined}
          style={{ minWidth: 260 }}
        />
        {!joined ? (
          <Button onClick={join}>Join</Button>
        ) : (
          <Button color="red" onClick={cleanup}>
            Leave
          </Button>
        )}
      </Group>

      {/* Local preview */}
      <Card withBorder radius="lg" w={300}>
        <Card.Section inheritPadding py="sm">
          <strong>Me</strong>
        </Card.Section>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: 260, background: 'black', borderRadius: 12 }}
        />
      </Card>

      {/* Grid */}
      <Group>
        <Text fw={600}>Participants</Text>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {Object.values(participants).map((p) => (
          <Card key={p.participantId} withBorder radius="lg" padding="md" w={300}>
            <Card.Section inheritPadding py="sm">
              <Group justify="space-between">
                <strong>{p.displayName || p.participantId.slice(0, 6)}…</strong>
              </Group>
            </Card.Section>
            <video
              id={`${p.participantId}-video`}
              autoPlay
              playsInline
              style={{ width: '100%', height: 220, background: 'black', borderRadius: 12 }}
            />
            <audio id={`${p.participantId}-audio`} autoPlay playsInline />
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
