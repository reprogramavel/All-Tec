const chalk = require('chalk');
const { getTheme } = require('../services/themeStore');

const banner = `
 █████╗ ██╗     ██╗         ████████╗███████╗ ██████╗
██╔══██╗██║     ██║         ╚══██╔══╝██╔════╝██╔════╝
███████║██║     ██║            ██║   █████╗  ██║
██╔══██║██║     ██║            ██║   ██╔══╝  ██║
██║  ██║███████╗███████╗       ██║   ███████╗╚██████╗
╚═╝  ╚═╝╚══════╝╚══════╝       ╚═╝   ╚══════╝ ╚═════╝
`;

function clearConsole() {
  console.clear();
}

function printBanner() {
  const theme = getTheme();
  console.log(theme.banner(banner));
}

function printAccessGranted(username) {
  const theme = getTheme();
  console.log(
    theme.success(`\n   Acesso concedido: ${username} online e operacional.\n`)
  );
}

function printChannelTracking(channelName) {
  const theme = getTheme();
  console.log(
    theme.accent(`\n   Rastreando suas mensagens no canal: ${channelName}...\n`)
  );
}

function printGuildTracking(guildId, totalChannels) {
  const theme = getTheme();
  console.log(
    theme.accent(
      `\n   Rastreando suas mensagens no servidor ${guildId} em ${totalChannels} canais de texto...\n`
    )
  );
}

function printDeletedMessage(content) {
  console.log(chalk.white(`   ${chalk.bold(content || '[Mensagem sem texto]')}`));
}

function printDeletionProgress(count) {
  const theme = getTheme();
  console.log(theme.muted(`   Removida com sucesso... (${count})`));
}

function printDeletionSummary(count, channelName, duration) {
  const theme = getTheme();
  console.log(theme.success(`\n   ${count} mensagens eliminadas no canal: ${channelName}`));
  console.log(theme.info(`   Tempo total: ${duration}\n`));
}

function printGuildDeletionSummary(count, guildId, duration) {
  const theme = getTheme();
  console.log(theme.success(`\n   ${count} mensagens eliminadas no servidor: ${guildId}`));
  console.log(theme.info(`   Tempo total geral: ${duration}\n`));
}

function printInvalidChannel() {
  const theme = getTheme();
  console.log(theme.error('\n   O ID informado não é um canal de texto válido.'));
}

function printInvalidGuild() {
  const theme = getTheme();
  console.log(theme.error('\n   Não foi possível acessar esse servidor ou encontrar canais de texto.'));
}

function printChannelAccessError(message) {
  const theme = getTheme();
  const lowerMessage = String(message || '').toLowerCase();
  const userMessage = lowerMessage.includes('unknown channel')
    ? '\n   Canal não encontrado. Verifique se o ID está correto.'
    : '\n   Falha ao acessar o canal. Verifique se o ID está correto e se você tem acesso.';

  console.log(theme.error(userMessage));
  console.error(theme.muted(`   Detalhe: ${message}`));
}

function printInvalidToken() {
  const theme = getTheme();
  console.log(theme.error('\n   Token inválido ou acesso negado.'));
  console.log(theme.muted('   Verifique se o token está correto e tente novamente.'));
}

