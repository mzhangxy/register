#!/usr/bin/env node

const http = require("http");
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

const UPLOAD_URL = process.env.UPLOAD_URL || '';      
const PROJECT_URL = process.env.PROJECT_URL || '';    
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; 
const FILE_PATH = process.env.FILE_PATH || '.tmp';    
const SUB_PATH = process.env.SUB_PATH || 'sub';       
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;        
const HOST = process.env.HOST || '0.0.0.0';
const UUID = process.env.UUID || '9afd1229-b893-40c1-84dd-51e7ce204913'; 
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';        
const NEZHA_PORT = process.env.NEZHA_PORT || '';            
const NEZHA_KEY = process.env.NEZHA_KEY || '';              
// 注意：隧道相关变量已废弃但保留声明以防报错
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';          
const ARGO_AUTH = process.env.ARGO_AUTH || '';              
const ARGO_PORT = process.env.ARGO_PORT || 59001;            
const S5_PORT = process.env.S5_PORT || '';                  
const HY2_PORT = process.env.HY2_PORT || '';                
// 重点：在这里填入你唯一可用的端口 46104，或者在环境变量中指定
const REALITY_PORT = process.env.REALITY_PORT || '46104';        
const CFIP = process.env.CFIP || 'www.ntu.edu.sg';            
const CFPORT = process.env.CFPORT || 443;                   
const NAME = process.env.NAME || 'Pura';                        
const CHAT_ID = process.env.CHAT_ID || '';                  
const BOT_TOKEN = process.env.BOT_TOKEN || '';              
const SHOW_LOG = !['false', 'disable', 'no'].includes((process.env.SHOW_LOG || 'true').toLowerCase()); 

if (!SHOW_LOG) {
  console.log = () => {};
  console.error = () => {};
}
function alwaysLog(msg) {
  process.stdout.write(msg + '\n');
}

if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
}

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

let subContent = null;
let privateKey = '';
let publicKey = '';
const npmName = 'npm_core';
const webName = 'web_core';
const phpName = 'php_core';
let npmPath = path.join(FILE_PATH, npmName);
let phpPath = path.join(FILE_PATH, phpName);
let webPath = path.join(FILE_PATH, webName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let certPath = path.resolve(FILE_PATH, 'cert.pem');
let keyPath = path.resolve(FILE_PATH, 'private.key');

function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;
    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, 'utf-8');
    } catch { return null; }
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|socks):\/\//.test(line));
    if (nodes.length === 0) return;
    axios.post(`${UPLOAD_URL}/api/delete-nodes`, JSON.stringify({ nodes }), { headers: { 'Content-Type': 'application/json' } }).catch(() => { return null; });
    return null;
  } catch (err) { return null; }
}

function generateX25519Keypair() {
  const { publicKey: pubKey, privateKey: privKey } = crypto.generateKeyPairSync('x25519');
  const privateKeyRaw = privKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const publicKeyRaw = pubKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return {
    privateKey: privateKeyRaw.toString('base64url'),
    publicKey: publicKeyRaw.toString('base64url')
  };
}

function generateOrLoadKeyPair() {
  const keyFilePath = path.join(FILE_PATH, 'key.txt');
  if (fs.existsSync(keyFilePath)) {
    const content = fs.readFileSync(keyFilePath, 'utf8');
    const privateKeyMatch = content.match(/PrivateKey:\s*(.*)/);
    const publicKeyMatch = content.match(/PublicKey:\s*(.*)/);
    if (privateKeyMatch && publicKeyMatch) {
      privateKey = privateKeyMatch[1].trim();
      publicKey = publicKeyMatch[1].trim();
      console.log('Private Key:', privateKey);
      console.log('Public Key:', publicKey);
      return;
    }
  }
  const keypair = generateX25519Keypair();
  privateKey = keypair.privateKey;
  publicKey = keypair.publicKey;
  fs.writeFileSync(keyFilePath, `PrivateKey: ${privateKey}\nPublicKey: ${publicKey}\n`, 'utf8');
  console.log('Private Key:', privateKey);
  console.log('Public Key:', publicKey);
}

