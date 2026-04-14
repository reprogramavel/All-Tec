// src/app.js - Versão com Rate-Limit Adaptativo, Busca de Token e Gestão de Contas

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
  printDeletionSummary,
  printInvalidChannel,
  printChannelAccessError,
  printInvalidToken,
  askToken,
  askChannelId,
  askWhitelist,
  askFilter,
  askId,
  askName,
  printRateLimitStats,
  printTokenSearchProgress,
  printTokenFound,
  printNoTokensFound,
  printAccountDeleted,
  printAccountInfo,
} = require('./ui/console');

const { loadingScreen } = require('./ui/loading');
const { selectMenu, selectMultiMenu } = require('./ui/menu');
const { readAccounts, saveAccount, deleteAccount } = require('./services/accountStore');
const {
  collectOwnMessages,
  fetchTextChannel,
} = require('./services/channelService');
const { RateLimitManager } = require('./services/rateLimitManager');
const { findAndValidateTokens } = require('./services/tokenFinder');
const {
  readBlacklists,
  addUserToBlacklist,
  removeUserFromBlacklist,
  isUserBlacklisted,
  addServerToBlacklist,
  removeServerFromBlacklist,
  isServerBlacklisted,
} = require('./services/blacklistStore');
const { getTheme, getThemeId, getAllThemes, saveTheme, THEMES } = require('./services/themeStore');

// Rate-limit manager global (partilhado entre todas as operações)
const rateLimitManager = new RateLimitManager();

function createClient() {
  return new Client();
}

