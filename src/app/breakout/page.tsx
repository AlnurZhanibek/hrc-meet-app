// BreakoutPanel.tsx — Next.js 15 client component using Mantine UI + lib-jitsi-meet (no IFrame)
// Drop into app/breakout/BreakoutPanel.tsx and render from a page. See usage example at bottom.

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MantineProvider,
  AppShell,
  Container,
  Group,
  Text,
  Card,
  Button,
  TextInput,
  Select,
  Radio,
  Stack,
  Title,
  Badge,
  Divider,
  ScrollArea,
  Box,
  Tooltip,
  rem
} from '@mantine/core';
import {
  JitsiConference,
  JitsiConnection,
  JitsiLocalTrack,
  JitsiParticipant,
  JitsiTrack
} from 'types-lib-jitsi-meet';

const domain = 'meet.hrcs.space';
const serviceUrl = `wss://${domain}/xmpp-websocket`;
const mainRoom = 'room-a';
const jwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJocmNzX3NwYWNlIiwiaXNzIjoiaHJjc19zcGFjZV9qaXRzaSIsInN1YiI6Im1lZXQuaHJjcy5zcGFjZSIsInJvb20iOiIqIiwiY29udGV4dCI6eyJ1c2VyIjp7Im5hbWUiOiJOaWtvIiwiZW1haWwiOiJuaWtvQGV4YW1wbGUuY29tIiwibW9kZXJhdG9yIjp0cnVlfX0sImV4cCI6MTc1ODEyODQwMH0.MmNI4jA70ZttFxgZ-na6Fb172PpF6YCJ3KyA4QSOI2k';

