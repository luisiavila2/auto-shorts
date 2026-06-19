import 'dotenv/config';
import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';

/* Uso: node scripts/auth-youtube.js .tokens/chatsdramas.json
   Abre el navegador, autorizás la cuenta del canal, y guarda los tokens. */

const tokenFile = process.argv[2];
if (!tokenFile) { console.error('Indicá la ruta de salida, ej: .tokens/chatsdramas.json'); process.exit(1); }

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  // force-ssl habilita commentThreads.insert (el auto-comentario del canal)
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

const oauth = new google.auth.OAuth2(
  process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET,
  process.env.YT_REDIRECT_URI || 'http://localhost:5555/oauth2callback'
);

const authUrl = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
console.log('\nAbrí esta URL y autorizá la cuenta del canal:\n\n' + authUrl + '\n');

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost:5555');
  const code = u.searchParams.get('code');
  if (!code) { res.end('Sin code.'); return; }
  const { tokens } = await oauth.getToken(code);
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
  res.end('Listo. Ya podés cerrar esta pestaña.');
  console.log(`Tokens guardados en ${tokenFile}`);
  server.close();
});
server.listen(5555);