// ====================== DELEÇÃO COM RATE-LIMIT ADAPTATIVO ======================
async function deleteMessages(messages) {
  const startTime = Date.now();
  let count = 0;
  const total = messages.length;

  if (total === 0) {
    return { count: 0, duration: formatDuration(0) };
  }

  console.log(chalk.gray(`\n   Iniciando deleção de ${total} mensagens (rate-limit adaptativo ativo)\n`));

  rateLimitManager.reset();

  for (const message of messages) {
    await message.delete().catch((err) => {
      // Se for erro 429 (rate-limit), ajusta o delay automaticamente
      if (err.httpStatus === 429 || err.status === 429) {
        const retryAfter = err.retryAfter || err.retry_after || 1000;
        rateLimitManager.onRateLimit({ timeout: retryAfter });
      }
    });

    count += 1;

    // Barra de progresso numa única linha (sobrescreve a mesma linha)
    const preview = (message.content || '[Sem texto]').substring(0, 30);
    rateLimitManager.printInlineStatus(count, total, preview);

    // Aguarda o delay adaptativo (ajustado automaticamente)
    await rateLimitManager.wait();
  }

  // Limpa a linha de progresso e avança
  process.stdout.write('\x1B[2K\r\n');

  const duration = formatDuration(Date.now() - startTime);

  // Mostra estatísticas do rate-limit
  printRateLimitStats(rateLimitManager);

  return { count, duration };
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

// ====================== BUSCA AUTOMÁTICA DE TOKEN ======================
async function runTokenSearch() {
  clearConsole();
  printBanner();
  console.log(chalk.cyanBright.bold('\n   Busca Automática de Token\n'));
  console.log(chalk.gray('   Procurando tokens do Discord nos navegadores e apps instalados...\n'));

  const tokens = await findAndValidateTokens((progress) => {
    printTokenSearchProgress(progress);
  });

  console.log(''); // Nova linha após progresso

  if (tokens.length === 0) {
    printNoTokensFound();
    await delay(3000);
    return null;
  }

  // Mostrar tokens encontrados
  console.log(chalk.greenBright.bold(`\n   ${tokens.length} token(s) válido(s) encontrado(s)!\n`));

  const options = tokens.map((t, i) => ({
    label: `${t.globalName || t.username} (${t.source}) - ${t.preview}`,
    value: String(i),
  }));
  options.push({ label: 'Cancelar', value: 'cancel' });

  const selected = await selectMenu({
    title: 'Tokens Encontrados',
    subtitle: 'Selecione um token para usar',
    options,
    header: () => printBanner(),
  });

  if (selected === 'cancel') return null;

  const chosen = tokens[Number(selected)];
  if (!chosen) return null;

  printTokenFound(chosen);
  return { token: chosen.token, shouldPersist: true };
}

// ====================== GESTÃO DE CONTAS ======================
async function runAccountManager() {
  while (true) {
    const accounts = readAccounts();

    if (accounts.length === 0) {
      console.log(chalk.yellow('\n   Nenhuma conta salva.'));
      await delay(1500);
      return;
    }

    const options = accounts.map((account, index) => ({
      label: `${account.name} - ${account.token.substring(0, 6)}****`,
      value: String(index),
    }));
    options.push({ label: 'Voltar', value: 'back' });

    const selected = await selectMenu({
      title: 'Gerir Contas Salvas',
      subtitle: 'Selecione uma conta para ver opções',
      options,
      header: () => printBanner(),
    });

    if (selected === 'back') return;

    const account = accounts[Number(selected)];
    if (!account) continue;

    const action = await selectMenu({
      title: `Conta: ${account.name}`,
      subtitle: 'O que deseja fazer com esta conta?',
      options: [
        { label: 'Ver informações', value: 'info' },
        { label: 'Apagar conta', value: 'delete' },
        { label: 'Voltar', value: 'back' },
      ],
      header: () => printBanner(),
    });

    if (action === 'back') continue;

    if (action === 'info') {
      printAccountInfo(account);
      await delay(3000);
    }

    if (action === 'delete') {
      const confirm = await selectMenu({
        title: 'Confirmar Exclusão',
        subtitle: `Tem certeza que deseja apagar a conta "${account.name}"?`,
        options: [
          { label: 'Sim, apagar', value: 'yes' },
          { label: 'Não, cancelar', value: 'no' },
        ],
        header: () => printBanner(),
      });

      if (confirm === 'yes') {
        deleteAccount(account.name);
        printAccountDeleted(account.name);
        await delay(1500);
      }
    }
  }
}

// ====================== SELEÇÃO DE CONTA SALVA ======================
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

// ====================== LOGIN ======================
async function resolveLogin() {
  while (true) {
    const accounts = readAccounts();
    const options = [];

    if (accounts.length > 0) options.push({ label: 'Logar com conta salva', value: 'saved' });
    options.push({ label: 'Inserir token manualmente', value: 'new' });
    options.push({ label: 'Buscar token automaticamente', value: 'auto' });
    if (accounts.length > 0) options.push({ label: 'Gerir contas salvas', value: 'manage' });

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

    if (action === 'auto') {
      const result = await runTokenSearch();
      if (!result) continue;
      return result;
    }

    if (action === 'manage') {
      await runAccountManager();
      continue;
    }
  }
}

// ====================== CL - LIMPEZA POR CANAL ======================
async function runSingleChannelCleanup(client) {
  while (true) {
    const action = await selectMenu({
      title: 'CL - Limpeza em Canal Único',
      subtitle: 'Apaga todas as suas mensagens num canal específico',
      options: [
        { label: 'Iniciar limpeza por canal', value: 'start' },
        { label: 'Voltar ao menu principal', value: 'back' },
      ],
      header: () => {
        printBanner();
        printAccessGranted(client.user.username);
      },
    });

    if (action === 'back') return;

    const channelId = await promptUser(askChannelId);
    const filter = (await promptUser(askFilter)).trim() || null;

    try {
      const channel = await fetchTextChannel(client, channelId);
      if (!channel) {
        printInvalidChannel();
        await delay(1500);
        continue;
      }

      printChannelTracking(channel.name || channelId);
      if (filter) {
        console.log(chalk.yellow(`   Filtro ativo: mensagens contendo "${filter}"\n`));
      }

      console.log(chalk.gray('   Coletando mensagens... (pode demorar em canais grandes)'));
      const messages = await collectOwnMessages(channel, client.user.id, filter);

      if (messages.length === 0) {
        console.log(chalk.yellow(`\n   Nenhuma mensagem sua encontrada neste canal${filter ? ` com o filtro "${filter}"` : ''}.`));
        await delay(2000);
        continue;
      }

      console.log(chalk.cyanBright(`\n   ${messages.length} mensagem(ns) encontrada(s). Iniciando deleção...\n`));

      const result = await deleteMessages(messages);
      printDeletionSummary(result.count, channel.name || channelId, result.duration);
    } catch (error) {
      printChannelAccessError(error.message);
    }

    await delay(1500);
  }
}

// ====================== CL ALL - LIMPEZA EM MASSA ======================
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

  if (scopes.length === 0) {
    console.log(chalk.yellow('\n   Nenhum escopo selecionado. Voltando...'));
    await delay(1500);
    return;
  }

  const whitelistInput = await promptUser(askWhitelist);
  const whitelist = whitelistInput
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean);

  console.log('\nConfiguração selecionada:');
  console.log(`Escopos: ${scopes.join(', ')}${selectedScopes.length === 0 ? ' (padrão: todos)' : ''}`);
  console.log(`WhiteList (${whitelist.length} IDs): ${whitelist.length > 0 ? whitelist.join(', ') : 'vazia'}`);
  const filter = (await promptUser(askFilter)).trim() || null;

  console.log(chalk.cyanBright('\n   Configuração selecionada:'));
  console.log(chalk.white(`   Escopos: ${scopes.join(', ')}`));
  console.log(chalk.white(`   WhiteList (${whitelist.length} IDs): ${whitelist.length > 0 ? whitelist.join(', ') : 'vazia'}`));
  if (filter) {
    console.log(chalk.white(`   Filtro: mensagens contendo "${filter}"`));
  }

  await delay(1800);

  const zipPath = path.resolve(process.cwd(), 'package.zip');
  if (!fs.existsSync(zipPath)) {
    console.log(chalk.redBright('\n   Arquivo package.zip não encontrado na raiz do projeto!'));
    console.log(chalk.gray('   Coloque o ficheiro exportado do Discord (package.zip) na pasta do projeto.'));
    await delay(3000);
    return;
  }

  console.log(chalk.cyanBright('\n   Extraindo package.zip...'));

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
      console.log(chalk.redBright('\n   Pasta "Mensagens" não encontrada dentro do ZIP.'));
      console.log(chalk.gray('   Certifique-se que o ZIP é um export válido do Discord.'));
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

      const isDirectDM = channelType === 'DM';
      const isGroupDM = channelType === 'GROUP_DM';
      const isGuildChannel = channelType.includes('GUILD_') || channelType === 'GUILD_TEXT';

      let shouldProcess = false;

      if (scopes.includes('dms') && isDirectDM) shouldProcess = true;
      if (scopes.includes('group_dms') && isGroupDM) shouldProcess = true;
      if (scopes.includes('guilds') && isGuildChannel) shouldProcess = true;

      if (!shouldProcess) continue;
      if (whitelist.includes(channelId)) {
        console.log(chalk.yellow(`   Ignorado pela whitelist: ${channelId}`));
        continue;
      }

      channelsToProcess.push({ folder, channelId, channelType });
    }

    if (channelsToProcess.length === 0) {
      console.log(chalk.yellow('\n   Nenhum canal corresponde aos tipos selecionados.'));
      await delay(2000);
      return;
    }

    console.log(chalk.magenta(`\n   Iniciando limpeza de ${channelsToProcess.length} canais...\n`));

    const bulkStartTime = Date.now();
    let totalDeleted = 0;
    let processed = 0;
    let channelsWithMessages = 0;

    for (let i = 0; i < channelsToProcess.length; i++) {
      const { folder, channelId, channelType } = channelsToProcess[i];
      const progress = Math.round(((i + 1) / channelsToProcess.length) * 100);

      console.log(
        chalk.cyanBright(`\n   [${progress}%] Canal ${i+1}/${channelsToProcess.length}`) +
        chalk.gray(` | ID: ${channelId} | Tipo: ${channelType}`)
      );

      try {
        const channel = await fetchTextChannel(client, channelId);
        if (channel) {
          const messages = await collectOwnMessages(channel, client.user.id, filter);
          if (messages.length > 0) {
            channelsWithMessages += 1;
            const result = await deleteMessages(messages);
            totalDeleted += result.count;
          } else {
            console.log(chalk.gray('   Nenhuma mensagem sua encontrada.'));
          }
        } else {
          console.log(chalk.gray('   Canal não acessível (pode ter sido apagado).'));
        }
      } catch (error) {
        printChannelAccessError(error.message);
      }

      // Remove pasta já processada
      try {
        fs.rmSync(path.join(messagesPath, folder), { recursive: true, force: true });
      } catch (_) {}

      processed++;
      await rateLimitManager.wait();
    }

    const totalDuration = formatDuration(Date.now() - bulkStartTime);

    console.log(chalk.greenBright.bold('\n   ========================================'));
    console.log(chalk.greenBright.bold('     CL ALL FINALIZADO COM SUCESSO!'));
    console.log(chalk.greenBright.bold('   ========================================'));
    console.log(chalk.greenBright(`   Total de mensagens eliminadas: ${totalDeleted}`));
    console.log(chalk.blueBright(`   Tempo total: ${totalDuration}`));
    console.log(chalk.gray(`   Canais processados: ${processed}`));
    console.log(chalk.gray(`   Canais com mensagens: ${channelsWithMessages}`));

  } catch (error) {
    console.log(chalk.redBright('\n   Erro durante o processamento:'));
    console.error(chalk.red(`   ${error.message}`));
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  await delay(4000);
}

