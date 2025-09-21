const domain = 'meet.hrcs.space';
const serviceUrl = `wss://${domain}/xmpp-websocket`;
const jwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJocmNzX3NwYWNlIiwiaXNzIjoiaHJjc19zcGFjZV9qaXRzaSIsInN1YiI6Im1lZXQuaHJjcy5zcGFjZSIsInJvb20iOiIqIiwiY29udGV4dCI6eyJ1c2VyIjp7Im5hbWUiOiJOaWtvIiwiZW1haWwiOiJuaWtvQGV4YW1wbGUuY29tIiwibW9kZXJhdG9yIjp0cnVlfX0sImV4cCI6MTc2MDExNTYwMH0.52xzq2lv6aUc8EOoo4iQF1IUGbKY58GRji8nDHpxrnc';

async function initJM() {
  const jm = window.JitsiMeetJS;

  jm.init();

  const localTracks = await jm.createLocalTracks({ devices: ['audio', 'video'] });

  const c = await jm.joinConference('room-a', '', jwt, {
    tracks: localTracks,
    connectionOptions: {
      hosts: { domain, muc: `muc.${domain}` },
      serviceUrl,
    },
    p2p: { enabled: false }
  });

  c.on(jm.events.conference.TRACK_ADDED, (track) => {
    if (track.getType() === 'video') {
      const meetingGrid = document.getElementById('meeting-grid');
      const videoNode = document.createElement('video');

      videoNode.id = track.getId();
      videoNode.className = 'jitsi-track';
      videoNode.autoplay = true;
      meetingGrid?.appendChild(videoNode);
      track.attach(videoNode);
    } else if (!track.isLocal()) {
      const audioNode = document.createElement('audio');

      audioNode.id = track.getId();
      audioNode.className = 'jitsi-track';
      audioNode.autoplay = true;
      document.body.appendChild(audioNode);
      track.attach(audioNode);
    }
  });

  c.on(jm.events.conference.TRACK_REMOVED, (track) => {
    track.dispose();
    document.getElementById(track.getId())?.remove();
  });

  window.addEventListener('unload', async() => {
    await c.dispose();
  });
}

initJM()