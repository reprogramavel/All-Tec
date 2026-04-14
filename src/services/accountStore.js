const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'data');
const accountsFile = path.join(dataDir, 'accounts.json');

function ensureStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(accountsFile)) {
    fs.writeFileSync(accountsFile, JSON.stringify({ accounts: [] }, null, 2));
  }
}

function readAccounts() {
  ensureStore();

  try {
    const raw = fs.readFileSync(accountsFile, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.accounts)) {
      return [];
    }

    return parsed.accounts.filter((account) => account && account.name && account.token);
  } catch (_) {
    return [];
  }
}

function saveAccount(name, token) {
  const normalizedName = String(name || '').trim();
  const normalizedToken = String(token || '').trim();

  if (!normalizedName || !normalizedToken) {
    return;
  }

  const accounts = readAccounts();
  const existingIndex = accounts.findIndex(
    (account) => account.name.toLowerCase() === normalizedName.toLowerCase()
  );

  const nextAccount = { name: normalizedName, token: normalizedToken };

  if (existingIndex >= 0) {
    accounts[existingIndex] = nextAccount;
  } else {
    accounts.push(nextAccount);
  }

  ensureStore();
  fs.writeFileSync(accountsFile, JSON.stringify({ accounts }, null, 2));
}

module.exports = {
  readAccounts,
  saveAccount,
};