export default function BreakoutPanel() {
  const connectionRef = useRef<JitsiConnection>(null);
  const mainConfRef = useRef<JitsiConference>(null);
  const currentConfRef = useRef<JitsiConference>(null);
  const localTracksRef = useRef<JitsiLocalTrack[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);

  // Remote media state
  const remoteTracksRef = useRef<Map<string, { audio?: JitsiTrack; video?: JitsiTrack }>>(
    new Map()
  );
  const videoElsRef = useRef<Map<string, HTMLVideoElement | null>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement | null>>(new Map());

  // UI state
  const [status, setStatus] = useState<string>('Loading lib-jitsi-meet ...');
  const [participants, setParticipants] = useState<{ id: string; displayName?: string }[]>([]);
  const [creatingName, setCreatingName] = useState<string>('Room-A');
  const [selectedBreakout, setSelectedBreakout] = useState<string>('');
  const [inBreakout, setInBreakout] = useState<boolean>(false);
  const [myId, setMyId] = useState<string>('');

  // Helpers to (re)attach existing tracks to elements when refs appear
  const tryAttach = (pid: string) => {
    setTimeout(() => {
      const media = remoteTracksRef.current.get(pid) || {};
      const vEl = videoElsRef.current.get(pid);
      if (media.video && vEl) {
        try {
          media.video.attach(vEl);
        } catch {}
      }
      const aEl = audioElsRef.current.get(pid);
      if (media.audio && aEl) {
        try {
          media.audio.attach(aEl);
        } catch {}
      }
    }, 0);
  };

  useEffect(() => {
    const JitsiMeetJS = window.JitsiMeetJS;

    if (!JitsiMeetJS) {
      setStatus('Failed to load lib-jitsi-meet');
      return;
    }

    JitsiMeetJS.init();

    const options = {
      hosts: { domain, muc: `muc.${domain}` },
      serviceUrl,
      clientNode: 'http://jitsi.org/jitsimeet'
    };

    const connection = new JitsiMeetJS.JitsiConnection(null, jwt, options);
    connectionRef.current = connection;

    connection.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
      onConnEstablished
    );
    connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, () =>
      setStatus('Connection failed')
    );
    connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED, () =>
      setStatus('Disconnected')
    );

    setStatus('Connecting ...');
    connection.connect();

    async function onConnEstablished() {
      setStatus('Connected. Creating local tracks ...');
      try {
        const tracks = await JitsiMeetJS.createLocalTracks({ devices: ['audio', 'video'] });
        localTracksRef.current = tracks;
        for (const t of tracks) {
          if (t.getType() === 'video' && localVideoRef.current) t.attach(localVideoRef.current);
          if (t.getType() === 'audio' && localAudioRef.current) t.attach(localAudioRef.current);
        }
      } catch (e) {
        console.warn('Local tracks failed, continuing as audio/video-less', e);
      }
      joinConference(mainRoom);
    }

    function addCommonListeners(conf: JitsiConference) {
      const E = JitsiMeetJS.events.conference;

      conf.on(E.CONFERENCE_JOINED, () => {
        setStatus(`Joined ${conf.getName()}`);
        setMyId(conf.myUserId() || '');
        setInBreakout(conf.getName() !== mainRoom);
        for (const t of localTracksRef.current) conf.addTrack(t);
        refreshParticipants(conf);
      });

      conf.on(E.USER_JOINED, () => refreshParticipants(conf));
      conf.on(E.USER_LEFT, (id: string) => {
        // Clean up tracks map when user leaves
        const media = remoteTracksRef.current.get(id);
        if (!!audioElsRef.current.get(id)) {
          media?.audio?.detach?.(audioElsRef.current.get(id) as HTMLElement);
        }
        if (!!videoElsRef.current.get(id)) {
          media?.video?.detach?.(videoElsRef.current.get(id) as HTMLElement);
        }
        remoteTracksRef.current.delete(id);
        refreshParticipants(conf);
      });

      conf.on(E.TRACK_ADDED, (track: JitsiTrack) => {
        if (track.isLocal()) return; // remote only
        const pid = track.getId();
        const kind = track.getType(); // 'audio' | 'video'
        const prev = remoteTracksRef.current.get(pid as string) || {};
        const next = { ...prev, [kind]: track } as { audio?: JitsiTrack; video?: JitsiTrack };
        remoteTracksRef.current.set(pid as string, next);
        // Attach immediately if element exists
        tryAttach(pid as string);
      });

      conf.on(E.TRACK_REMOVED, (track: JitsiTrack) => {
        if (track.isLocal()) return;
        //eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const pid = track.getParticipantId();
        const kind = track.getType();
        const prev =
          remoteTracksRef.current.get(pid) || ({} as { audio?: JitsiTrack; video?: JitsiTrack });
        if (kind === 'video' && prev.video) {
          try {
            prev.video.detach(videoElsRef.current.get(pid) as HTMLElement);
          } catch {}
          delete prev.video;
        }
        if (kind === 'audio' && prev.audio) {
          try {
            prev.audio.detach(audioElsRef.current.get(pid) as HTMLElement);
          } catch {}
          delete prev.audio;
        }
        remoteTracksRef.current.set(pid, prev);
      });

      conf.on(E.ENDPOINT_MESSAGE_RECEIVED, async (_, data: { type: string; room: string }) => {
        if (data?.type === 'move-to-breakout' && data?.room) {
          await switchConference(data.room);
        } else if (data?.type === 'return-to-main' && data?.room === mainRoom) {
          await switchConference(mainRoom);
        }
      });
    }

    function joinConference(roomName: string) {
      const conf = connection.initJitsiConference(roomName, {
        openBridgeChannel: true
      });
      addCommonListeners(conf);
      conf.join();
      currentConfRef.current = conf;
      if (!mainConfRef.current) mainConfRef.current = conf;
    }

    async function switchConference(targetRoom: string) {
      const E = window.JitsiMeetJS.events.conference;
      setStatus(`Switching to ${targetRoom} ...`);

      // Leave current
      if (currentConfRef.current && currentConfRef.current.isJoined()) {
        await currentConfRef.current.leave();
      }

      // Join target
      const next = connectionRef.current?.initJitsiConference(targetRoom, {
        //eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        openBridgeChannel: true
      }) as JitsiConference;
      addCommonListeners(next);
      next.join('');
      currentConfRef.current = next;
    }

    function refreshParticipants(conf: JitsiConference) {
      const list = conf
        .getParticipants()
        .map((p: JitsiParticipant) => ({ id: p.getId(), displayName: p.getDisplayName?.() }));
      setParticipants(list);
    }

    return () => {
      try {
        currentConfRef.current?.leave?.();
        for (const t of localTracksRef.current) t.dispose?.();
        connection.disconnect?.();
      } catch {}
    };
  }, []);

  // ==== One-click 1:1 breakout flow ====
  const createAndMoveToOneOnOne = async (targetParticipantId: string) => {
    if (!mainConfRef.current) return;
    const breakoutName = `${mainRoom}__1on1__${targetParticipantId}`;
    // Tell the target to move
    mainConfRef.current.sendMessage(
      {
        type: 'move-to-breakout',
        room: breakoutName
      },
      targetParticipantId
    );
    // Move ourselves
    await switchFromUI(breakoutName);
  };

  const leaveOneOnOne = async () => {
    // In a 1:1, notify the other peer in current room to return, then return self
    const conf = currentConfRef.current;
    if (!conf) return;
    const others = conf
      .getParticipants()
      .map((p: JitsiParticipant) => p.getId())
      .filter((id: string) => id !== myId);
    for (const pid of others) {
      conf.sendMessage({ type: 'return-to-main', room: mainRoom }, pid);
    }
    await switchFromUI(mainRoom);
  };

  const switchFromUI = async (room: string) => {
    // Reuse the internal switch function by emitting endpoint message style
    const JitsiMeetJS = window.JitsiMeetJS;
    setStatus(`Switching to ${room} ...`);
    if (currentConfRef.current?.isJoined()) await currentConfRef.current.leave();
    //eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    const next = connectionRef.current.initJitsiConference(room, { openBridgeChannel: true });
    const E = JitsiMeetJS.events.conference;
    next.on(E.CONFERENCE_JOINED, () => {
      setStatus(`Joined ${room}`);
      setInBreakout(room !== mainRoom);
      for (const t of localTracksRef.current) next.addTrack(t);
      const list = next
        .getParticipants()
        .map((p: JitsiParticipant) => ({ id: p.getId(), displayName: p.getDisplayName?.() }));
      setParticipants(list);
    });
    next.on(E.USER_JOINED, () => {
      const list = next
        .getParticipants()
        .map((p: JitsiParticipant) => ({ id: p.getId(), displayName: p.getDisplayName?.() }));
      setParticipants(list);
    });
    next.on(E.USER_LEFT, () => {
      const list = next
        .getParticipants()
        .map((p: JitsiParticipant) => ({ id: p.getId(), displayName: p.getDisplayName?.() }));
      setParticipants(list);
    });
    next.on(E.TRACK_ADDED, (track: JitsiTrack) => {
      if (track.isLocal()) return;
      //eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      const pid = track.getParticipantId();
      const kind = track.getType();
      const prev = remoteTracksRef.current.get(pid) || {};
      const nextMap = { ...prev, [kind]: track } as { audio?: JitsiTrack; video?: JitsiTrack };
      remoteTracksRef.current.set(pid, nextMap);
      tryAttach(pid);
    });
    next.on(E.TRACK_REMOVED, (track: JitsiTrack) => {
      if (track.isLocal()) return;
      //eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      const pid = track.getParticipantId();
      const kind = track.getType();
      const prev =
        remoteTracksRef.current.get(pid) || ({} as { audio?: JitsiTrack; video?: JitsiTrack });
      if (kind === 'video' && prev.video) {
        try {
          prev.video.detach(videoElsRef.current.get(pid) as HTMLElement);
        } catch {}
        delete prev.video;
      }
      if (kind === 'audio' && prev.audio) {
        try {
          prev.audio.detach(audioElsRef.current.get(pid) as HTMLElement);
        } catch {}
        delete prev.audio;
      }
      remoteTracksRef.current.set(pid, prev);
    });
    next.join('');
    currentConfRef.current = next;
  };

  // ==== UI ====
  const header = (
    <Group h="100%" px="md" justify="space-between">
      <Group>
        <Title order={3}>lib‑jitsi‑meet Breakout Panel</Title>
        <Badge variant="light" color="blue">
          Mantine
        </Badge>
        {inBreakout && <Badge color="grape">1:1 breakout</Badge>}
      </Group>
      <Text size="sm" c="dimmed">
        {status}
      </Text>
    </Group>
  );

  const grid = (
    <Card withBorder radius="lg">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={5}>Participants (click a tile to start a 1:1 breakout)</Title>
          <Badge variant="dot" color={participants.length ? 'green' : 'gray'}>
            {participants.length} online
          </Badge>
        </Group>
        <Divider />
        <ScrollArea h={420} type="auto">
          <Group gap="md">
            <Card key="local" withBorder radius="md" style={{ width: 280 }}>
              <Stack gap={6}>
                <Box
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16/9',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: rem(8)
                  }}
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
                <audio ref={localAudioRef} autoPlay muted />
                <Text fw={600} size="sm">
                  You
                </Text>
              </Stack>
            </Card>
            {participants.length === 0 && (
              <Text size="sm" c="dimmed">
                No remote participants yet.
              </Text>
            )}
            {participants.map((p) => (
              <Card
                key={p.id}
                withBorder
                radius="md"
                style={{ width: 280 }}
                onClick={() => !inBreakout && createAndMoveToOneOnOne(p.id)}
              >
                <Stack gap={6}>
                  <Box
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '16/9',
                      background: 'rgba(255,255,255,0.04)',
                      overflow: 'hidden',
                      borderRadius: rem(8)
                    }}
                  >
                    <video
                      ref={(el) => {
                        videoElsRef.current.set(p.id, el);
                        if (el) tryAttach(p.id);
                      }}
                      autoPlay
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </Box>
                  <audio
                    ref={(el) => {
                      audioElsRef.current.set(p.id, el);
                      if (el) tryAttach(p.id);
                    }}
                    autoPlay
                  />
                  <Group justify="space-between" align="center">
                    <Text fw={600} size="sm" lineClamp={1}>
                      {p.displayName || p.id}
                    </Text>
                    {!inBreakout && <Badge variant="light">Click to 1:1</Badge>}
                  </Group>
                </Stack>
              </Card>
            ))}
          </Group>
        </ScrollArea>
      </Stack>
    </Card>
  );

  const controls = (
    <Card withBorder radius="lg">
      <Stack gap="sm">
        <Title order={5}>Controls</Title>
        <Divider />
        <Group>
          <TextInput
            placeholder="(Optional) Name a test breakout"
            value={creatingName}
            onChange={(e) => setCreatingName(e.currentTarget.value)}
          />
          <Button onClick={() => setSelectedBreakout(`${mainRoom}__br__${creatingName}`)}>
            Prepare name
          </Button>
          <Button disabled={!inBreakout} color="red" onClick={leaveOneOnOne}>
            Leave 1:1 & return both
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Tiles render each participant&apos;s remote video & audio. Clicking a tile in the main
          room creates a unique breakout for that participant, messages them to move, and moves you
          too. &quot;Leave&quot; tells them to return and you rejoin the main room.
        </Text>
      </Stack>
    </Card>
  );

  return (
    <MantineProvider defaultColorScheme="dark">
      <AppShell header={{ height: 64 }} padding="md">
        <AppShell.Header>{header}</AppShell.Header>
        <AppShell.Main>
          <Container size="lg">
            <Stack>
              {controls}
              {grid}
            </Stack>
          </Container>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
