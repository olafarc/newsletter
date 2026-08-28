#!/usr/bin/env node
// Genera data/steam.json a partir de la Steam Web API.
// Se ejecuta desde el GitHub Action .github/workflows/steam-sync.yml
// Requiere las variables de entorno STEAM_API_KEY y STEAM_ID (repository secrets).
//
// Uso local para probar: STEAM_API_KEY=xxx STEAM_ID=765611... node scripts/steam-sync.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

if (!API_KEY || !STEAM_ID) {
  console.error('Faltan las variables de entorno STEAM_API_KEY y/o STEAM_ID.');
  process.exit(1);
}

function headerUrl(appid) {
  // CDN público de Steam, no requiere API key.
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Steam API respondió ${res.status} ${res.statusText} para ${url.split('?')[0]}`);
  }
  return res.json();
}

async function main() {
  const recentUrl = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${API_KEY}&steamid=${STEAM_ID}&count=6&format=json`;
  const summaryUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${API_KEY}&steamids=${STEAM_ID}&format=json`;

  const [recentData, summaryData] = await Promise.all([
    fetchJson(recentUrl),
    fetchJson(summaryUrl)
  ]);

  const games = (recentData.response && recentData.response.games) || [];
  const recent = games.map(g => ({
    appid: g.appid,
    name: g.name,
    header: headerUrl(g.appid),
    playtime2weeksMinutes: g.playtime_2weeks || 0,
    playtimeForeverMinutes: g.playtime_forever || 0
  }));

  const player = (summaryData.response && summaryData.response.players && summaryData.response.players[0]) || null;

  // gameid presente en el perfil = está jugando ahora mismo (requiere perfil público
  // y "Game details" en público para que aparezca).
  let currentlyPlaying = null;
  if (player && player.gameid) {
    const inRecent = recent.find(g => String(g.appid) === String(player.gameid));
    currentlyPlaying = inRecent || {
      appid: player.gameid,
      name: player.gameextrainfo || 'Jugando ahora',
      header: headerUrl(player.gameid),
      playtime2weeksMinutes: 0,
      playtimeForeverMinutes: 0
    };
  }

  const output = {
    updatedAt: new Date().toISOString(),
    currentlyPlaying,
    lastPlayed: recent[0] || null,
    recent: recent.slice(0, 6)
  };

  await mkdir('data', { recursive: true });
  const outPath = path.join('data', 'steam.json');
  await writeFile(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`${outPath} actualizado.`, currentlyPlaying ? `Jugando ahora: ${currentlyPlaying.name}` : `Última partida: ${output.lastPlayed ? output.lastPlayed.name : '(sin datos)'}`);
}

main().catch(err => {
  console.error('Error al sincronizar con Steam:', err.message);
  process.exit(1);
});
