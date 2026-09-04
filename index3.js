#!/usr/bin/env node

const http = require('http');
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
require('dotenv').config();
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;
const YT_WARPOUT = process.env.YT_WARPOUT || false;
const FILE_PATH = process.env.FILE_PATH || '.npm';
const SUB_PATH = process.env.SUB_PATH || 'sub';
const UUID = process.env.UUID || '14e709cd-142b-4e9f-b0a6-cf0e4c14da66';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiZDY1NWNiOTk2NzNlZTYzMDE4NDFkMmQyNmYxNTY5N2EiLCJ0IjoiMWNjMWIyNGItZGE2Mi00MjcxLWJjYzgtMzBlN2IwYjQ0ZGI3IiwicyI6Ik9UVTNNbUkyTWpjdFltRTJNeTAwWVRZMkxUZzVNMll0TWprNE1qWXpZMlkwWWpRMiJ8';
const ARGO_PORT = process.env.ARGO_PORT || '59001';
const S5_PORT = process.env.S5_PORT || '';
const TUIC_PORT = process.env.TUIC_PORT || '';
const HY2_PORT = process.env.HY2_PORT || '';
const ANYTLS_PORT = process.env.ANYTLS_PORT || '';
const REALITY_PORT = process.env.REALITY_PORT || '';
const ANYREALITY_PORT = process.env.ANYREALITY_PORT || '';
const CFIP = process.env.CFIP || 'saas.sin.fan';
const CFPORT = process.env.CFPORT || 443;
const PORT = process.env.PORT || 3000;
const NAME = process.env.NAME || 'VM';
const CHAT_ID = process.env.CHAT_ID || ''; 
const BOT_TOKEN = process.env.BOT_TOKEN || ''; 
const DISABLE_ARGO = process.env.DISABLE_ARGO || false;

if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
}

let privateKey = '';
let publicKey = '';

let webPath = path.join(__dirname, 'web_core');
let botPath = path.join(__dirname, 'bot_core');
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');

function isValidPort(port) {
  try {
    if (port === null || port === undefined || port === '') return false;
    if (typeof port === 'string' && port.trim() === '') return false;
    const portNum = parseInt(port);
    if (isNaN(portNum)) return false;
    if (portNum < 1 || portNum > 65535) return false;
    return true;
  } catch (error) {
    return false;
  }
}

function argoType() {
  if (DISABLE_ARGO === 'true' || DISABLE_ARGO === true) return;
  if (!ARGO_AUTH || !ARGO_DOMAIN) return;

  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
  tunnel: ${ARGO_AUTH.split('"')[11]}
  credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
  protocol: http2
  
  ingress:
    - hostname: ${ARGO_DOMAIN}
      service: http://localhost:${ARGO_PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  }
}

