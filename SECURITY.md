# Security and privacy

Spotify Jam Lobby is a trusted-LAN experiment, not an Internet-facing service or a security CAPTCHA.

- The secret query-string key grants access to the invitation page. Games are for fun and can be scripted. Anyone with the key can request a Jam and, when enabled, resume host playback.
- HTTP is unencrypted. Use only a trusted network; do not expose the port through a router or publish a live invitation URL.
- Bridge endpoints accept loopback callers only, but do not authenticate other local processes. CORS is permissive. Untrusted local software/browser contexts are outside this project's trust boundary.
- Spotify access tokens remain in the desktop extension and are sent to Spotify's HTTPS service, not stored by the server.
- Runtime configuration and logs are excluded from version control. Do not attach them to public issues: they may contain private invitation links or service errors.
- To rotate access, stop the server, remove its generated configuration, and restart. Share the new URL only with intended guests.
- Report bugs with redacted reproduction steps. Never publish credentials or live invitations in an issue.