function askToken(rl, handler) {
  const theme = getTheme();
  // Esconder o input da token por segurança (como uma password) em qualquer plataforma
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    // Fechar o readline para não interferir com o raw mode
    rl.close();

    process.stdout.write(theme.title('\n   Insira sua token: '));
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    const prevEncoding = stdin.readableEncoding;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let token = '';
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw || false);
      if (prevEncoding) {
        stdin.setEncoding(prevEncoding);
      }
      stdin.pause();
    };

    const onData = (data) => {
      // Processar cada caractere individualmente (pode vir mais de 1 por evento)
      for (let i = 0; i < data.length; i++) {
        const char = data[i];

        // Enter - confirmar
        if (char === '\n' || char === '\r') {
          cleanup();
          process.stdout.write('\n');
          handler(token);
          return;
        }
        // Ctrl+C - sair
        if (char === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          process.exit(0);
        }
        // Ctrl+V (paste) - no Windows pode vir como \u0016, ignora o control char
        if (char === '\u0016') continue;
        // Backspace (Linux: \x7F, Windows: \x08)
        if (char === '\u007F' || char === '\b') {
          if (token.length > 0) {
            token = token.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        // Escape sequences (setas, etc.) - ignorar
        if (char === '\u001B') {
          // Consumir os próximos caracteres da sequência escape
          i += 2;
          continue;
        }
        // Ignorar outros caracteres de controle
        if (char.charCodeAt(0) < 32) continue;

        token += char;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
    return;
  }

  // Fallback para terminais sem suporte a raw mode (pipes, etc.)
  rl.question(theme.title('\n   Insira sua token: '), handler);
}

function askChannelId(rl, handler) {
  const theme = getTheme();
  rl.question(theme.info('\n   Digite o ID do canal para apagar suas mensagens: '), handler);
}

function askGuildId(rl, handler) {
  const theme = getTheme();
  rl.question(theme.info('\n   Digite o ID do servidor para apagar suas mensagens em todos os canais: '), handler);
}

function askWhitelist(rl, handler) {
  const theme = getTheme();
  rl.question(
    theme.info('\n   WhiteList (IDs separados por vírgula, ou vazio para incluir todos): '),
    handler
  );
}

function askFilter(rl, handler) {
  const theme = getTheme();
  rl.question(
    theme.info('\n   Filtro de conteúdo (palavra/frase para filtrar, ou vazio para todas): '),
    handler
  );
}

function askId(rl, handler) {
  const theme = getTheme();
  rl.question(
    theme.info('\n   Digite o ID: '),
    handler
  );
}

function askName(rl, handler) {
  const theme = getTheme();
  rl.question(
    theme.info('   Nome/Descrição (opcional): '),
    handler
  );
}

// ====================== NOVAS FUNÇÕES ======================

function printRateLimitStats(rateLimitManager) {
  const theme = getTheme();
  console.log(theme.info('\n   Estatísticas de Rate-Limit:'));
  console.log(rateLimitManager.getStatsText());
}

function printTokenSearchProgress(progress) {
  const theme = getTheme();
  process.stdout.write(
    `\r   ${theme.title(`[${progress.current}/${progress.total}]`)} ` +
    `Verificando ${theme.accent(progress.source)}... ` +
    `${theme.muted(progress.preview)}`
  );
}

function printTokenFound(tokenInfo) {
  const theme = getTheme();
  console.log(theme.success(`\n   Token válido selecionado!`));
  console.log(chalk.white(`   Utilizador: ${tokenInfo.globalName || tokenInfo.username}`));
  console.log(chalk.white(`   Fonte: ${tokenInfo.source}`));
  console.log(theme.muted(`   Token: ${tokenInfo.preview}`));
}

function printNoTokensFound() {
  const theme = getTheme();
  console.log(theme.accent('\n   Nenhum token válido encontrado.'));
  console.log(theme.muted('   Certifique-se que o Discord ou um navegador com login no Discord está instalado.'));
  console.log(theme.muted('   Nota: Tokens encriptados (navegadores Chromium novos) podem não ser detetados.'));
}

function printAccountDeleted(name) {
  const theme = getTheme();
  console.log(theme.success(`\n   Conta "${name}" removida com sucesso.`));
}

function printAccountInfo(account) {
  const theme = getTheme();
  console.log(theme.info('\n   Informações da Conta:'));
  console.log(chalk.white(`   Nome: ${account.name}`));
  console.log(chalk.white(`   Token: ${account.token.substring(0, 6)}${'*'.repeat(8)}${account.token.substring(account.token.length - 4)}`));
}

module.exports = {
  clearConsole,
  printBanner,
  printAccessGranted,
  printChannelTracking,
  printGuildTracking,
  printDeletedMessage,
  printDeletionProgress,
  printDeletionSummary,
  printGuildDeletionSummary,
  printInvalidChannel,
  printInvalidGuild,
  printChannelAccessError,
  printInvalidToken,
  askToken,
  askChannelId,
  askGuildId,
  askWhitelist,
  askFilter,
  askId,
  askName,
  // Novas funções
  printRateLimitStats,
  printTokenSearchProgress,
  printTokenFound,
  printNoTokensFound,
  printAccountDeleted,
  printAccountInfo,
};