async function runLocalCores() {
  const newPermissions = 0o775;
  [webPath, botPath].forEach(filePath => {
    if (fs.existsSync(filePath)) {
      try {
        fs.chmodSync(filePath, newPermissions);
        console.log(`Empowerment success for ${filePath}`);
      } catch (err) {
        console.error(`Empowerment failed for ${filePath}: ${err.message}`);
      }
    } else {
      console.error(`Missing core file: ${filePath}. Did you upload it?`);
    }
  });

  const keyFilePath = path.join(FILE_PATH, 'key.txt');

  if (fs.existsSync(keyFilePath)) {
    const content = fs.readFileSync(keyFilePath, 'utf8');
    privateKey = (content.match(/PrivateKey:\s*(.*)/) || [])[1] || '';
    publicKey = (content.match(/PublicKey:\s*(.*)/) || [])[1] || '';
    continueExecution();
  } else {
    exec(`${webPath} generate reality-keypair`, async (err, stdout) => {
      if (err) return; 
      privateKey = (stdout.match(/PrivateKey:\s*(.*)/) || [])[1] || '';
      publicKey = (stdout.match(/PublicKey:\s*(.*)/) || [])[1] || '';
      fs.writeFileSync(keyFilePath, `PrivateKey: ${privateKey}\nPublicKey: ${publicKey}\n`, 'utf8');
      continueExecution();
    });
  }

  async function continueExecution() {
    exec('which openssl || where.exe openssl', async (err, stdout) => {
      if (err || stdout.trim() === '') {
        const privateKeyContent = `-----BEGIN EC PARAMETERS-----\nBggqhkjOPQMBBw==\n-----END EC PARAMETERS-----\n-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIM4792SEtPqIt1ywqTd/0bYidBqpYV/++siNnfBYsdUYoAoGCCqGSM49\nAwEHoUQDQgAE1kHafPj07rJG+HboH2ekAI4r+e6TL38GWASANnngZreoQDF16ARa\n/TsyLyFoPkhLxSbehH/NBEjHtSZGaDhMqQ==\n-----END EC PRIVATE KEY-----`;
        fs.writeFileSync(path.join(FILE_PATH, 'private.key'), privateKeyContent);
        const certContent = `-----BEGIN CERTIFICATE-----\nMIIBejCCASGgAwIBAgIUfWeQL3556PNJLp/veCFxGNj9crkwCgYIKoZIzj0EAwIw\nEzERMA8GA1UEAwwIYmluZy5jb20wHhcNMjUwOTE4MTgyMDIyWhcNMzUwOTE2MTgy\nMDIyWjATMREwDwYDVQQDDAhiaW5nLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABNZB2nz49O6yRvh26B9npACOK/nuky9/BlgEgDZ54Ga3qEAxdegEWv07Mi8h\naD5IS8Um3oR/zQRIx7UmRmg4TKmjUzBRMB0GA1UdDgQWBBTV1cFID7UISE7PLTBR\nBfGbgkrMNzAfBgNVHSMEGDAWgBTV1cFID7UISE7PLTBRBfGbgkrMNzAPBgNVHRMB\nAf8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCIAIDAJvg0vd/ytrQVvEcSm6XTlB+\neQ6OFb9LbLYL9f+sAiAffoMbi4y/0YUSlTtz7as9S8/lciBF5VCUoVIKS+vX2g==\n-----END CERTIFICATE-----`;
        fs.writeFileSync(path.join(FILE_PATH, 'cert.pem'), certContent);
      } else {
        try {
          await execPromise(`openssl ecparam -genkey -name prime256v1 -out "${path.join(FILE_PATH, 'private.key')}"`);
          await execPromise(`openssl req -new -x509 -days 3650 -key "${path.join(FILE_PATH, 'private.key')}" -out "${path.join(FILE_PATH, 'cert.pem')}" -subj "/CN=bing.com"`);
        } catch (err) {}
      }

      // 核心 Sing-box 配置（极简版，强制走平台代理）
      const config = {
        "log": { "disabled": true, "level": "error", "timestamp": true },
        "inbounds": [
          {
            "tag": "vmess-ws-in",
            "type": "vmess",
            "listen": "::",
            "listen_port": parseInt(ARGO_PORT),
            "users": [{ "uuid": UUID }],
            "transport": {
              "type": "ws",
              "path": "/vmess-argo",
              "early_data_header_name": "Sec-WebSocket-Protocol"
            }
          }
        ],
        "outbounds": [
          {
            "type": "socks",
            "tag": "platform-proxy",
            "server": "10.201.0.1",
            "server_port": 40007
          },
          {
            "type": "direct",
            "tag": "direct"
          }
        ],
        "route": {
          "final": "platform-proxy"
        }
      };

      if (isValidPort(REALITY_PORT)) {
        config.inbounds.push({
          "tag": "vless-in", "type": "vless", "listen": "::", "listen_port": parseInt(REALITY_PORT),
          "users": [{ "uuid": UUID, "flow": "xtls-rprx-vision" }],
          "tls": { "enabled": true, "server_name": "www.iij.ad.jp", "reality": { "enabled": true, "handshake": { "server": "www.iij.ad.jp", "server_port": 443 }, "private_key": privateKey, "short_id": [""] } }
        });
      }

      fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));

      // 启动 Sing-box 核心
      try {
        await execPromise(`nohup ${webPath} run -c ${path.join(FILE_PATH, 'config.json')} >/dev/null 2>&1 &`);
        console.log('web_core is running');
      } catch (error) { console.error(`web running error: ${error}`); }

      // 启动 Cloudflared 隧道 (强制注入 SOCKS5 代理环境变量)
      if (DISABLE_ARGO !== 'true' && DISABLE_ARGO !== true) {
        if (fs.existsSync(botPath)) {
          let args = ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/) 
            ? `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`
            : `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${path.join(FILE_PATH, 'boot.log')} --loglevel info --url http://localhost:${ARGO_PORT}`;
          try {
            const runCmd = `nohup env https_proxy="socks5://10.201.0.1:40007" all_proxy="socks5://10.201.0.1:40007" ${botPath} ${args} >/dev/null 2>&1 &`;
            await execPromise(runCmd);
            console.log('bot_core is running with SOCKS5 proxy');
          } catch (error) { console.error(`Error executing bot: ${error}`); }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      await extractDomains();
    });
  }
}

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => error ? reject(error) : resolve(stdout || stderr));
  });
}

async function extractDomains() {
  if (DISABLE_ARGO === 'true' || DISABLE_ARGO === true) {
    await generateLinks(null);
    return;
  }
  let argoDomain;
  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    await generateLinks(argoDomain);
  } else {
    try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const domainMatch = fileContent.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
      if (domainMatch) {
        await generateLinks(domainMatch[1]);
      }
    } catch (error) {}
  }
}

async function generateLinks(argoDomain) {
  let SERVER_IP = '127.0.0.1'; 
  const nodeName = NAME;
  let subTxt = '';

  if (argoDomain) {
    const vmessNode = `vmess://${Buffer.from(JSON.stringify({ v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'auto', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'})).toString('base64')}`;
    subTxt = vmessNode;
  }

  if (isValidPort(REALITY_PORT)) {
    subTxt += `\nvless://${UUID}@${SERVER_IP}:${REALITY_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.iij.ad.jp&fp=firefox&pbk=${publicKey}&type=tcp&headerType=none#${nodeName}`;
  }

  console.log('\x1b[32m\n=== YOUR NODES ===\n\x1b[0m');
  console.log(Buffer.from(subTxt).toString('base64'));
  fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
  fs.writeFileSync(listPath, subTxt, 'utf8');
}

async function startserver() {
  argoType();
  await runLocalCores();
}
startserver();

const server = http.createServer((req, res) => {
  if (req.url === `/${SUB_PATH}`) {
    try {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(Buffer.from(fs.readFileSync(listPath, 'utf8')).toString('base64'));
    } catch (err) { res.end('Not Ready'); }
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`App is running.<br>Access /${SUB_PATH} for nodes.`);
  }
});

server.listen(PORT, () => console.log(`Server running on port:${PORT}`));
