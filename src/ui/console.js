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
    chalk.greenBright.bold(`\n✅ Acesso concedido: ${username} online e operacional.\n`)
  );
}

function printChannelTracking(channelName) {
  console.log(
    chalk.magenta(`\n📡 Rastreando suas mensagens no canal: ${channelName}...\n`)
  );
}

function printGuildTracking(guildId, totalChannels) {
  console.log(
    chalk.magenta(
      `\n📡 Rastreando suas mensagens no servidor ${guildId} em ${totalChannels} canais de texto...\n`
    )
  );
}

function printDeletedMessage(content) {
  console.log(chalk.white(`💬 ${chalk.bold(content || '[Mensagem sem texto]')}`));
}

function printDeletionProgress(count) {
  console.log(chalk.gray(`🗑️ Removida com sucesso... (${count})`));
}

function printDeletionSummary(count, channelName, duration) {
  console.log(chalk.greenBright(`\n✔️ ${count} mensagens eliminadas no canal: ${channelName}`));
  console.log(chalk.blueBright(`⏱️ Tempo total: ${duration}\n`));
}

function printGuildDeletionSummary(count, guildId, duration) {
  console.log(chalk.greenBright(`\n✔️ ${count} mensagens eliminadas no servidor: ${guildId}`));
  console.log(chalk.blueBright(`⏱️ Tempo total geral: ${duration}\n`));
}

function printInvalidChannel() {
  console.log(chalk.redBright('\n🚫 O ID informado não é um canal de texto válido.'));
}

function printInvalidGuild() {
  console.log(chalk.redBright('\n🚫 Não foi possível acessar esse servidor ou encontrar canais de texto.'));
}

function printChannelAccessError(message) {
  const lowerMessage = String(message || '').toLowerCase();
  const userMessage = lowerMessage.includes('unknown channel')
    ? '\n🚫 Canal não encontrado. Verifique se o ID está correto.'
    : '\n🚫 Falha ao acessar o canal. Verifique se o ID está correto e se você tem acesso.';

  console.log(chalk.redBright(userMessage));
  console.error(message);
}

function printInvalidToken() {
  console.log(chalk.redBright.bold('\n❌ Token inválido ou acesso negado.'));
}

function askToken(rl, handler) {
  rl.question(chalk.yellow('\n🔐 Insira sua token: '), handler);
}

function askChannelId(rl, handler) {
  rl.question(chalk.blue('\n🎯 Digite o ID do canal para apagar suas mensagens: '), handler);
}

function askGuildId(rl, handler) {
  rl.question(chalk.blue('\n🎯 Digite o ID do servidor para apagar suas mensagens em todos os canais: '), handler);
}

function askWhitelist(rl, handler) {
  rl.question(
    chalk.blue('\n🛡️ WhiteList (IDs separados por vírgula, espaço ou vazio para incluir todos): '),
    handler
  );
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
};
