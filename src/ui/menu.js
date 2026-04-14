const readline = require('readline');
const chalk = require('chalk');

function renderMenu(title, subtitle, options, selectedIndex, header) {
  if (typeof header === 'function') {
    header();
  }

  console.log(chalk.cyanBright.bold(`\n${title}\n`));

  if (subtitle) {
    console.log(chalk.gray(`${subtitle}\n`));
  }

  options.forEach((option, index) => {
    const isSelected = index === selectedIndex;
    const prefix = isSelected ? chalk.greenBright('›') : chalk.gray(' ');
    const label = isSelected ? chalk.greenBright.bold(option.label) : chalk.white(option.label);
    console.log(`${prefix} ${label}`);
  });

  console.log(chalk.gray('\n↑ ↓ para navegar • Enter para confirmar'));
}

function renderMultiSelectMenu(title, subtitle, options, selectedIndex, selectedValues, header) {
  if (typeof header === 'function') {
    header();
  }

  console.log(chalk.cyanBright.bold(`\n${title}\n`));

  if (subtitle) {
    console.log(chalk.gray(`${subtitle}\n`));
  }

  options.forEach((option, index) => {
    const isActive = index === selectedIndex;
    const isMarked = selectedValues.has(option.value);
    const cursor = isActive ? chalk.greenBright('›') : chalk.gray(' ');
    const marker = isMarked ? chalk.greenBright('[x]') : chalk.gray('[ ]');
    const label = isActive ? chalk.greenBright.bold(option.label) : chalk.white(option.label);
    console.log(`${cursor} ${marker} ${label}`);
  });

  console.log(chalk.gray('\nEspaço marca/desmarca • Enter confirma'));
}

function selectMenu({ title, subtitle, options, initialIndex = 0, header }) {
  return new Promise((resolve) => {
    let selectedIndex = initialIndex;
    let cleanedUp = false;

    const redraw = () => {
      console.clear();
      renderMenu(title, subtitle, options, selectedIndex, header);
    };

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      process.stdin.removeListener('keypress', onKeyPress);
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };

    const onKeyPress = (_, key) => {
      if (!key) {
        return;
      }

      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        redraw();
        return;
      }

      if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % options.length;
        redraw();
        return;
      }

      if (key.name === 'return') {
        const selected = options[selectedIndex];
        cleanup();
        resolve(selected.value);
        return;
      }

      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }
    };

    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(true);
    }

    process.stdin.resume();
    process.stdin.on('keypress', onKeyPress);
    redraw();
  });
}

function selectMultiMenu({ title, subtitle, options, initialIndex = 0, header }) {
  return new Promise((resolve) => {
    let selectedIndex = initialIndex;
    let cleanedUp = false;
    const selectedValues = new Set();

    const redraw = () => {
      console.clear();
      renderMultiSelectMenu(title, subtitle, options, selectedIndex, selectedValues, header);
    };

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      process.stdin.removeListener('keypress', onKeyPress);
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };

    const onKeyPress = (_, key) => {
      if (!key) {
        return;
      }

      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        redraw();
        return;
      }

      if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % options.length;
        redraw();
        return;
      }

      if (key.name === 'space') {
        const option = options[selectedIndex];

        if (selectedValues.has(option.value)) {
          selectedValues.delete(option.value);
        } else {
          selectedValues.add(option.value);
        }

        redraw();
        return;
      }

      if (key.name === 'return') {
        cleanup();
        resolve(options.filter((option) => selectedValues.has(option.value)).map((option) => option.value));
        return;
      }

      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }
    };

    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(true);
    }

    process.stdin.resume();
    process.stdin.on('keypress', onKeyPress);
    redraw();
  });
}

module.exports = {
  selectMenu,
  selectMultiMenu,
};