function ensureTlsCertificates(certPath, keyPath) {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return;
  fs.mkdirSync(path.dirname(certPath), { recursive: true });
  try {
    execSync('openssl version', { stdio: 'ignore' });
    execSync(`openssl ecparam -genkey -name prime256v1 -out "${keyPath}"`, { stdio: 'ignore' });
    execSync(`openssl req -new -x509 -days 3650 -key "${keyPath}" -out "${certPath}" -subj "/CN=bing.com"`, { stdio: 'ignore' });
    return;
  } catch (e) {}
}

function getCertificateFingerprint(certPath) {
  try {
    const result = execSync(`openssl x509 -noout -fingerprint -sha256 -in "${certPath}"`, { encoding: 'utf8', timeout: 3000 }).trim();
    const match = result.match(/=(.+)$/);
    if (match && match[1]) return match[1].toUpperCase();
  } catch (e) {}
  try {
    const certData = fs.readFileSync(certPath, 'utf8');
    const derMatch = certData.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
    if (!derMatch) return '';
    const derBase64 = derMatch[1].replace(/\s/g, '');
    const derBuffer = Buffer.from(derBase64, 'base64');
    const hash = crypto.createHash('sha256').update(derBuffer).digest('hex');
    return hash.match(/.{2}/g).join(':').toUpperCase();
  } catch (error) { return ''; }
}