// ====================== CL DMs - LIMPEZA EM DMs ABERTAS ======================
async function runOpenDmsCleanup(client) {
  while (true) {
    const action = await selectMenu({
      title: 'CL DMs - Limpeza em DMs Abertas',
      subtitle: 'Apaga suas mensagens nas DMs já abertas (não abre novas conversas)',
      options: [
        { label: 'Iniciar limpeza nas DMs abertas', value: 'start' },
        { label: 'Voltar ao menu principal', value: 'back' },
      ],
      header: () => {
        printBanner();
        printAccessGranted(client.user.username);
      },
    });

    if (action === 'back') return;

    const filter = (await promptUser(askFilter)).trim() || null;

    // Usa apenas DMs já em cache (abertas) — não faz fetch de novas
    const openDms = client.channels.cache.filter(c => c.type === 'DM');

    if (openDms.size === 0) {
      console.log(chalk.yellow('\n   Nenhuma DM aberta encontrada no cache.'));
      console.log(chalk.gray('   Apenas DMs já abertas/recentes são listadas para não arriscar bloqueio.'));
      await delay(2000);
      continue;
    }

    console.log(chalk.magenta(`\n   ${openDms.size} DM(s) aberta(s) encontrada(s). Iniciando limpeza...\n`));
    if (filter) {
      console.log(chalk.yellow(`   Filtro ativo: mensagens contendo "${filter}"\n`));
    }

    const bulkStartTime = Date.now();
    let totalDeleted = 0;
    let processed = 0;
    let dmsWithMessages = 0;
    const dmArray = [...openDms.values()];

    for (let i = 0; i < dmArray.length; i++) {
      const dm = dmArray[i];
      const recipient = dm.recipient ? dm.recipient.tag : dm.id;
      const recipientId = dm.recipient ? dm.recipient.id : null;
      const progress = Math.round(((i + 1) / dmArray.length) * 100);

      if (recipientId && isUserBlacklisted(recipientId)) {
        console.log(
          chalk.yellow(`\n   [${progress}%] DM ${i + 1}/${dmArray.length}`) +
          chalk.gray(` | ${recipient} — protegido pela blacklist`)
        );
        processed++;
        continue;
      }

      console.log(
        chalk.cyanBright(`\n   [${progress}%] DM ${i + 1}/${dmArray.length}`) +
        chalk.gray(` | ${recipient}`)
      );

      try {
        const messages = await collectOwnMessages(dm, client.user.id, filter);
        if (messages.length > 0) {
          dmsWithMessages += 1;
          const result = await deleteMessages(messages);
          totalDeleted += result.count;
        } else {
          console.log(chalk.gray('   Nenhuma mensagem sua encontrada.'));
        }
      } catch (error) {
        console.log(chalk.gray(`   Erro ao acessar DM: ${error.message}`));
      }

      processed++;
      await rateLimitManager.wait();
    }

    const totalDuration = formatDuration(Date.now() - bulkStartTime);

    console.log(chalk.greenBright.bold('\n   ========================================'));
    console.log(chalk.greenBright.bold('     CL DMs FINALIZADO COM SUCESSO!'));
    console.log(chalk.greenBright.bold('   ========================================'));
    console.log(chalk.greenBright(`   Total de mensagens eliminadas: ${totalDeleted}`));
    console.log(chalk.blueBright(`   Tempo total: ${totalDuration}`));
    console.log(chalk.gray(`   DMs processadas: ${processed}`));
    console.log(chalk.gray(`   DMs com mensagens: ${dmsWithMessages}`));

    await delay(4000);
  }
}

