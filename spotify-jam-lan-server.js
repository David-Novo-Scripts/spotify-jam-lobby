// Local-only bridge for spotify-jam-poc.js. Requires Node.js 18 or newer.
// Start with: node spotify-jam-lan-server.js
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const port = Number(process.env.SPOTIFY_JAM_LAN_PORT || 38765);
// true: inclui o Tributo ao DJ; false: mantém apenas os outros desafios.
const TRIBUTE_ENABLED = false;
const configPath = path.join(__dirname, "spotify-jam-lan-config.json");
const requestLifetimeMs = 10 * 60 * 1000;
const challengeLifetimeMs = 5 * 60 * 1000;
const requests = new Map();
const challenges = new Map();
let bridgeLastSeen = 0;

function saveConfig(config) {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function loadConfig() {
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch {}
  if (!config || typeof config.requestKey !== "string" || config.requestKey.length < 24) {
    config = { requestKey: crypto.randomBytes(24).toString("base64url"), publicHost: null };
  }
  if (process.env.SPOTIFY_JAM_LAN_PUBLIC_HOST) config.publicHost = process.env.SPOTIFY_JAM_LAN_PUBLIC_HOST;
  saveConfig(config);
  return config;
}

const config = loadConfig();

function isLocal(request) {
  const address = request.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function write(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 16_384) request.destroy();
    });
    request.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON body.")); }
    });
    request.on("error", reject);
  });
}

