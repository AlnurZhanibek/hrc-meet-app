'use client';

import { useEffect, useRef } from 'react';
import { Button, Card, Group, Stack, TextInput, Title, SimpleGrid, Badge } from '@mantine/core';
import { useJitsiStore } from '@/stores/jitsi-store';
import type { JitsiConnection, JitsiConference, JitsiTrack } from 'types-lib-jitsi-meet';

const JITSI_DOMAIN = 'meet.hrcs.space';
const SERVICE_URL = 'wss://meet.hrcs.space/xmpp-websocket';

export default function JitsiPage() {
  const {
    roomName,
    setRoomName,
    joined,
    setJoined,
    audioMuted,
    setAudioMuted,
    videoMuted,
    setVideoMuted,
    screensharing,
    setScreensharing,
    remoteVideos,
    addRemoteVideo,
    removeRemoteById,
    removeAllForParticipant,
    reset
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
      hosts: { domain: JITSI_DOMAIN, muc: `conference.${JITSI_DOMAIN}` },
      serviceUrl: SERVICE_URL,
      clientNode: 'http://jitsi.org/jitsimeet'
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
        const participantId = track.getParticipantId?.() || track.ownerEndpointId || 'unknown';
        const kind = track.getType() as 'audio' | 'video' | 'desktop';
        const id = `${participantId}-${kind}`;

        addRemoteVideo({ id, participantId, kind });

        // Attach once the element is in the DOM
        setTimeout(() => attachTrackToVideo(track, id), 0);
      });

      // remote track removed
      conf.on(JitsiMeetJS.events.conference.TRACK_REMOVED, (track: JitsiTrack) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const participantId = track.getParticipantId?.();
        const kind = track.getType?.();
        if (!participantId || !kind) return;
        const id = `${participantId}-${kind}`;
        removeRemoteById(id);
      });

      conf.on(JitsiMeetJS.events.conference.USER_LEFT, (pid: string) => {
        removeAllForParticipant(pid);
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
    setScreensharing(false);
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

  const toggleScreenshare = async () => {
    const JitsiMeetJS = window.JitsiMeetJS;
    if (!conferenceRef.current || !JitsiMeetJS) return;

    if (!screensharing) {
      try {
        const [desktopTrack]: JitsiTrack[] = await JitsiMeetJS.createLocalTracks({
          devices: ['desktop']
        });
        localTracksRef.current.push(desktopTrack);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await conferenceRef.current.addTrack(desktopTrack);
        setScreensharing(true);
      } catch (e) {
        // console.warn('screenshare failed', e);
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const desktop = localTracksRef.current.find((t) => t.getType() === 'desktop');
      if (!desktop) return;
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await conferenceRef.current.removeTrack(desktop);
      } catch {}
      try {
        desktop.dispose?.();
      } catch {}
      localTracksRef.current = localTracksRef.current.filter((t) => t !== desktop);
      setScreensharing(false);
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
        <Button variant="outline" onClick={toggleScreenshare} disabled={!joined}>
          {screensharing ? 'Stop screenshare' : 'Start screenshare'}
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

        {remoteVideos.map((v) => (
          <Card key={v.id} withBorder radius="lg" padding="md">
            <Card.Section inheritPadding py="sm">
              <strong>
                Remote: {v.participantId.slice(0, 6)}… ({v.kind})
              </strong>
            </Card.Section>
            <video
              id={v.id}
              autoPlay
              playsInline
              style={{ width: '100%', height: 240, background: 'black', borderRadius: 12 }}
            />
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