// ====================== INFO DA CONTA ======================
async function runAccountInfo(client) {
  clearConsole();
  printBanner();
  printAccessGranted(client.user.username);

  console.log(chalk.cyanBright.bold('   Informações da Conta Logada\n'));
  console.log(chalk.white(`   Nome de Utilizador: ${client.user.username}`));
  console.log(chalk.white(`   Nome Global: ${client.user.globalName || 'N/A'}`));
  console.log(chalk.white(`   ID: ${client.user.id}`));
  console.log(chalk.white(`   Tag: ${client.user.tag}`));
  console.log(chalk.white(`   Criado em: ${client.user.createdAt.toLocaleDateString('pt-BR')}`));
  console.log(chalk.white(`   Servidores: ${client.guilds.cache.size}`));
  console.log(chalk.white(`   DMs em cache: ${client.channels.cache.filter(c => c.type === 'DM').size}`));

  await delay(5000);
}

// ====================== CONFIGURAÇÕES - BLACKLISTS ======================
async function runBlacklistUsers() {
  while (true) {
    const data = readBlacklists();
    const options = [
      { label: 'Adicionar utilizador à blacklist', value: 'add' },
    ];

    if (data.users.length > 0) {
      options.push({ label: 'Remover utilizador da blacklist', value: 'remove' });
      options.push({ label: `Ver blacklist (${data.users.length} utilizadores)`, value: 'view' });
    }
    options.push({ label: 'Voltar', value: 'back' });

    const action = await selectMenu({
      title: 'Blacklist de Utilizadores',
      subtitle: 'Utilizadores protegidos contra remoção de amizade e CL em DMs',
      options,
      header: () => printBanner(),
    });

    if (action === 'back') return;

    if (action === 'add') {
      const id = (await promptUser(askId)).trim();
      if (!id) continue;
      const name = (await promptUser(askName)).trim() || id;
      if (addUserToBlacklist(id, name)) {
        console.log(chalk.greenBright(`\n   Utilizador "${name}" (${id}) adicionado à blacklist.`));
      } else {
        console.log(chalk.yellow(`\n   Utilizador ${id} já está na blacklist.`));
      }
      await delay(1500);
    }

    if (action === 'remove') {
      const current = readBlacklists();
      const removeOptions = current.users.map(u => ({
        label: `${u.name} (${u.id})`,
        value: u.id,
      }));
      removeOptions.push({ label: 'Cancelar', value: 'cancel' });

      const toRemove = await selectMenu({
        title: 'Remover da Blacklist',
        subtitle: 'Selecione o utilizador para remover',
        options: removeOptions,
        header: () => printBanner(),
      });

      if (toRemove !== 'cancel') {
        removeUserFromBlacklist(toRemove);
        console.log(chalk.greenBright(`\n   Utilizador ${toRemove} removido da blacklist.`));
        await delay(1500);
      }
    }

    if (action === 'view') {
      clearConsole();
      printBanner();
      const current = readBlacklists();
      console.log(chalk.cyanBright.bold('\n   Blacklist de Utilizadores\n'));
      current.users.forEach((u, i) => {
        console.log(chalk.white(`   ${i + 1}. ${u.name} — ${chalk.gray(u.id)}`));
      });
      await delay(3000);
    }
  }
}

