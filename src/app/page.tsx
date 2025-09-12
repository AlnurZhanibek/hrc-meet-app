'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import { Role, useJitsiStore } from '@/stores/jitsi-store';
import {
  JitsiConnection,
  JitsiConference,
  JitsiTrack,
  JitsiParticipant,
  JitsiLocalTrack
} from 'types-lib-jitsi-meet';

const JITSI_DOMAIN = 'meet.hrcs.space'; // your self-hosted domain
const SERVICE_URL = 'wss://meet.hrcs.space/xmpp-websocket'; // your XMPP WS
const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL!;
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_HTTP!;

export default function ClassroomPage() {
  const {
    role,
    setRole,
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
    instructorId,
    setInstructorId,
    currentAudioStudent,
    setCurrentAudioStudent,
    reset
  } = useJitsiStore();

  const [ws, setWs] = useState<WebSocket | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const instructorAudioRef = useRef<HTMLAudioElement>(null); // for students to hear instructor

  const connectionRef = useRef<JitsiConnection | null>(null);
  const conferenceRef = useRef<JitsiConference | null>(null);
  const localTracksRef = useRef<JitsiLocalTrack[]>([]);

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

  const applyReceiverConstraints = (
    conf: JitsiConference,
    isInstructor: boolean,
    instrId?: string
  ) => {
    if (!conf) return;
    if (!isInstructor) {
      const selected = instrId ? [instrId] : [];
      conf.setReceiverConstraints({
        lastN: 1,
        selectedEndpoints: selected,
        onStageEndpoints: selected,
        defaultConstraints: { maxFrameHeight: 180 },
        constraints: instrId ? { [instrId]: { maxFrameHeight: 720 } } : {}
      });
    } else {
      conf.setReceiverConstraints({
        lastN: -1, // unlimited
        selectedEndpoints: [],
        onStageEndpoints: [],
        defaultConstraints: { maxFrameHeight: 240 }
      });
    }
  };

  const cleanup = () => {
    for (const t of localTracksRef.current) {
      try {
        if (t.getType && t.getType() === 'video' && localVideoRef.current)
          t.detach(localVideoRef.current);
        if (t.getType && t.getType() === 'audio' && instructorAudioRef.current)
          t.detach(instructorAudioRef.current);
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

    try {
      ws?.close();
    } catch {}

    setJoined(false);
    setCurrentAudioStudent(undefined);
    setInstructorId(undefined);
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

    JitsiMeetJS.init({ disableAudioLevels: true });
    JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);

    const options = {
      hosts: { domain: JITSI_DOMAIN, muc: `muc.${JITSI_DOMAIN}` },
      serviceUrl: SERVICE_URL,
      clientNode: 'http://jitsi.org/jitsimeet'
    };

    const connection = new JitsiMeetJS.JitsiConnection(null, jwt, options);
    connectionRef.current = connection;

    const onConnectionSuccess = async () => {
      const conf = connection.initJitsiConference(roomName, {
        openBridgeChannel: 'websocket',
        p2p: { enabled: false } // keep SFU behavior consistent
      });
      conferenceRef.current = conf;

      // --- events
      conf.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, async () => {
        const me = conf.getMyUserId?.();
        setMyParticipantId(me);

        if (role === 'instructor') {
          setInstructorId(me);
          // instructor publishes audio + video
          try {
            const tracks: JitsiLocalTrack[] = await JitsiMeetJS.createLocalTracks({
              devices: ['audio', 'video']
            });
            localTracksRef.current = [...localTracksRef.current, ...tracks];

            for (const t of tracks) {
              if (t.getType() === 'video' && localVideoRef.current) t.attach(localVideoRef.current);
              await conf.addTrack(t);
            }
          } catch {}
        } else {
          // student publishes only video (optional); no audio
          try {
            const tracks: JitsiLocalTrack[] = await JitsiMeetJS.createLocalTracks({
              devices: ['video']
            });
            localTracksRef.current = [...localTracksRef.current, ...tracks];

            for (const t of tracks) {
              if (t.getType() === 'video' && localVideoRef.current) t.attach(localVideoRef.current);
              await conf.addTrack(t);
            }
          } catch {}
        }

        applyReceiverConstraints(
          conf,
          role === 'instructor',
          role === 'instructor' ? me : instructorId
        );
        setJoined(true);
      });

      // keep roster + attach tracks
      conf.on(JitsiMeetJS.events.conference.USER_JOINED, (pid: string, user?: JitsiParticipant) => {
        upsertParticipant({ participantId: pid, displayName: user?.getDisplayName?.() });
      });
      conf.on(JitsiMeetJS.events.conference.USER_LEFT, (pid: string) => {
        removeParticipant(pid);
        if (currentAudioStudent === pid) setCurrentAudioStudent(undefined);
      });

      conf.on(JitsiMeetJS.events.conference.TRACK_ADDED, (track: JitsiTrack) => {
        if (track.isLocal && track.isLocal()) return;

        console.log('track added', track);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const pid = track.getParticipantId?.() || track.ownerEndpointId || 'unknown';
        const kind = track.getType(); // 'audio' | 'video' | 'desktop'
        upsertParticipant({ participantId: pid });

        const videoId = `${pid}-video`;
        const audioId = `${pid}-audio`;
        setVideoEl(pid, videoId);
        setAudioEl(pid, audioId);

        // students: play ONLY instructor's audio
        // instructor: don't play any student's audio here; only the selected student's
        setTimeout(() => {
          if (role === 'student') {
            // if this is instructor's audio, attach to hidden audio element
            if (pid === instructorId && kind === 'audio') {
              const el = document.getElementById(audioId) as HTMLAudioElement | null;
              if (el) track.attach(el);
            }
            if (kind === 'video' && pid === instructorId) attachTrackTo(track, videoId);
          } else {
            // instructor sees all videos
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (kind === 'video' || kind === 'desktop') attachTrackTo(track, videoId);

            // audio is handled by selection logic (see WS handler)
          }
        }, 0);
      });

      conf.on(JitsiMeetJS.events.conference.TRACK_REMOVED, (track: JitsiTrack) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const pid = track.getParticipantId?.();
        const kind = track.getType?.();
        if (!pid || !kind) return;

        // best-effort detach
        if (kind === 'audio') detachTrackFrom(track, `${pid}-audio`);
        else detachTrackFrom(track, `${pid}-video`);
      });

      // role changes: (e.g., if instructor joins later)
      conf.on(JitsiMeetJS.events.conference.USER_ROLE_CHANGED, (id: string, newRole: string) => {
        // Jitsi "moderator" role implies instructor in this app
        if (role !== 'instructor' && newRole === 'moderator') {
          setInstructorId(id);
          applyReceiverConstraints(conf, false, id);
        }
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

    // open WS control channel
    const wsUrl = `${WS_BASE}/ws/rooms/${encodeURIComponent(roomName)}?pid=${encodeURIComponent('pending')}`;
    // we don't know myParticipantId until joined; reconnect later with true pid
    const provisional = new WebSocket(wsUrl);
    setWs(provisional);
  };

  // after we know myParticipantId, reconnect WS with the real pid (small optimization)
  useEffect(() => {
    if (!myParticipantId || !roomName) return;
    try {
      ws?.close();
    } catch {}
    const next = new WebSocket(`${WS_BASE}/ws/rooms/${roomName}?pid=${myParticipantId}`);
    setWs(next);

    // control handler: students react to instructor commands
    next.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data) as {
        type: string;
        target: string;
        kind?: 'audio' | 'video' | 'desktop';
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        data?: unknown;
      };
      if (msg.target !== myParticipantId) return;

      const JitsiMeetJS = window.JitsiMeetJS;
      const conf = conferenceRef.current;
      if (!conf) return;

      switch (msg.type) {
        case 'requestTrack': {
          if (msg.kind === 'audio') {
            // only create if not present
            if (!localTracksRef.current.find((t) => t.getType() === 'audio')) {
              try {
                const [a] = await JitsiMeetJS.createLocalTracks({ devices: ['audio'] });
                localTracksRef.current.push(a);
                await conf.addTrack(a);
              } catch {}
            }
          }
          break;
        }
        case 'stopTrack': {
          if (msg.kind === 'audio') {
            const t = localTracksRef.current.find((t) => t.getType() === 'audio');
            if (t) {
              try {
                await conf.removeTrack(t);
              } catch {}
              try {
                t.dispose?.();
              } catch {}
              localTracksRef.current = localTracksRef.current.filter((x) => x !== t);
            }
          }
          break;
        }
      }
    };

    return () => {
      try {
        next.close();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myParticipantId, roomName]);

  // -------- instructor UI: give mic / silence all
  const giveMic = async (pid: string) => {
    if (!API_BASE) return;
    // stop previous
    if (currentAudioStudent && currentAudioStudent !== pid) {
      await fetch(`${API_BASE}/api/rooms/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'stopTrack',
          target: currentAudioStudent,
          kind: 'audio',
          data: { room: roomName }
        })
      });
    }
    // request new
    await fetch(`${API_BASE}/api/rooms/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'requestTrack',
        target: pid,
        kind: 'audio',
        data: { room: roomName }
      })
    });
    setCurrentAudioStudent(pid);
  };

  const silenceAll = async () => {
    if (currentAudioStudent) {
      await fetch(`${API_BASE}/api/rooms/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'stopTrack',
          target: currentAudioStudent,
          kind: 'audio',
          data: { room: roomName }
        })
      });
      setCurrentAudioStudent(undefined);
    }
  };

  // -------- render
  const isInstructor = role === 'instructor';
  const studentList = useMemo(
    () => Object.values(participants).filter((p) => p.participantId !== instructorId),
    [participants, instructorId]
  );

  return (
    <Stack gap="lg" p="lg">
      <Group justify="space-between">
        <Title order={2}>Classroom</Title>
        <Badge color={joined ? 'green' : 'gray'}>{joined ? 'Joined' : 'Idle'}</Badge>
      </Group>

      <Group wrap="wrap" align="flex-end">
        <Select
          label="Role"
          value={role}
          onChange={(v) => v && setRole(v as Role)}
          data={[
            { value: 'instructor', label: 'Instructor' },
            { value: 'student', label: 'Student' }
          ]}
          disabled={joined}
          style={{ minWidth: 200 }}
        />
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
          <strong>Me ({role})</strong>
        </Card.Section>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: 260, background: 'black', borderRadius: 12 }}
        />
        {/* Students: hidden audio for instructor feed */}
        {!isInstructor && (
          <audio
            id={`${instructorId ?? 'instructor'}-audio`}
            ref={instructorAudioRef}
            autoPlay
            style={{ display: 'none' }}
          />
        )}
      </Card>

      {/* Grid */}
      {isInstructor ? (
        <>
          <Group>
            <Text fw={600}>Students</Text>
            <Button variant="light" onClick={silenceAll} disabled={!currentAudioStudent}>
              Silence current
            </Button>
            {currentAudioStudent && (
              <Badge color="blue">On mic: {currentAudioStudent.slice(0, 6)}…</Badge>
            )}
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {studentList.map((p) => (
              <Card key={p.participantId} withBorder radius="lg" padding="md" w={300}>
                <Card.Section inheritPadding py="sm">
                  <Group justify="space-between">
                    <strong>{p.displayName || p.participantId.slice(0, 6)}…</strong>
                    <Group gap="xs">
                      <Button size="xs" onClick={() => giveMic(p.participantId)}>
                        Give mic
                      </Button>
                      {currentAudioStudent === p.participantId && (
                        <Badge color="green">Speaking</Badge>
                      )}
                    </Group>
                  </Group>
                </Card.Section>
                <video
                  id={`${p.participantId}-video`}
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: 220, background: 'black', borderRadius: 12 }}
                />
                {/* Instructor does NOT render student audio by default */}
              </Card>
            ))}
          </SimpleGrid>
        </>
      ) : (
        // Student: only instructor video (already constrained)
        <Card withBorder radius="lg" w={300}>
          <Card.Section inheritPadding py="sm">
            <strong>Instructor</strong>
          </Card.Section>
          <video
            id={`${instructorId ?? 'instructor'}-video`}
            autoPlay
            playsInline
            style={{ width: '100%', height: 300, background: 'black', borderRadius: 12 }}
          />
          <audio
            id={`${instructorId ?? 'instructor'}-audio`}
            autoPlay
            style={{ display: 'none' }}
          />
        </Card>
      )}
    </Stack>
  );
}
