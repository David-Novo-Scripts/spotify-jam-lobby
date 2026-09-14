# Spotify Jam Lobby

A self-hosted invitation page for Spotify Jam. Guests solve a playful mini-game, then receive a fresh Jam invitation. A Spicetify extension on the host computer can resume paused music before handing over the link.

The guest interface is currently in Portuguese. Texts are generic and can be edited in `spotify-jam-page.html` and `spotify-jam-lan-server.js`.

## What it does

- Eleven mini-games, plus an optional DJ tribute challenge.
- Live host availability, fresh invitation links and optional resume-on-entry.
- No server dependencies, Spotify OAuth application or guest account database.
- Optional Windows login/startup recovery without console flashes.

Unofficial and not affiliated with Spotify. Uses internal Spotify client APIs, which can change. A successfully generated link is not proof that another account can join: test with a guest account.

## Requirements

- Node.js 22 or newer; Spotify Desktop with a working Spicetify installation on the same computer.
- A selected track and playback device. Keep Spotify open and the host awake.
- Spotify Premium for hosting; remote participation also requires Premium. See [Spotify Jam requirements](https://support.spotify.com/us/article/jam/).
- A trusted LAN reachable by guests. This is not designed for public Internet hosting.

The server/extension use port **38765** by default. Windows is the tested setup; automatic startup scripts are Windows-only.

## Which Spotify app should the host use?

**Use Spotify Desktop installed directly from Spotify's website.** This is the Windows setup tested with this project. On the [Windows download page](https://www.spotify.com/download/windows/), choose the direct Spotify download rather than the Microsoft Store option.

The host extension does not run in the Spotify Web Player, a browser-installed web app, or the Android/iOS apps. Guests can still open the invitation page in a browser and join through their Spotify app; they do not install Spicetify.

The Microsoft Store edition is also a desktop app, but it has not been tested with this project. [Spicetify v2.45.0](https://github.com/spicetify/cli/releases/tag/v2.45.0) lists Store support and notes that it may need to be reapplied each time that edition is closed. It is not accurate to say the Store edition never works, but use the direct installer to follow the tested setup and avoid that extra recovery step.

If you already have the Store edition and want to follow this guide, close Spotify, uninstall that edition through Windows Settings, install the direct download, sign in and test playback before configuring Spicetify. Offline downloads may need to be downloaded again. Do not keep two editions and accidentally apply the extension to one while opening the other.

## Install on Windows

Download this repository into a permanent folder. Open PowerShell in that folder.
Install [Node.js](https://nodejs.org/) and follow the [official Spicetify installation guide](https://spicetify.app/docs/getting-started). Marketplace is optional. Open Spotify, sign in and verify playback first.

```powershell
node --version
spicetify --version
$jamExtensions = Join-Path $env:APPDATA 'spicetify\Extensions'
New-Item -ItemType Directory -Force -Path $jamExtensions | Out-Null
Copy-Item .\spotify-jam-poc.js $jamExtensions
spicetify config extensions spotify-jam-poc.js
```

For the first Spicetify setup, run `spicetify backup apply`. For an existing installation with a valid backup, run `spicetify apply`. Then run `spicetify restart`.

**Copying/registering the extension alone is insufficient.** Applying it updates Spotify's extension loader. If `spicetify` is missing from PATH, reopen PowerShell or use `& "$env:LOCALAPPDATA\spicetify\spicetify.exe"` if that executable exists. Use `spicetify path all` to diagnose installation paths; do not blindly force a path from another machine.

Start the server:

```powershell
npm start
```

It generates `spotify-jam-lan-config.json` locally and prints a private LAN URL. Share the complete URL with intended guests only. Keep this configuration when updating to preserve the key; never commit or share the file publicly.

### Verify

1. Open the printed URL and wait for the host-online message.
2. Complete a challenge and check that Spotify opens.
3. Have another account join through the page and confirm participation.
4. Pause an already selected track and retry through the page to test automatic resume.

With `AUTO_PLAY_ON_ENTRY` and `USE_HOST_PC_ON_ENTRY` enabled, an approved request transfers playback from another device to the host PC before resuming. It waits for the local device and playback to be active before returning the invitation. Disable `USE_HOST_PC_ON_ENTRY` to keep the current output device. If automatic playback is disabled, no device transfer is attempted.

An old `spotify.link` bypasses this page and cannot trigger resume-on-entry. This project does not change Spotify's guest-control permissions. If the music queue/device is empty or unavailable, automatic resume can fail.

## Options

| Variable | File | Default |
| --- | --- | --- |
| `TRIBUTE_ENABLED` | `spotify-jam-lan-server.js` | `false`: optional DJ tribute excluded, other challenges required |
| `USE_HOST_PC_ON_ENTRY` | `spotify-jam-poc.js` | `true`: transfer playback to the computer running the extension before resuming |
| `AUTO_PLAY_ON_ENTRY` | `spotify-jam-poc.js` | `true`: resume paused playback on an approved invitation request |

With tribute disabled, the server ignores forced tribute requests and the page clears saved tribute state. Refresh an already-open page to clear a displayed challenge.

`SPOTIFY_JAM_LAN_PUBLIC_HOST` changes the advertised hostname, not DNS or IP allocation. `SPOTIFY_JAM_LAN_PORT` changes the server port; if changing it, also change `LAN_BRIDGE` in the extension and reapply it. A DHCP reservation or stable DNS name avoids changing guest URLs.

## Invisible Windows startup and recovery

After the manual setup works, stop the manually started server with Ctrl+C, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-startup.ps1
```

This registers **Spotify Jam Lobby Server** for your current Windows account, at login and every minute. It runs `ensure-jam-server-hidden.vbs`, which starts the PowerShell check hidden from creation. Node must be on the user's PATH. If Windows Script Host or scheduled tasks are disabled by your organisation, ask your administrator; do not bypass organisational policy.

The task runs while you are logged in (including a locked screen), not before login. It does not wake the PC or open Spotify. A terminated server is restarted on the next check after wake or failure. It detects the full server path and avoids duplicates from this task; do not start another server manually while the task is active. It does not recover a hung process that is still running.

`jam-server.log` and `jam-server-error.log` contain output from the latest automatic launch. The first includes the private invitation URL; both are ignored by Git.

```powershell
Get-ScheduledTaskInfo -TaskName 'Spotify Jam Lobby Server'
# Pause automatic recovery before intentionally stopping Node:
Disable-ScheduledTask -TaskName 'Spotify Jam Lobby Server'
Stop-ScheduledTask -TaskName 'Spotify Jam Lobby Server'
# Resume:
Enable-ScheduledTask -TaskName 'Spotify Jam Lobby Server'
Start-ScheduledTask -TaskName 'Spotify Jam Lobby Server'
```

To remove automatic recovery, unregister that task in Task Scheduler. Removing/disabling it does not terminate an already-running Node child. Identify only this server process in Task Manager before stopping it; do not stop every Node process.

## Updating and troubleshooting

Extension changes require copying the updated file again, then:

```powershell
spicetify refresh -e
spicetify restart
```

If the extension was newly registered or is not detected, use `spicetify apply` then restart. A refresh may copy files while the running client still uses old code. Server changes require restarting Node; HTML changes only require reloading the page. Disable recovery before a manual server restart, then enable it again.

| Symptom | Check |
| --- | --- |
| Server running, host offline | Apply the extension and restart Spotify; verify both use the same port. |
| `Resolver not found!` | Use the current extension: HTTPS requests use browser fetch rather than Cosmos resolution. |
| Access token unavailable | Use the current extension and restart; authentication comes from `Spicetify.Platform`. |
| Guest sees an ended session | Generate a fresh invitation through the page. The extension uses Spotify's join URI, not its internal session ID. Check that the Jam remains active and the account is eligible. |
| No automatic playback | Select a track/device; use the page and enable `AUTO_PLAY_ON_ENTRY`. |
| `EADDRINUSE` | Another server already owns the port; check the scheduled task. |
| Works locally only | Check LAN isolation and the firewall rule for TCP 38765 on the appropriate network profile. |

After Spotify updates, consult [Spicetify's recovery instructions](https://spicetify.app/docs/getting-started#updating) before rebuilding backups.

## Development

```sh
npm test
```

Tests run with temporary configuration, without real Spotify credentials or access to a live Jam. GitHub Actions runs the same tests. Guest-account acceptance and Windows startup behavior require manual verification.

See [SECURITY.md](SECURITY.md) for the trust model. Licensed under MIT.