async function runBlacklistServers() {
  while (true) {
    const data = readBlacklists();
    const options = [
      { label: 'Adicionar servidor à blacklist', value: 'add' },
    ];

    if (data.servers.length > 0) {
      options.push({ label: 'Remover servidor da blacklist', value: 'remove' });
      options.push({ label: `Ver blacklist (${data.servers.length} servidores)`, value: 'view' });
    }
    options.push({ label: 'Voltar', value: 'back' });

    const action = await selectMenu({
      title: 'Blacklist de Servidores',
      subtitle: 'Servidores protegidos contra saída em massa',
      options,
      header: () => printBanner(),
    });

    if (action === 'back') return;

    if (action === 'add') {
      const id = (await promptUser(askId)).trim();
      if (!id) continue;
      const name = (await promptUser(askName)).trim() || id;
      if (addServerToBlacklist(id, name)) {
        console.log(chalk.greenBright(`\n   Servidor "${name}" (${id}) adicionado à blacklist.`));
      } else {
        console.log(chalk.yellow(`\n   Servidor ${id} já está na blacklist.`));
      }
      await delay(1500);
    }

    if (action === 'remove') {
      const current = readBlacklists();
      const removeOptions = current.servers.map(s => ({
        label: `${s.name} (${s.id})`,
        value: s.id,
      }));
      removeOptions.push({ label: 'Cancelar', value: 'cancel' });

      const toRemove = await selectMenu({
        title: 'Remover da Blacklist',
        subtitle: 'Selecione o servidor para remover',
        options: removeOptions,
        header: () => printBanner(),
      });

      if (toRemove !== 'cancel') {
        removeServerFromBlacklist(toRemove);
        console.log(chalk.greenBright(`\n   Servidor ${toRemove} removido da blacklist.`));
        await delay(1500);
      }
    }

    if (action === 'view') {
      clearConsole();
      printBanner();
      const current = readBlacklists();
      console.log(chalk.cyanBright.bold('\n   Blacklist de Servidores\n'));
      current.servers.forEach((s, i) => {
        console.log(chalk.white(`   ${i + 1}. ${s.name} — ${chalk.gray(s.id)}`));
      });
      await delay(3000);
    }
  }
}

