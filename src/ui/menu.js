const readline = require('readline');
const chalk = require('chalk');
const { getTheme } = require('../services/themeStore');

function renderMenu(title, subtitle, options, selectedIndex, header) {
  const theme = getTheme();

  if (typeof header === 'function') {
    header();
  }

  console.log(theme.title(`\n${title}\n`));

  if (subtitle) {
    console.log(theme.muted(`${subtitle}\n`));
  }

  options.forEach((option, index) => {
    const isSelected = index === selectedIndex;
    const prefix = isSelected ? theme.selected('›') : theme.muted(' ');
    const label = isSelected ? theme.selected(option.label) : chalk.white(option.label);
    console.log(`${prefix} ${label}`);
  });

  console.log(theme.muted('\n↑ ↓ para navegar • Enter para confirmar'));
}

function renderMultiSelectMenu(title, subtitle, options, selectedIndex, selectedValues, header) {
  const theme = getTheme();

  if (typeof header === 'function') {
    header();
  }

  console.log(theme.title(`\n${title}\n`));

  if (subtitle) {
    console.log(theme.muted(`${subtitle}\n`));
  }

  options.forEach((option, index) => {
    const isActive = index === selectedIndex;
    const isMarked = selectedValues.has(option.value);
    const cursor = isActive ? theme.selected('›') : theme.muted(' ');
    const marker = isMarked ? theme.selected('[x]') : theme.muted('[ ]');
    const label = isActive ? theme.selected(option.label) : chalk.white(option.label);
    console.log(`${cursor} ${marker} ${label}`);
  });

  console.log(theme.muted('\nEspaço marca/desmarca • Enter confirma'));
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
