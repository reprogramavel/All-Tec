const chalk = require('chalk');

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
  console.log(chalk.green.bold(banner));
}

function printAccessGranted(username) {
  console.log(
    chalk.greenBright.bold(`\n   Acesso concedido: ${username} online e operacional.\n`)
  );
}

function printChannelTracking(channelName) {
  console.log(
    chalk.magenta(`\n   Rastreando suas mensagens no canal: ${channelName}...\n`)
  );
}

function printGuildTracking(guildId, totalChannels) {
  console.log(
    chalk.magenta(
      `\n   Rastreando suas mensagens no servidor ${guildId} em ${totalChannels} canais de texto...\n`
    )
  );
}

function printDeletedMessage(content) {
  console.log(chalk.white(`   ${chalk.bold(content || '[Mensagem sem texto]')}`));
}

function printDeletionProgress(count) {
  console.log(chalk.gray(`   Removida com sucesso... (${count})`));
}

function printDeletionSummary(count, channelName, duration) {
  console.log(chalk.greenBright(`\n   ${count} mensagens eliminadas no canal: ${channelName}`));
  console.log(chalk.blueBright(`   Tempo total: ${duration}\n`));
}

function printGuildDeletionSummary(count, guildId, duration) {
  console.log(chalk.greenBright(`\n   ${count} mensagens eliminadas no servidor: ${guildId}`));
  console.log(chalk.blueBright(`   Tempo total geral: ${duration}\n`));
}

function printInvalidChannel() {
  console.log(chalk.redBright('\n   O ID informado não é um canal de texto válido.'));
}

function printInvalidGuild() {
  console.log(chalk.redBright('\n   Não foi possível acessar esse servidor ou encontrar canais de texto.'));
}

function printChannelAccessError(message) {
  const lowerMessage = String(message || '').toLowerCase();
  const userMessage = lowerMessage.includes('unknown channel')
    ? '\n   Canal não encontrado. Verifique se o ID está correto.'
    : '\n   Falha ao acessar o canal. Verifique se o ID está correto e se você tem acesso.';

  console.log(chalk.redBright(userMessage));
  console.error(chalk.gray(`   Detalhe: ${message}`));
}

function printInvalidToken() {
  console.log(chalk.redBright.bold('\n   Token inválido ou acesso negado.'));
  console.log(chalk.gray('   Verifique se o token está correto e tente novamente.'));
}

function askToken(rl, handler) {
  rl.question(chalk.yellow('\n   Insira sua token: '), handler);
}

function askChannelId(rl, handler) {
  rl.question(chalk.blue('\n   Digite o ID do canal para apagar suas mensagens: '), handler);
}

function askGuildId(rl, handler) {
  rl.question(chalk.blue('\n   Digite o ID do servidor para apagar suas mensagens em todos os canais: '), handler);
}

function askWhitelist(rl, handler) {
  rl.question(
    chalk.blue('\n   WhiteList (IDs separados por vírgula, ou vazio para incluir todos): '),
    handler
  );
}

function askFilter(rl, handler) {
  rl.question(
    chalk.blue('\n   Filtro de conteúdo (palavra/frase para filtrar, ou vazio para todas): '),
    handler
  );
}

function askId(rl, handler) {
  rl.question(
    chalk.blue('\n   Digite o ID: '),
    handler
  );
}

function askName(rl, handler) {
  rl.question(
    chalk.blue('   Nome/Descrição (opcional): '),
    handler
  );
}

// ====================== NOVAS FUNÇÕES ======================

function printRateLimitStats(rateLimitManager) {
  console.log(chalk.cyanBright('\n   Estatísticas de Rate-Limit:'));
  console.log(rateLimitManager.getStatsText());
}

function printTokenSearchProgress(progress) {
  process.stdout.write(
    `\r   ${chalk.cyanBright(`[${progress.current}/${progress.total}]`)} ` +
    `Verificando ${chalk.yellow(progress.source)}... ` +
    `${chalk.gray(progress.preview)}`
  );
}

function printTokenFound(tokenInfo) {
  console.log(chalk.greenBright.bold(`\n   Token válido selecionado!`));
  console.log(chalk.white(`   Utilizador: ${tokenInfo.globalName || tokenInfo.username}`));
  console.log(chalk.white(`   Fonte: ${tokenInfo.source}`));
  console.log(chalk.gray(`   Token: ${tokenInfo.preview}`));
}

function printNoTokensFound() {
  console.log(chalk.yellow('\n   Nenhum token válido encontrado.'));
  console.log(chalk.gray('   Certifique-se que o Discord ou um navegador com login no Discord está instalado.'));
  console.log(chalk.gray('   Nota: Tokens encriptados (navegadores Chromium novos) podem não ser detetados.'));
}

function printAccountDeleted(name) {
  console.log(chalk.greenBright(`\n   Conta "${name}" removida com sucesso.`));
}

function printAccountInfo(account) {
  console.log(chalk.cyanBright('\n   Informações da Conta:'));
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
