const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'data');
const blacklistFile = path.join(dataDir, 'blacklists.json');

function ensureStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(blacklistFile)) {
    fs.writeFileSync(blacklistFile, JSON.stringify({ users: [], servers: [] }, null, 2));
  }
}

function readBlacklists() {
  ensureStore();

  try {
    const raw = fs.readFileSync(blacklistFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      servers: Array.isArray(parsed.servers) ? parsed.servers : [],
    };
  } catch (_) {
    return { users: [], servers: [] };
  }
}

function saveBlacklists(data) {
  ensureStore();
  fs.writeFileSync(blacklistFile, JSON.stringify(data, null, 2));
}

// ==================== USERS ====================

function addUserToBlacklist(id, name) {
  const data = readBlacklists();
  if (data.users.some(u => u.id === id)) return false;
  data.users.push({ id, name: name || id });
  saveBlacklists(data);
  return true;
}

function removeUserFromBlacklist(id) {
  const data = readBlacklists();
  const before = data.users.length;
  data.users = data.users.filter(u => u.id !== id);
  if (data.users.length === before) return false;
  saveBlacklists(data);
  return true;
}

function isUserBlacklisted(id) {
  const data = readBlacklists();
  return data.users.some(u => u.id === id);
}

// ==================== SERVERS ====================

function addServerToBlacklist(id, name) {
  const data = readBlacklists();
  if (data.servers.some(s => s.id === id)) return false;
  data.servers.push({ id, name: name || id });
  saveBlacklists(data);
  return true;
}

function removeServerFromBlacklist(id) {
  const data = readBlacklists();
  const before = data.servers.length;
  data.servers = data.servers.filter(s => s.id !== id);
  if (data.servers.length === before) return false;
  saveBlacklists(data);
  return true;
}

function isServerBlacklisted(id) {
  const data = readBlacklists();
  return data.servers.some(s => s.id === id);
}

module.exports = {
  readBlacklists,
  addUserToBlacklist,
  removeUserFromBlacklist,
  isUserBlacklisted,
  addServerToBlacklist,
  removeServerFromBlacklist,
  isServerBlacklisted,
};