function authorized(url) {
  const supplied = Buffer.from(url.searchParams.get("key") || "");
  const expected = Buffer.from(config.requestKey);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function bridgeIsOnline() {
  return Date.now() - bridgeLastSeen < 15_000;
}

function createChallenge(forceTribute = false) {
  const left = crypto.randomInt(3, 13);
  const right = crypto.randomInt(3, 13);
  const item = {
    id: crypto.randomUUID(),
    answer: String(left + right),
    question: `Quanto e ${left} + ${right}?`,
    createdAt: Date.now(),
  };
  const types = ['memory', 'order', 'pattern', 'odd', 'reverse', 'count', 'pairs', 'maze', 'target', 'colors', 'difference'];
  if (TRIBUTE_ENABLED) types.push('tribute');
  const type = TRIBUTE_ENABLED && forceTribute ? 'tribute' : types[crypto.randomInt(types.length)];
  let data;
  if (type === 'maze') {
    data = [0,1,2,7,12,13,14,19,24];
    item.answer = data.join(',');
    item.question = 'Segue o corredor: leva a nota até à saída, sem tocar nas paredes.';
  } else if (type === 'target') {
    data = Array.from({length:6}, () => [crypto.randomInt(5,75),crypto.randomInt(5,75)]);
    item.answer = 'caught';
    item.question = 'Apanha a batida: acerta nos 6 alvos em 12 segundos.';
  } else if (type === 'colors') {
    data = Array.from({length:5}, () => crypto.randomInt(4));
    item.answer = data.join(',');
    item.question = 'Recria a paleta do DJ pela ordem apresentada.';
  } else if (type === 'difference') {
    const first = Array.from({length:9}, () => crypto.randomInt(4));
    const second = [...first], index = crypto.randomInt(9);
    second[index] = (second[index]+1)%4;
    data = [first,second];
    item.answer = String(index);
    item.question = 'Compara os dois painéis. Toca na diferença do painel da direita.';
  } else if (type === 'tribute') {
    const phrases = [
      'Prometo respeitar a fila e dar uma oportunidade à próxima música.',
      'O DJ merece um aplauso por juntar toda a gente nesta Jam.',
      'Aceito que escolher a próxima música é uma grande responsabilidade.',
      'Prometo não adicionar a mesma música dez vezes seguidas.',
    ];
    data = phrases[crypto.randomInt(phrases.length)];
    item.answer = data;
    item.question = 'Tributo ao DJ: escreve a declaração solene para entrar.';
  } else if (type === 'memory') {
    data = Array.from({length: 6}, () => crypto.randomInt(4));
    item.answer = data.join(',');
    item.question = 'Memoriza as seis luzes e repete a sequência.';
  } else if (type === 'order') {
    data = Array.from({length: 9}, (_, i) => i + 1).sort(() => crypto.randomInt(3) - 1);
    item.answer = '1,2,3,4,5,6,7,8,9';
    item.question = 'Caça as notas: toca nos números de 1 a 9 em 8 segundos, a contar do primeiro toque.';
  } else if (type === 'odd') {
    const target = crypto.randomInt(16);
    data = Array.from({length:16}, (_, i) => i === target ? '◈' : '◇');
    item.answer = String(target);
    item.question = 'Há um intruso na pista. Encontra o símbolo diferente.';
  } else if (type === 'reverse') {
    data = Array.from({length:5}, () => crypto.randomInt(1, 10));
    item.answer = [...data].reverse().join('');
    item.question = 'Rewind: memoriza o código e escreve-o ao contrário.';
  } else if (type === 'count') {
    data = Array.from({length:20}, () => ['♪','♫','♬'][crypto.randomInt(3)]);
    item.answer = String(data.filter(x => x === '♫').length);
    item.question = 'Olhos de DJ: quantos símbolos ♫ vês na pista?';
  } else if (type === 'pairs') {
    data = ['◆','●','▲','■','◆','●','▲','■'];
    for(let i=data.length-1;i>0;i--){const j=crypto.randomInt(i+1);[data[i],data[j]]=[data[j],data[i]];}
    item.answer = 'matched';
    item.question = 'Encontra os quatro pares. Tens até 8 tentativas.';
  } else {
    const step = crypto.randomInt(2, 6);
    data = [left, left + step, left + 2 * step, left + 3 * step];
    item.answer = String(left + 4 * step);
    item.question = 'Descobre a próxima coluna do equalizador.';
  }
  challenges.set(item.id, item);
  return { id: item.id, question: item.question, type, data };
}

function cleanUp() {
  const now = Date.now();
  for (const [id, item] of requests) if (now - item.createdAt > requestLifetimeMs) requests.delete(id);
  for (const [id, item] of challenges) if (now - item.createdAt > challengeLifetimeMs) challenges.delete(id);
  if (!bridgeIsOnline()) for (const item of requests.values()) {
    if (item.status === "processing" || item.status === "pending") {
      item.status = "error";
      item.error = "O Spotify deixou de responder neste PC. Pede ao anfitriao para o abrir.";
    }
  }
  for (const item of requests.values()) {
    if (['pending', 'processing'].includes(item.status) && now - item.createdAt > 45_000) {
      item.status = 'error';
      item.error = 'O Spotify não respondeu a tempo. Pede ao anfitrião para verificar o Spotify e a extensão.';
    }
  }
}

function lanAddresses() {
  if (config.publicHost) return [`http://${config.publicHost}:${port}/?key=${config.requestKey}`];
  const urls = [];
  const virtualAdapter = /tailscale|zerotier|hyper-v|wsl|virtual/i;
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (virtualAdapter.test(name)) continue;
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        urls.push(`[${name}] http://${entry.address}:${port}/?key=${config.requestKey}`);
      }
    }
  }
  return urls;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  cleanUp();
  if (request.method === "OPTIONS") return write(response, 204, "");

  if (url.pathname === "/") {
    if (!authorized(url)) return write(response, 403, "Link de pedido invalido.", "text/plain; charset=utf-8");
    return write(response, 200, fs.readFileSync(path.join(__dirname, 'spotify-jam-page.html'), 'utf8'), "text/html; charset=utf-8");
  }
  if (url.pathname === '/api/availability') {
    if (!authorized(url)) return write(response, 403, {error: 'Link inválido.'});
    return write(response, 200, {online: bridgeIsOnline(), tributeEnabled: TRIBUTE_ENABLED});
  }
  if (url.pathname === "/api/challenge" && request.method === "GET") {
    if (!authorized(url)) return write(response, 403, { error: "Invalid request key." });
    if (!bridgeIsOnline()) return write(response, 503, { error: "O Spotify nao esta aberto no PC do anfitriao. Pede-lhe gentilmente para abrir o Spotify e tenta de novo." });
    return write(response, 200, createChallenge(url.searchParams.get('tribute') === '1'));
  }
  if (url.pathname === "/api/request" && request.method === "POST") {
    if (!authorized(url)) return write(response, 403, { error: "Invalid request key." });
    if (!bridgeIsOnline()) return write(response, 503, { error: "O Spotify nao esta aberto no PC do anfitriao. Pede-lhe gentilmente para abrir o Spotify e tenta de novo." });
    try {
      const body = await readJson(request);
      const challenge = challenges.get(body.challengeId);
      challenges.delete(body.challengeId);
      if (!challenge || challenge.answer !== String(body.answer || "")) {
        return write(response, 400, { error: "Ainda nao mereceste a Jam. Tenta outro desafio." });
      }
    } catch (error) { return write(response, 400, { error: error.message }); }
    const active = [...requests.values()].find((item) => item.status === "pending" || item.status === "processing");
    const item = active || { id: crypto.randomUUID(), status: "pending", createdAt: Date.now() };
    if (!active) requests.set(item.id, item);
    return write(response, 202, { statusUrl: `/api/status/${item.id}?key=${encodeURIComponent(config.requestKey)}` });
  }
  if (url.pathname.startsWith("/api/status/") && request.method === "GET") {
    if (!authorized(url)) return write(response, 403, { error: "Invalid request key." });
    const id = url.pathname.split("/").pop();
    const item = requests.get(id);
    if (!item) return write(response, 404, { error: "Request expired." });
    return write(response, 200, { status: item.status, url: item.url, error: item.error });
  }
  if (url.pathname === "/bridge/next" && request.method === "GET") {
    if (!isLocal(request)) return write(response, 403, { error: "Local bridge only." });
    bridgeLastSeen = Date.now();
    const item = [...requests.values()].find((entry) => entry.status === "pending");
    if (!item) return write(response, 200, {});
    item.status = "processing";
    return write(response, 200, { id: item.id });
  }
  if ((url.pathname === "/bridge/result" || url.pathname === "/bridge/error") && request.method === "POST") {
    if (!isLocal(request)) return write(response, 403, { error: "Local bridge only." });
    try {
      const body = await readJson(request);
      const item = requests.get(body.id);
      if (!item || item.status !== "processing") return write(response, 404, { error: "Unknown request." });
      if (url.pathname.endsWith("/result")) {
        if (typeof body.url !== "string" || !body.url.startsWith("https://spotify.link/")) return write(response, 400, { error: "Invalid Jam URL." });
        item.status = "complete";
        item.url = body.url;
      } else {
        item.status = "error";
        item.error = String(body.error || "Jam creation failed.").slice(0, 300);
      }
      return write(response, 200, { ok: true });
    } catch (error) { return write(response, 400, { error: error.message }); }
  }
  return write(response, 404, { error: "Not found." });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Spotify Jam LAN bridge is running on port ${port}.`);
  console.log("Send this private URL to a guest:");
  for (const url of lanAddresses()) console.log(url);
  console.log("Keep this terminal and Spotify Desktop open. Press Ctrl+C to stop.");
});