async function generateConfig() {
  const config = {
    log: { loglevel: 'info' }, // 修改：开启运行日志
    inbounds: [
      { tag: 'vless-fallback-in', port: ARGO_PORT, listen: '::', protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { tag: 'vless-tcp-in', port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { tag: 'vless-ws-in', port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { tag: 'vmess-ws-in', port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { tag: 'trojan-ws-in', port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }]
  };

  if (isValidPort(REALITY_PORT)) {
    config.inbounds.push({
      tag: "vless-in",
      listen: "::",
      port: parseInt(REALITY_PORT),
      protocol: "vless",
      settings: { clients: [{ id: UUID, flow: "xtls-rprx-vision" }], decryption: "none" },
      streamSettings: {
        network: "raw", security: "reality",
        realitySettings: { show: false, dest: "www.iij.ad.jp:443", xver: 0, serverNames: ["www.iij.ad.jp"], privateKey: privateKey, shortIds: [""] }
      }
    });
  }

  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') return 'arm';
  return 'amd';
}

// 修改：文件存在校验，axios -> curl -> wget 降级下载
function downloadFile(fileName, fileUrl, callback) {
  const filePath = fileName;
  if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

  if (fs.existsSync(filePath)) {
    try {
      if (fs.statSync(filePath).size > 0) {
        console.log(`File ${path.basename(filePath)} already exists, skipping download.`);
        return callback(null, filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error(`Error checking existing file ${filePath}:`, err.message);
    }
  }

  const downloadWithAxios = () => {
    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      axios({ method: 'get', url: fileUrl, responseType: 'stream', timeout: 15000 })
        .then(response => {
          response.data.pipe(writer);
          writer.on('finish', () => { writer.close(); resolve(); });
          writer.on('error', err => { writer.close(); fs.unlink(filePath, () => {}); reject(err); });
        })
        .catch(err => { if (fs.existsSync(filePath)) fs.unlink(filePath, () => {}); reject(err); });
    });
  };

  const downloadWithCurl = async () => {
    await exec(`curl -L -s -m 15 -o "${filePath}" "${fileUrl}"`);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) throw new Error('Curl downloaded file is empty');
  };

  const downloadWithWget = async () => {
    await exec(`wget -q -T 15 -O "${filePath}" "${fileUrl}"`);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) throw new Error('Wget downloaded file is empty');
  };

  (async () => {
    try {
      await downloadWithAxios();
      console.log(`Download ${path.basename(filePath)} successfully with axios`);
      return callback(null, filePath);
    } catch (axiosErr) {
      console.error(`Axios fail, trying curl for ${path.basename(filePath)}...`);
      try {
        await downloadWithCurl();
        console.log(`Download ${path.basename(filePath)} successfully with curl`);
        return callback(null, filePath);
      } catch (curlErr) {
        console.error(`Curl fail, trying wget for ${path.basename(filePath)}...`);
        try {
          await downloadWithWget();
          console.log(`Download ${path.basename(filePath)} successfully with wget`);
          return callback(null, filePath);
        } catch (wgetErr) {
          const errMsg = `All methods failed for ${path.basename(filePath)}`;
          console.error(errMsg);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          return callback(errMsg);
        }
      }
    }
  })();
}

function getFilesForArchitecture(architecture) {
  let baseFiles = architecture === 'arm' 
    ? [{ fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" }] 
    : [{ fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" }];

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      baseFiles.unshift({ fileName: npmPath, fileUrl: architecture === 'arm' ? "https://arm64.ssss.nyc.mn/agent" : "https://amd64.ssss.nyc.mn/agent" });
    } else {
      baseFiles.unshift({ fileName: phpPath, fileUrl: architecture === 'arm' ? "https://arm64.ssss.nyc.mn/v1" : "https://amd64.ssss.nyc.mn/v1" });
    }
  }
  return baseFiles;
}

async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);
  if (filesToDownload.length === 0) return;

  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, filePath) => {
        if (err) reject(err); else resolve(filePath);
      });
    });
  });

  try { await Promise.all(downloadPromises); } catch (err) { return; }

  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;
    filePaths.forEach(absoluteFilePath => {
      if (fs.existsSync(absoluteFilePath)) {
        fs.chmod(absoluteFilePath, newPermissions, () => {});
      }
    });
  }
  authorizeFiles(NEZHA_PORT ? [npmPath, webPath] : [phpPath, webPath]);

  // 修改：Nezha 及 Xray 启动日志写入文件
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      const configYaml = `client_secret: ${NEZHA_KEY}\ndebug: false\ndisable_auto_update: true\ndisable_command_execute: false\ndisable_force_update: true\ndisable_nat: false\ndisable_send_query: false\ngpu: false\ninsecure_tls: true\nip_report_period: 1800\nreport_delay: 4\nserver: ${NEZHA_SERVER}\nskip_connection_count: true\nskip_procs_count: true\ntemperature: false\ntls: false\nuse_gitee_to_upgrade: false\nuse_ipv6_country_code: false\nuuid: ${UUID}`;
      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
      try {
        await exec(`nohup ${phpPath} -c "${FILE_PATH}/config.yaml" > ${FILE_PATH}/php.log 2>&1 &`);
        console.log(`${phpName} is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {}
    } else {
      let NEZHA_TLS = ['443', '8443', '2096', '2087', '2083', '2053'].includes(NEZHA_PORT) ? '--tls' : '';
      try {
        await exec(`nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs > ${FILE_PATH}/npm.log 2>&1 &`);
        console.log(`${npmName} is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {}
    }
  }

  // 运行 Xray
  try {
    await exec(`nohup ${webPath} -c ${FILE_PATH}/config.json > ${FILE_PATH}/web.log 2>&1 &`);
    console.log(`${webName} is running`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`web running error: ${error}`);
  }
  // 修改：彻底删除原有 Cloudflared (bot) 进程启动逻辑
}

async function getMetaInfo() {
  try {
    const response1 = await axios.get('https://api.ip.sb/geoip', { headers: { 'User-Agent': 'Mozilla/5.0', timeout: 3000 } });
    if (response1.data && response1.data.country_code && response1.data.isp) return `${response1.data.country_code}-${response1.data.isp}`.replace(/\s+/g, '_');
  } catch (error) {}
  return 'Unknown';
}