async function runViewBlacklists() {
  clearConsole();
  printBanner();
  const data = readBlacklists();

  console.log(chalk.cyanBright.bold('\n   Blacklists Atuais\n'));

  console.log(chalk.yellow.bold(`   Utilizadores (${data.users.length}):`));
  if (data.users.length === 0) {
    console.log(chalk.gray('   Nenhum utilizador na blacklist.\n'));
  } else {
    data.users.forEach((u, i) => {
      console.log(chalk.white(`   ${i + 1}. ${u.name} — ${chalk.gray(u.id)}`));
    });
    console.log('');
  }

  console.log(chalk.yellow.bold(`   Servidores (${data.servers.length}):`));
  if (data.servers.length === 0) {
    console.log(chalk.gray('   Nenhum servidor na blacklist.'));
  } else {
    data.servers.forEach((s, i) => {
      console.log(chalk.white(`   ${i + 1}. ${s.name} — ${chalk.gray(s.id)}`));
    });
  }

  await delay(4000);
}

// ====================== SELETOR DE TEMAS ======================
async function runThemeSelector(client) {
  const themes = getAllThemes();
  const currentThemeId = getThemeId();

  const options = Object.entries(themes).map(([id, theme]) => {
    const active = id === currentThemeId ? ' (ativo)' : '';
    return {
      label: `${theme.name} — ${theme.description}${active}`,
      value: id,
    };
  });
  options.push({ label: 'Voltar', value: 'back' });

  const selected = await selectMenu({
    title: 'Temas',
    subtitle: 'Escolha um tema para personalizar as cores do All-TEC',
    options,
    header: () => {
      printBanner();
      printAccessGranted(client.user.username);
    },
  });

  if (selected === 'back') return;

  saveTheme(selected);
  const newTheme = themes[selected];
  clearConsole();
  printBanner();
  console.log(newTheme.banner(`\n   Tema "${newTheme.name}" aplicado com sucesso!\n`));
  await delay(2000);
}

