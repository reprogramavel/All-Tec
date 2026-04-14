// src/app.js - Versão com Menu Mais Claro e Explicativo

const { Client } = require('discord.js-selfbot-v13');
const { createInterface } = require('readline');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const AdmZip = require('adm-zip');

const { delay, formatDuration } = require('./utils/time');
const {
  clearConsole,
  printBanner,
  printAccessGranted,
  printChannelTracking, 
  printDeletedMessage,
  printDeletionProgress,
  printDeletionSummary, 
  printInvalidChannel, 
  printChannelAccessError,
  printInvalidToken,
  askToken,
  askChannelId, 
  askWhitelist,
} = require('./ui/console');

const { loadingScreen } = require('./ui/loading');
const { selectMenu, selectMultiMenu } = require('./ui/menu');
const { readAccounts, saveAccount } = require('./services/accountStore');
const {
  collectOwnMessages,
  fetchTextChannel,
} = require('./services/channelService');

function createClient() {
  return new Client();
}

async function deleteMessages(messages) {
  const startTime = Date.now();
  let count = 0;

  for (const message of messages) {
    printDeletedMessage(message.content);
    await message.delete().catch(() => {});
    count += 1;
    printDeletionProgress(count);
    await delay(300);
  }

  return {
    count,
    duration: formatDuration(Date.now() - startTime),
  };
}

function askQuestion(rl, askFn) {
  return new Promise((resolve) => {
    askFn(rl, resolve);
  });
}

async function promptUser(askFn) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await askQuestion(rl, askFn);
  } finally {
    rl.close();
  }
}

async function selectSavedAccount() {
  const accounts = readAccounts();
  if (accounts.length === 0) return null;

  const options = accounts.map((account, index) => ({
    label: account.name,
    value: String(index),
  }));
  options.push({ label: 'Voltar', value: 'back' });

  const selected = await selectMenu({
    title: 'Contas Salvas',
    subtitle: 'Escolha uma conta salva no JSON para entrar',
    options,
    header: () => printBanner(),
  });

  if (selected === 'back') return null;
  return accounts[Number(selected)] || null;
}

async function resolveLogin() {
  while (true) {
    const accounts = readAccounts();
    const options = [];

    if (accounts.length > 0) options.push({ label: 'Logar com conta salva', value: 'saved' });
    options.push({ label: 'Novo user', value: 'new' });

    const action = await selectMenu({
      title: 'Login',
      subtitle: 'Selecione como deseja entrar',
      options,
      header: () => printBanner(),
    });

    if (action === 'saved') {
      const account = await selectSavedAccount();
      if (!account) continue;
      return { token: account.token, shouldPersist: false };
    }

    if (action === 'new') {
      const token = await promptUser(askToken);
      return { token, shouldPersist: true };
    }
  }
}

async function runSingleChannelCleanup(client) {
  while (true) {
    const action = await selectMenu({
      title: 'CL',
      subtitle: 'Selecione uma opção',
      options: [
        { label: 'Iniciar limpeza por canal', value: 'start' },
        { label: 'Voltar', value: 'back' },
      ],
      header: () => {
        printBanner();
        printAccessGranted(client.user.username);
      },
    });

    if (action === 'back') return;

    const channelId = await promptUser(askChannelId);

    try {
      const channel = await fetchTextChannel(client, channelId);
      if (!channel) {
        printInvalidChannel();
        await delay(1500);
        continue;
      }

      printChannelTracking(channel.name || channelId);
      const messages = await collectOwnMessages(channel, client.user.id);
      const result = await deleteMessages(messages);
      printDeletionSummary(result.count, channel.name || channelId, result.duration);
    } catch (error) {
      printChannelAccessError(error.message);
    }

    await delay(1500);
  }
}