async function getServerIP() {
  let serverIP = '';
  try {
    serverIP = (await axios.get('http://ipv4.ip.sb', { timeout: 3000 })).data.trim();
  } catch (err) {
    try {
      serverIP = execSync('curl -sm 3 ipv4.ip.sb').toString().trim();
    } catch (curlErr) {
      try {
        serverIP = `[${(await axios.get('http://ipv6.ip.sb', { timeout: 3000 })).data.trim()}]`;
      } catch (ipv6Err) {}
    }
  }
  return serverIP;
}

async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;
  const SERVER_IP = await getServerIP();

  return new Promise((resolve) => {
    setTimeout(() => {
      const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'auto', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox' };
      let subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}
vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}
trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}
    `;

      if (isValidPort(REALITY_PORT)) {
        const vlessNode = `\nvless://${UUID}@${SERVER_IP}:${REALITY_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.iij.ad.jp&fp=firefox&pbk=${publicKey}&type=tcp&headerType=none#${nodeName}`;
        subTxt += vlessNode;
      }

      console.log(Buffer.from(subTxt).toString('base64'));
      fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
      fs.writeFileSync(listPath, subTxt, 'utf8');
      console.log(`${FILE_PATH}/sub.txt saved successfully`);
      subContent = Buffer.from(subTxt).toString('base64');
      uploadNodes();
      resolve(subTxt);
    }, 2000);
  });
}

async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    try { await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, { subscription: [`${PROJECT_URL}/${SUB_PATH}`] }, { headers: { 'Content-Type': 'application/json' } }); } catch (error) {}
  } else if (UPLOAD_URL && fs.existsSync(listPath)) {
    const nodes = fs.readFileSync(listPath, 'utf-8').split('\n').filter(line => /(vless|vmess|trojan|hysteria2|socks):\/\//.test(line));
    if (nodes.length > 0) {
      try { await axios.post(`${UPLOAD_URL}/api/add-nodes`, JSON.stringify({ nodes }), { headers: { 'Content-Type': 'application/json' } }); } catch (error) {}
    }
  }
}

async function sendTelegram() {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const message = fs.readFileSync(subPath, 'utf8');
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const escapedName = NAME.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
    await axios.post(url, null, { params: { chat_id: CHAT_ID, text: `**${escapedName}节点推送**\n\`\`\`${message}\`\`\``, parse_mode: 'MarkdownV2' } });
  } catch (error) {}
}

async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) return;
  try { await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL }, { headers: { 'Content-Type': 'application/json' } }); } catch (error) {}
}

// 修改：完全绕过隧道逻辑，直奔生成直连节点
async function startserver() {
  try {
    deleteNodes();
    try {
      execSync('pkill -f "web_core|bot_core|npm_core|php_core"');
    } catch (e) {}

    if (isValidPort(REALITY_PORT)) generateOrLoadKeyPair();
    if (isValidPort(HY2_PORT)) ensureTlsCertificates(certPath, keyPath);

    await generateConfig();
    await downloadFilesAndRun();
    
    // 直接生成直连节点，忽略隧道重试
    await generateLinks('direct-connection'); 
    
    await sendTelegram();
    await AddVisitTask();
  } catch (error) {
    console.error('Error in startserver:', error);
  }
}

startserver().catch(error => {
  console.error('Unhandled error in startserver:', error);
});

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  if (urlPath === `/${SUB_PATH}`) {
    if (subContent) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(subContent);
    } else {
      try {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(fs.readFileSync(subPath, 'utf-8'));
      } catch (err) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Subscription content not yet available, please try again later.');
      }
    }
    return;
  }
  if (urlPath === '/') {
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(await fs.promises.readFile(path.join(__dirname, 'index.html'), 'utf8'));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end("Hello world!<br><br>You can access /{SUB_PATH}(Default: /sub) to get your nodes!");
    }
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, HOST, () => alwaysLog(`http server is running on ${HOST}:${PORT}!`));