// ====================== CONFIGURAÇÕES ======================
async function runSettings(client) {
  while (true) {
    const currentTheme = THEMES[getThemeId()];
    const option = await selectMenu({
      title: 'Configurações',
      subtitle: `Gerir blacklists e personalização • Tema: ${currentTheme.name}`,
      options: [
        { label: 'Blacklist de Utilizadores', value: 'bl_users' },
        { label: 'Blacklist de Servidores', value: 'bl_servers' },
        { label: 'Ver todas as Blacklists', value: 'bl_view' },
        { label: `Temas (atual: ${currentTheme.name})`, value: 'themes' },
        { label: 'Voltar', value: 'back' },
      ],
      header: () => {
        printBanner();
        printAccessGranted(client.user.username);
      },
    });

    if (option === 'back') return;

    if (option === 'bl_users') {
      await runBlacklistUsers();
      continue;
    }

    if (option === 'bl_servers') {
      await runBlacklistServers();
      continue;
    }

    if (option === 'bl_view') {
      await runViewBlacklists();
      continue;
    }

    if (option === 'themes') {
      await runThemeSelector(client);
      continue;
    }
  }
}

// ====================== REMOVER TODAS AS AMIZADES ======================
async function runRemoveAllFriends(client) {
  const friends = client.relationships.cache.filter(r => r.type === 1);

  if (friends.size === 0) {
    console.log(chalk.yellow('\n   Nenhum amigo encontrado na conta.'));
    await delay(2000);
    return;
  }

  const blacklisted = friends.filter(r => isUserBlacklisted(r.userId));
  const toRemove = friends.filter(r => !isUserBlacklisted(r.userId));

  console.log(chalk.cyanBright(`\n   Amigos encontrados: ${friends.size}`));
  console.log(chalk.green(`   Protegidos pela blacklist: ${blacklisted.size}`));
  console.log(chalk.red(`   A remover: ${toRemove.size}\n`));

  if (toRemove.size === 0) {
    console.log(chalk.yellow('   Todos os amigos estão na blacklist. Nada a fazer.'));
    await delay(2000);
    return;
  }

  const confirm = await selectMenu({
    title: 'Confirmar Remoção de Amizades',
    subtitle: `Tem certeza que deseja remover ${toRemove.size} amizade(s)? (${blacklisted.size} protegido(s) pela blacklist)`,
    options: [
      { label: 'Sim, remover todas', value: 'yes' },
      { label: 'Não, cancelar', value: 'no' },
    ],
    header: () => printBanner(),
  });

  if (confirm !== 'yes') return;

  const startTime = Date.now();
  let removed = 0;
  let errors = 0;
  const friendArray = [...toRemove.values()];

  rateLimitManager.reset();

  for (let i = 0; i < friendArray.length; i++) {
    const rel = friendArray[i];
    const user = client.users.cache.get(rel.userId);
    const tag = user ? user.tag : rel.userId;

    try {
      await client.relationships.deleteRelationship(rel.userId);
      removed++;
    } catch (err) {
      if (err.httpStatus === 429 || err.status === 429) {
        const retryAfter = err.retryAfter || err.retry_after || 2000;
        rateLimitManager.onRateLimit({ timeout: retryAfter });
        await rateLimitManager.wait();
        // Retry once after rate-limit
        try {
          await client.relationships.deleteRelationship(rel.userId);
          removed++;
        } catch (_) {
          errors++;
        }
      } else {
        errors++;
      }
    }

    rateLimitManager.printInlineStatus(i + 1, friendArray.length);
    await rateLimitManager.wait();
  }

  process.stdout.write('\x1B[2K\r\n');

  const duration = formatDuration(Date.now() - startTime);

  console.log(chalk.greenBright.bold('\n   ========================================'));
  console.log(chalk.greenBright.bold('     REMOÇÃO DE AMIZADES CONCLUÍDA!'));
  console.log(chalk.greenBright.bold('   ========================================'));
  console.log(chalk.greenBright(`   Amizades removidas: ${removed}`));
  if (errors > 0) console.log(chalk.red(`   Erros: ${errors}`));
  console.log(chalk.gray(`   Protegidos (blacklist): ${blacklisted.size}`));
  console.log(chalk.blueBright(`   Tempo total: ${duration}`));

  await delay(4000);
}

