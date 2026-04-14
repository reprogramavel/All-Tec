const chalk = require('chalk');
const { delay } = require('../utils/time');

async function loadingScreen(text, dots = 3, interval = 500) {
  process.stdout.write(chalk.greenBright(`\n🔄 ${text}`));

  for (let index = 0; index < dots; index += 1) {
    await delay(interval);
    process.stdout.write(chalk.greenBright('.'));
  }

  console.log('');
}

module.exports = {
  loadingScreen,
};
