// Spicetify extension / DevTools snippet.
// It deliberately has no UI: call createSpotifyJamLink() from Spotify DevTools.
(() => {
  // Retoma a música quando alguém pede entrada pela página da Jam.
  const AUTO_PLAY_ON_ENTRY = true;
  // Usa o PC desta extensão como saída de reprodução nos pedidos de entrada.
  const USE_HOST_PC_ON_ENTRY = true;
  const SOCIAL_CONNECT =
    "https://spclient.wg.spotify.com/social-connect/v2/sessions";
  const getSessionField = (response, field) =>
    response?.[field] ??
    response?.session?.[field] ??
    response?.social_session?.[field];

  const waitForSpotifyClient = async () => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const cosmos = globalThis.Spicetify?.CosmosAsync;
      const platform = globalThis.Spicetify?.Platform;
      const nativePlatform = globalThis.Spicetify?._platform;
      if (platform?.AuthorizationAPI?.getState &&
          (nativePlatform?.getUrlDispenserServiceClient || platform?.getUrlDispenserServiceClient)) {
        return { cosmos, platform, nativePlatform };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Spotify client APIs did not become available within 30 seconds.");
  };

  const request = async (client, method, url, body) => {
    // Cosmos resolves internal Spotify URIs. HTTPS calls use the browser's
    // transport: some desktop versions have no Cosmos resolver for spclient.
    if (!url.startsWith("https://") && client.cosmos?.[method]) {
      return client.cosmos[method](url, body);
    }

    const state = await client.platform?.AuthorizationAPI?.getState?.();
    const token = state?.token?.accessToken;
    if (!token) throw new Error("Spotify access token is unavailable.");

    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(client.platform.version ? { "Spotify-App-Version": client.platform.version } : {}),
        ...(client.platform.PlatformData?.app_platform
          ? { "App-Platform": client.platform.PlatformData.app_platform } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const message = text.replace(/[^\x20-\x7E]+/g, " ").trim();
      throw new Error(`Spotify ${method.toUpperCase()} returned a non-JSON response (${response.status}): ${message}`);
    }
    if (!response.ok) {
      throw new Error(`Spotify ${method.toUpperCase()} failed (${response.status}): ${JSON.stringify(data)}`);
    }
    return data;
  };

  /**
   * Creates (or reuses) the active Spotify Jam and returns its share URL only.
   *
   * @returns {Promise<string>} The Jam shareable URL.
   */
  async function createSpotifyJamLink() {
    const client = await waitForSpotifyClient();

    // activate=true is the endpoint that creates a session when one is absent.
    let jam = await request(
      client,
      "get",
      `${SOCIAL_CONNECT}/current_or_new?activate=true&alt=json`,
    );
    let joinSessionUri = getSessionField(jam, "join_session_uri");

    if (!joinSessionUri) {
      throw new Error("Spotify did not return a Jam join_session_uri.");
    }

    const joinSessionToken = getSessionField(jam, "join_session_token");
    if (!joinSessionToken) {
      throw new Error("Spotify did not return a Jam join_session_token.");
    }

    // Match Spotify's getShortInviteLinks: the join URI carries the invite
    // token. The internal session ID is not an invitation credential.
    const spotifyUri = joinSessionUri;

    // Spotify's own client serializes the current protobuf request format.
    const urlDispenser = client.nativePlatform?.getUrlDispenserServiceClient?.()
      ?? client.platform?.getUrlDispenserServiceClient?.();
    if (!urlDispenser?.getShortUrl) {
      throw new Error("Spotify's native URL dispenser client is unavailable.");
    }
    const generated = await urlDispenser.getShortUrl(spotifyUri, {
      customData: [
        { key: "ssp", value: "1" },
        { key: "app_destination", value: "socialsession" },
      ],
      utmParameters: {
        utm_campaign: null,
        utm_term: null,
        utm_medium: "share-link",
        utm_content: null,
        utm_source: "share-options-sheet",
      },
      linkPreview: {
        title: "Junta-te à minha Jam no Spotify",
        image_url: `https://shareables.scdn.co/publish/socialsession/${joinSessionToken}`,
      },
    });

    const shareableUrl = generated?.shareable_url ?? generated?.url;
    if (typeof shareableUrl !== "string") {
      throw new Error("Spotify did not return a Jam shareable_url.");
    }

    return shareableUrl;
  }

  async function resumeForJamEntry() {
    if (!AUTO_PLAY_ON_ENTRY) return;
    const player = globalThis.Spicetify?.Player;
    if (!player?.isPlaying || !player?.play) {
      throw new Error("O leitor do Spotify ainda não está pronto. Tenta novamente.");
    }
    const connect = globalThis.Spicetify?.Platform?.ConnectAPI;
    if (USE_HOST_PC_ON_ENTRY) {
      if (!connect?.getState || !connect?.transferPlayback) {
        throw new Error("Não foi possível identificar o dispositivo deste PC no Spotify.");
      }
      if (connect.getState()?.activeDevice?.isLocal !== true) {
        await connect.transferPlayback("local_device", {});
        for (let attempt = 0; attempt < 32; attempt++) {
          if (connect.getState()?.activeDevice?.isLocal === true) break;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (connect.getState()?.activeDevice?.isLocal !== true) {
          throw new Error("O Spotify não transferiu a reprodução para este PC. Tenta novamente.");
        }
      }
    }
    const ready = () => player.isPlaying() &&
      (!USE_HOST_PC_ON_ENTRY || connect.getState()?.activeDevice?.isLocal === true);
    if (ready()) return;
    await player.play();
    for (let attempt = 0; attempt < 20; attempt++) {
      if (ready()) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("Não foi possível retomar a música. O anfitrião precisa de selecionar uma música e um dispositivo no Spotify.");
  }

  globalThis.createSpotifyJamLink = createSpotifyJamLink;

  // Optional LAN bridge. It is inert until spotify-jam-lan-server.js is
  // running on this same PC. The server only accepts bridge calls from
  // localhost; colleagues can only request and receive a Jam link.
  const LAN_BRIDGE = "http://127.0.0.1:38765";
  const readBridgeJson = async (path, init) => {
    const response = await fetch(`${LAN_BRIDGE}${path}`, init);
    if (!response.ok) throw new Error(`LAN bridge returned ${response.status}.`);
    return response.json();
  };
  const runJamLanBridge = async () => {
    let delay = 2000;
    try {
      const request = await readBridgeJson("/bridge/next");
      if (request?.id) {
        try {
          await waitForSpotifyClient();
          await resumeForJamEntry();
          const url = await createSpotifyJamLink();
          await readBridgeJson("/bridge/result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: request.id, url }),
          });
        } catch (error) {
          await readBridgeJson("/bridge/error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: request.id,
              error: error instanceof Error ? error.message : String(error),
            }),
          });
        }
        delay = 250;
      }
    } catch {
      // The companion server is optional and may not be running.
      delay = 5000;
    }
    setTimeout(runJamLanBridge, delay);
  };
  if (!globalThis.__spotifyJamLanBridgeStarted) {
    globalThis.__spotifyJamLanBridgeStarted = true;
    setTimeout(runJamLanBridge, 1500);
  }
})();