// ====================== CL ALL - MENU MAIS EXPLICATIVO ======================
async function runGuildCleanup(client) {
  const availableScopes = ['dms', 'group_dms', 'guilds'];
  const selectedScopes = await selectMultiMenu({
    title: 'CL ALL - Limpeza em Massa',
    subtitle: 'Selecione os tipos de canais que deseja limpar (use Espaço para marcar)',
    options: [
      { 
        label: 'DMs Diretos (conversas 1x1)', 
        value: 'dms' 
      },
      { 
        label: 'Grupos Privados (conversas com 3+ pessoas)', 
        value: 'group_dms' 
      },
      { 
        label: 'Servidores (todos os canais de servidores)', 
        value: 'guilds' 
      },
    ],
    header: () => {
      printBanner();
        printAccessGranted(client.user.username);
      },
  });
  const scopes = selectedScopes.length > 0 ? selectedScopes : availableScopes;

  const whitelistInput = await promptUser(askWhitelist);
  const whitelist = whitelistInput
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean);

  console.log('\nConfiguração selecionada:');
  console.log(`Escopos: ${scopes.join(', ')}${selectedScopes.length === 0 ? ' (padrão: todos)' : ''}`);
  console.log(`WhiteList (${whitelist.length} IDs): ${whitelist.length > 0 ? whitelist.join(', ') : 'vazia'}`);

  await delay(1800);

  const zipPath = path.resolve(process.cwd(), 'package.zip');
  if (!fs.existsSync(zipPath)) {
    console.log(chalk.redBright('\n🚫 Arquivo package.zip não encontrado na raiz do projeto!'));
    await delay(3000);
    return;
  }

  console.log(chalk.cyanBright('\n📦 Extraindo package.zip...'));

  let tempDir = null;
  let messagesPath = null;

  try {
    const zip = new AdmZip(zipPath);
    tempDir = path.join(process.cwd(), `temp_messages_${Date.now()}`);
    zip.extractAllTo(tempDir, true);

    const candidatePaths = [
      path.join(tempDir, 'package', 'Mensagens'),
      path.join(tempDir, 'Mensagens'),
    ];

    messagesPath = candidatePaths.find(candidate => fs.existsSync(candidate)) || null;

    if (!messagesPath) {
      console.log(chalk.redBright('\n❌ Pasta "Mensagens" não encontrada dentro do ZIP.'));
      await delay(3000);
      return;
    }

    const channelFolders = fs.readdirSync(messagesPath).filter(folder => 
      fs.statSync(path.join(messagesPath, folder)).isDirectory()
    );

    const channelsToProcess = [];

    for (const folder of channelFolders) {
      const channelJsonPath = path.join(messagesPath, folder, 'channel.json');
      if (!fs.existsSync(channelJsonPath)) continue;

      let channelData;
      try {
        channelData = JSON.parse(fs.readFileSync(channelJsonPath, 'utf8'));
      } catch (_) { continue; }

      const channelId = String(channelData.id || '').trim();
      const channelType = String(channelData.type || '').toUpperCase();

      if (!channelId) continue;

      // Lógica de filtro mais clara
      const isDirectDM = channelType === 'DM';
      const isGroupDM = channelType === 'GROUP_DM';
      const isGuildChannel = channelType.includes('GUILD_') || channelType === 'GUILD_TEXT';

      let shouldProcess = false;

      if (scopes.includes('dms') && isDirectDM) shouldProcess = true;
      if (scopes.includes('group_dms') && isGroupDM) shouldProcess = true;
      if (scopes.includes('guilds') && isGuildChannel) shouldProcess = true;

      if (!shouldProcess) continue;
      if (whitelist.includes(channelId)) {
        console.log(chalk.yellow(`⏭️ Ignorado pela whitelist: ${channelId}`));
        continue;
      }

      channelsToProcess.push({ folder, channelId, channelType: channelType });
    }

    if (channelsToProcess.length === 0) {
      console.log(chalk.yellow('\n⚠️ Nenhum canal corresponde aos tipos selecionados.'));
      await delay(2000);
      return;
    }

    console.log(chalk.magenta(`\n🎯 Iniciando limpeza de ${channelsToProcess.length} canais...\n`));

    const bulkStartTime = Date.now();
    let totalDeleted = 0;
    let processed = 0;

    for (let i = 0; i < channelsToProcess.length; i++) {
      const { folder, channelId, channelType } = channelsToProcess[i];
      const progress = Math.round(((i + 1) / channelsToProcess.length) * 100);

      process.stdout.write(
        `\r${chalk.cyanBright(`Progresso: ${progress}%`)} | ` +
        `${chalk.white(`Canal ${i+1}/${channelsToProcess.length}`)} | ` +
        `ID: ${chalk.yellow(channelId)}`
      );

      printChannelTracking(`Canal ${channelId} (${channelType})`);

      try {
        const channel = await fetchTextChannel(client, channelId);
        if (channel) {
          const messages = await collectOwnMessages(channel, client.user.id);
          if (messages.length > 0) {
            const result = await deleteMessages(messages);
            totalDeleted += result.count;
          } else {
            console.log(chalk.gray('   Nenhuma mensagem sua encontrada.'));
          }
        } else {
          printInvalidChannel();
        }
      } catch (error) {
        printChannelAccessError(error.message);
      }

      // Remove pasta já processada
      try {
        fs.rmSync(path.join(messagesPath, folder), { recursive: true, force: true });
      } catch (_) {}

      processed++;
      await delay(400);
    }

    process.stdout.write('\r' + ' '.repeat(100) + '\r');

    const totalDuration = formatDuration(Date.now() - bulkStartTime);

    console.log(chalk.greenBright.bold(`\n🎉 CL ALL FINALIZADO COM SUCESSO!`));
    console.log(chalk.greenBright(`   Total de mensagens eliminadas: ${totalDeleted}`));
    console.log(chalk.blueBright(`   Tempo total: ${totalDuration}`));
    console.log(chalk.gray(`   Canais processados: ${processed}`));

  } catch (error) {
    console.log(chalk.redBright('\n❌ Erro durante o processamento:'));
    console.error(error.message);
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  await delay(4000);
}
// ====================== FIM DO CL ALL ======================

async function runMainMenu(client) {
  while (true) {
    const option = await selectMenu({
      title: 'Menu Principal',
      subtitle: 'Use as setas para navegar e Enter para confirmar',
      options: [
        { label: 'CL - Limpeza em Canal Único', value: 'cl' },
        { label: 'CL ALL - Limpeza em Massa', value: 'cl_all' },
      ],
      initialIndex: 0,
      header: () => {
        printBanner();
        printAccessGranted(client.user.username);
      },
    });

    if (option === 'cl') {
      await runSingleChannelCleanup(client);
      continue;
    }

    if (option === 'cl_all') {
      await runGuildCleanup(client);
    }
  }
}

async function startApp() {
  clearConsole();
  printBanner();

  const login = await resolveLogin();
  await loadingScreen('Verificando token');

  const client = createClient();

  client.on('ready', async () => {
    if (login.shouldPersist) {
      const accountName = client.user.globalName || client.user.username;
      saveAccount(accountName, login.token);
    }
    await runMainMenu(client);
  });

  client.login(login.token).catch(async () => {
    printInvalidToken();
    await delay(2000);
  });
}

module.exports = {
  startApp,
};
