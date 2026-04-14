// src/services/themeStore.js - Sistema de temas visuais do All-TEC
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const THEME_FILE = path.join(DATA_DIR, 'theme.json');

// ====================== DEFINIÇÃO DOS 10 TEMAS ======================

const THEMES = {
  emerald: {
    name: 'Esmeralda',
    description: 'Verde esmeralda classico',
    banner: chalk.hex('#50C878').bold,
    title: chalk.hex('#2ECC71').bold,
    subtitle: chalk.hex('#A9DFBF'),
    accent: chalk.hex('#27AE60'),
    success: chalk.hex('#2ECC71').bold,
    error: chalk.hex('#E74C3C').bold,
    info: chalk.hex('#76D7C4'),
    muted: chalk.hex('#7F8C8D'),
    highlight: chalk.hex('#1ABC9C').bold,
    selected: chalk.hex('#2ECC71').bold,
  },
  ocean: {
    name: 'Oceano',
    description: 'Azul profundo do oceano',
    banner: chalk.hex('#0077B6').bold,
    title: chalk.hex('#00B4D8').bold,
    subtitle: chalk.hex('#90E0EF'),
    accent: chalk.hex('#0096C7'),
    success: chalk.hex('#48CAE4').bold,
    error: chalk.hex('#E63946').bold,
    info: chalk.hex('#CAF0F8'),
    muted: chalk.hex('#6C757D'),
    highlight: chalk.hex('#00B4D8').bold,
    selected: chalk.hex('#48CAE4').bold,
  },
  sunset: {
    name: 'Pôr do Sol',
    description: 'Tons quentes de laranja e rosa',
    banner: chalk.hex('#FF6B35').bold,
    title: chalk.hex('#FF8C61').bold,
    subtitle: chalk.hex('#FFBE98'),
    accent: chalk.hex('#F4845F'),
    success: chalk.hex('#FFB347').bold,
    error: chalk.hex('#D62828').bold,
    info: chalk.hex('#FFC89A'),
    muted: chalk.hex('#A0816C'),
    highlight: chalk.hex('#FF6B35').bold,
    selected: chalk.hex('#FF8C61').bold,
  },
  sakura: {
    name: 'Sakura',
    description: 'Rosa suave inspirado em cerejeiras',
    banner: chalk.hex('#FF69B4').bold,
    title: chalk.hex('#FF85C8').bold,
    subtitle: chalk.hex('#FFB6D9'),
    accent: chalk.hex('#FF1493'),
    success: chalk.hex('#FF69B4').bold,
    error: chalk.hex('#DC143C').bold,
    info: chalk.hex('#FFC0CB'),
    muted: chalk.hex('#C9A0A0'),
    highlight: chalk.hex('#FF1493').bold,
    selected: chalk.hex('#FF69B4').bold,
  },
  lavender: {
    name: 'Lavanda',
    description: 'Roxo elegante e relaxante',
    banner: chalk.hex('#9B59B6').bold,
    title: chalk.hex('#BB8FCE').bold,
    subtitle: chalk.hex('#D7BDE2'),
    accent: chalk.hex('#8E44AD'),
    success: chalk.hex('#AF7AC5').bold,
    error: chalk.hex('#E74C3C').bold,
    info: chalk.hex('#D2B4DE'),
    muted: chalk.hex('#8E8E8E'),
    highlight: chalk.hex('#9B59B6').bold,
    selected: chalk.hex('#BB8FCE').bold,
  },
  arctic: {
    name: 'Artico',
    description: 'Branco gelado com azul cristalino',
    banner: chalk.hex('#E0FBFC').bold,
    title: chalk.hex('#98C1D9').bold,
    subtitle: chalk.hex('#C1DFF0'),
    accent: chalk.hex('#3D5A80'),
    success: chalk.hex('#98C1D9').bold,
    error: chalk.hex('#EE6C4D').bold,
    info: chalk.hex('#E0FBFC'),
    muted: chalk.hex('#8B9DAF'),
    highlight: chalk.hex('#3D5A80').bold,
    selected: chalk.hex('#98C1D9').bold,
  },
  crimson: {
    name: 'Carmesim',
    description: 'Vermelho intenso e poderoso',
    banner: chalk.hex('#DC143C').bold,
    title: chalk.hex('#FF4D6D').bold,
    subtitle: chalk.hex('#FF758F'),
    accent: chalk.hex('#C9184A'),
    success: chalk.hex('#FF4D6D').bold,
    error: chalk.hex('#A4133C').bold,
    info: chalk.hex('#FFB3C1'),
    muted: chalk.hex('#9E8A8A'),
    highlight: chalk.hex('#FF0A54').bold,
    selected: chalk.hex('#FF4D6D').bold,
  },
  golden: {
    name: 'Dourado',
    description: 'Ouro reluzente com tons ambar',
    banner: chalk.hex('#FFD700').bold,
    title: chalk.hex('#FFC300').bold,
    subtitle: chalk.hex('#FFE066'),
    accent: chalk.hex('#DAA520'),
    success: chalk.hex('#F4D03F').bold,
    error: chalk.hex('#E74C3C').bold,
    info: chalk.hex('#FEF9E7'),
    muted: chalk.hex('#B7A57A'),
    highlight: chalk.hex('#FFD700').bold,
    selected: chalk.hex('#FFC300').bold,
  },
  neon: {
    name: 'Neon',
    description: 'Cores vibrantes cyberpunk',
    banner: chalk.hex('#39FF14').bold,
    title: chalk.hex('#00F0FF').bold,
    subtitle: chalk.hex('#BF00FF'),
    accent: chalk.hex('#FF003C'),
    success: chalk.hex('#39FF14').bold,
    error: chalk.hex('#FF003C').bold,
    info: chalk.hex('#00F0FF'),
    muted: chalk.hex('#8888AA'),
    highlight: chalk.hex('#BF00FF').bold,
    selected: chalk.hex('#39FF14').bold,
  },
  midnight: {
    name: 'Meia-Noite',
    description: 'Azul escuro misterioso e sofisticado',
    banner: chalk.hex('#7B68EE').bold,
    title: chalk.hex('#9370DB').bold,
    subtitle: chalk.hex('#B0A4E3'),
    accent: chalk.hex('#6A5ACD'),
    success: chalk.hex('#7B68EE').bold,
    error: chalk.hex('#FF6347').bold,
    info: chalk.hex('#CBC3E3'),
    muted: chalk.hex('#9090A0'),
    highlight: chalk.hex('#8A2BE2').bold,
    selected: chalk.hex('#9370DB').bold,
  },
};

// ====================== PERSISTÊNCIA ======================

function readTheme() {
  try {
    if (fs.existsSync(THEME_FILE)) {
      const data = JSON.parse(fs.readFileSync(THEME_FILE, 'utf8'));
      if (data.theme && THEMES[data.theme]) {
        return data.theme;
      }
    }
  } catch (_) {}
  return 'emerald'; // Tema padrão
}

function saveTheme(themeId) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(THEME_FILE, JSON.stringify({ theme: themeId }, null, 2), 'utf8');
  } catch (_) {}
}

/**
 * Retorna o objecto de cores do tema ativo.
 */
function getTheme() {
  const themeId = readTheme();
  return THEMES[themeId] || THEMES.emerald;
}

/**
 * Retorna o ID do tema ativo.
 */
function getThemeId() {
  return readTheme();
}

/**
 * Retorna todos os temas disponíveis.
 */
function getAllThemes() {
  return THEMES;
}

module.exports = {
  getTheme,
  getThemeId,
  getAllThemes,
  saveTheme,
  readTheme,
  THEMES,
};
