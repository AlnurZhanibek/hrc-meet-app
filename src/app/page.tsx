'use client';

import { useEffect, useRef } from 'react';
import { Button, Card, Group, Stack, TextInput, Title, SimpleGrid, Badge } from '@mantine/core';
import { useJitsiStore } from '@/stores/jitsi-store';
import type { JitsiConnection, JitsiConference, JitsiTrack } from 'types-lib-jitsi-meet';

const JITSI_DOMAIN = 'meet.hrcs.space';
const SERVICE_URL = 'wss://meet.hrcs.space/xmpp-websocket';

export default function JitsiPage() {
  const {
    joined,
    setJoined,
    audioMuted,
    setAudioMuted,
    videoMuted,
    setVideoMuted,
    reset,
    participants,
    upsertParticipant,
    setVideoEl,
    setAudioEl,
    removeParticipant,
    roomName,
    setRoomName
  } = useJitsiStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);

  const connectionRef = useRef<JitsiConnection | null>(null);
  const conferenceRef = useRef<JitsiConference | null>(null);
  const localTracksRef = useRef<JitsiTrack[]>([]);

  // Helper: attach a lib-jitsi-meet track to a <video> (by id)
  const attachTrackToVideo = (track: JitsiTrack, elId: string) => {
    const el = document.getElementById(elId) as HTMLVideoElement | null;
    if (el) track.attach(el);
  };

  const attachToEl = (track: JitsiTrack, elId?: string) => {
    if (!elId) return;
    const el = document.getElementById(elId) as HTMLMediaElement | null;
    if (el) track.attach(el);
  };

  const initAndConnect = async () => {
    const JitsiMeetJS = window.JitsiMeetJS;
    if (!JitsiMeetJS) {
      alert('Jitsi script not loaded yet.');
      return;
    }

    // Init before anything else
    JitsiMeetJS.init({ disableAudioLevels: true });
    JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);

    const options = {
      hosts: { domain: JITSI_DOMAIN, muc: `muc.${JITSI_DOMAIN}`, focus: `focus.${JITSI_DOMAIN}` },
      serviceUrl: SERVICE_URL
    };

    const jwt = localStorage.getItem('token');

    console.log(jwt);

    const connection = new JitsiMeetJS.JitsiConnection(null, jwt, options);
    connectionRef.current = connection;

    console.log(connection);

    const onConnectionSuccess = async () => {
      const conf = connection.initJitsiConference(roomName, {
        openBridgeChannel: 'websocket',
        p2p: { enabled: true }
      });
      conferenceRef.current = conf;

      // remote track added
      conf.on(JitsiMeetJS.events.conference.TRACK_ADDED, (track: JitsiTrack) => {
        if (track.isLocal && track.isLocal()) return;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const pid = track.getParticipantId?.() || track.ownerEndpointId || 'unknown';
        const kind = track.getType(); // 'audio' | 'video' | 'desktop'

        // ensure participant card exists
        upsertParticipant({ participantId: pid });

        // give each participant stable element ids
        const videoId = `${pid}-video`;
        const audioId = `${pid}-audio`;
        setVideoEl(pid, videoId);
        setAudioEl(pid, audioId);

        // attach to the right element (audio -> <audio>, video/desktop -> <video>)
        setTimeout(() => {
          if (kind === 'audio') attachToEl(track, audioId);
          else attachToEl(track, videoId);
        }, 0);
      });

      // remote track removed
      conf.on(JitsiMeetJS.events.conference.TRACK_REMOVED, (track: JitsiTrack) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const pid = track.getParticipantId?.();
        if (!pid) return;
        // Optionally detach here if you want:
        // track.detach(document.getElementById(...))
        // lib-jitsi-meet disposes on participant leave too.
      });

      conf.on(JitsiMeetJS.events.conference.USER_LEFT, (pid: string) => {
        removeParticipant(pid);
      });

      conf.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, async () => {
        setJoined(true);

        // local audio + video
        try {
          const tracks: JitsiTrack[] = await JitsiMeetJS.createLocalTracks({
            devices: ['audio', 'video']
          });
          localTracksRef.current = tracks;

          for (const t of tracks) {
            if (t.getType() === 'video' && localVideoRef.current) {
              t.attach(localVideoRef.current);
            }
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            await conferenceRef.current?.addTrack(t);
          }
        } catch (e) {
          // User blocked mic/cam: you can choose to still join with no media
          // console.warn('createLocalTracks error', e);
        }
      });

      conf.join();
    };

    const onConnectionFailed = () => {
      alert('Jitsi connection failed.');
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

  const cleanup = () => {
    // dispose local tracks
    for (const t of localTracksRef.current) {
      try {
        if (t.detach && localVideoRef.current) t.detach(localVideoRef.current);
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
    setAudioMuted(false);
    setVideoMuted(false);
  };

  // Make sure we cleanup when leaving the page
  useEffect(() => {
    return () => {
      cleanup();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = async () => {
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      alert('Camera/mic need HTTPS (or localhost) to work.');
      return;
    }
    await initAndConnect();
  };

  const handleLeave = () => cleanup();

  const toggleAudio = async () => {
    const track = localTracksRef.current.find((t) => t.getType() === 'audio');
    if (!track) return;
    if (audioMuted) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await track.unmute?.();
      setAudioMuted(false);
    } else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await track.mute?.();
      setAudioMuted(true);
    }
  };

  const toggleVideo = async () => {
    const track = localTracksRef.current.find((t) => t.getType() === 'video');
    if (!track) return;
    if (videoMuted) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await track.unmute?.();
      setVideoMuted(false);
    } else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await track.mute?.();
      setVideoMuted(true);
    }
  };

  return (
    <Stack gap="lg" p="lg">
      <Group justify="space-between">
        <Title order={2}>lib-jitsi-meet + Next.js + Mantine + Zustand</Title>
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
          <Button onClick={handleJoin}>Join</Button>
        ) : (
          <Button color="red" onClick={handleLeave}>
            Leave
          </Button>
        )}
        <Button variant="light" onClick={toggleAudio} disabled={!joined}>
          {audioMuted ? 'Unmute audio' : 'Mute audio'}
        </Button>
        <Button variant="light" onClick={toggleVideo} disabled={!joined}>
          {videoMuted ? 'Unmute video' : 'Mute video'}
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        <Card withBorder radius="lg" padding="md">
          <Card.Section inheritPadding py="sm">
            <strong>Local</strong>
          </Card.Section>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: 240, background: 'black', borderRadius: 12 }}
          />
        </Card>

        {Object.values(participants).map((p) => (
          <Card key={p.participantId} withBorder radius="lg" padding="md">
            <Card.Section inheritPadding py="sm">
              <strong>Remote: {p.participantId.slice(0, 6)}…</strong>
            </Card.Section>

            {/* Video element (visible) */}
            <video
              id={`${p.participantId}-video`}
              autoPlay
              playsInline
              style={{ width: '100%', height: 240, background: 'black', borderRadius: 12 }}
            />

            {/* Audio element (hidden UI, but plays sound) */}
            <audio id={`${p.participantId}-audio`} autoPlay style={{ display: 'none' }} />
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