// ====================== SAIR DE TODOS OS SERVIDORES ======================
async function runLeaveAllServers(client) {
  const guilds = client.guilds.cache;

  if (guilds.size === 0) {
    console.log(chalk.yellow('\n   Nenhum servidor encontrado.'));
    await delay(2000);
    return;
  }

  const blacklisted = guilds.filter(g => isServerBlacklisted(g.id));
  const toLeave = guilds.filter(g => !isServerBlacklisted(g.id));

  console.log(chalk.cyanBright(`\n   Servidores encontrados: ${guilds.size}`));
  console.log(chalk.green(`   Protegidos pela blacklist: ${blacklisted.size}`));
  console.log(chalk.red(`   A sair: ${toLeave.size}\n`));

  if (toLeave.size === 0) {
    console.log(chalk.yellow('   Todos os servidores estão na blacklist. Nada a fazer.'));
    await delay(2000);
    return;
  }

  const confirm = await selectMenu({
    title: 'Confirmar Saída de Servidores',
    subtitle: `Tem certeza que deseja sair de ${toLeave.size} servidor(es)? (${blacklisted.size} protegido(s) pela blacklist)`,
    options: [
      { label: 'Sim, sair de todos', value: 'yes' },
      { label: 'Não, cancelar', value: 'no' },
    ],
    header: () => printBanner(),
  });

  if (confirm !== 'yes') return;

  const startTime = Date.now();
  let left = 0;
  let errors = 0;
  const guildArray = [...toLeave.values()];

  rateLimitManager.reset();

  for (let i = 0; i < guildArray.length; i++) {
    const guild = guildArray[i];

    try {
      await guild.leave();
      left++;
    } catch (err) {
      if (err.httpStatus === 429 || err.status === 429) {
        const retryAfter = err.retryAfter || err.retry_after || 2000;
        rateLimitManager.onRateLimit({ timeout: retryAfter });
        await rateLimitManager.wait();
        try {
          await guild.leave();
          left++;
        } catch (_) {
          errors++;
        }
      } else {
        errors++;
      }
    }

    rateLimitManager.printInlineStatus(i + 1, guildArray.length);
    await rateLimitManager.wait();
  }

  process.stdout.write('\x1B[2K\r\n');

  const duration = formatDuration(Date.now() - startTime);

  console.log(chalk.greenBright.bold('\n   ========================================'));
  console.log(chalk.greenBright.bold('     SAÍDA DE SERVIDORES CONCLUÍDA!'));
  console.log(chalk.greenBright.bold('   ========================================'));
  console.log(chalk.greenBright(`   Servidores abandonados: ${left}`));
  if (errors > 0) console.log(chalk.red(`   Erros: ${errors}`));
  console.log(chalk.gray(`   Protegidos (blacklist): ${blacklisted.size}`));
  console.log(chalk.blueBright(`   Tempo total: ${duration}`));

  await delay(4000);
}

// ====================== MENU PRINCIPAL ======================
async function runMainMenu(client) {
  while (true) {
    const option = await selectMenu({
      title: 'Menu Principal',
      subtitle: 'Use as setas para navegar e Enter para confirmar',
      options: [
        { label: 'CL - Limpeza em Canal Único', value: 'cl' },
        { label: 'CL ALL - Limpeza em Massa (via package.zip)', value: 'cl_all' },
        { label: 'CL DMs - Limpeza em DMs Abertas', value: 'cl_dms' },
        { label: 'Remover todas as amizades', value: 'remove_friends' },
        { label: 'Sair de todos os servidores', value: 'leave_servers' },
        { label: 'Info - Ver informações da conta', value: 'info' },
        { label: 'Configurações', value: 'settings' },
        { label: 'Contas - Gerir contas salvas', value: 'accounts' },
        { label: 'Sair', value: 'exit' },
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
      continue;
    }

    if (option === 'cl_dms') {
      await runOpenDmsCleanup(client);
      continue;
    }

    if (option === 'remove_friends') {
      await runRemoveAllFriends(client);
      continue;
    }

    if (option === 'leave_servers') {
      await runLeaveAllServers(client);
      continue;
    }

    if (option === 'info') {
      await runAccountInfo(client);
      continue;
    }

    if (option === 'settings') {
      await runSettings(client);
      continue;
    }

    if (option === 'accounts') {
      await runAccountManager();
      continue;
    }

    if (option === 'exit') {
      console.log(chalk.gray('\n   Encerrando All-TEC...'));
      process.exit(0);
    }
  }
}

// ====================== INICIALIZAÇÃO ======================
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
    // Reinicia a app após token inválido
    await startApp();
  });
}

module.exports = {
  startApp,
};

