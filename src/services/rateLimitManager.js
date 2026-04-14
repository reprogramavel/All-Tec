// src/services/rateLimitManager.js - Sistema adaptativo de rate-limit
//
// Em vez de usar um delay fixo (ex: 300ms), este sistema:
// 1. Começa com um delay mínimo (ex: 200ms)
// 2. Captura erros 429 (rate-limit) ao apagar mensagens
// 3. Quando recebe um rate-limit, usa o tempo exato de "retry_after"
// 4. Reduz o delay gradualmente quando não há rate-limits
// 5. Mostra estatísticas de performance em tempo real

const chalk = require('chalk');

class RateLimitManager {
  constructor(options = {}) {
    // Delay mínimo entre operações (ms)
    this.minDelay = options.minDelay || 100;
    // Delay máximo permitido (ms)
    this.maxDelay = options.maxDelay || 5000;
    // Delay atual (começa agressivo)
    this.currentDelay = options.initialDelay || 200;
    // Fator de redução quando não há rate-limit (ex: 0.85 = reduz 15%)
    this.decreaseFactor = options.decreaseFactor || 0.85;
    // Fator de aumento quando há rate-limit (ex: 1.5 = aumenta 50%)
    this.increaseFactor = options.increaseFactor || 1.5;
    // Contador de operações sem rate-limit
    this.successStreak = 0;
    // Quantas operações sem rate-limit antes de reduzir o delay
    this.decreaseThreshold = options.decreaseThreshold || 5;
    // Estatísticas
    this.stats = {
      totalRequests: 0,
      rateLimitsHit: 0,
      totalWaitTime: 0,
      lastRateLimitAt: null,
    };
    // Se está atualmente em rate-limit (aguardando retry_after)
    this._rateLimited = false;
    this._retryAfterMs = 0;
  }

  /**
   * Chamado quando o Discord retorna rate-limit (429).
   * Pode ser chamado manualmente a partir do catch de message.delete().
   */
  onRateLimit(info) {
    const retryAfterMs = info.timeout || info.retryAfter || 1000;

    this._rateLimited = true;
    this._retryAfterMs = retryAfterMs;
    this.stats.rateLimitsHit += 1;
    this.stats.lastRateLimitAt = new Date();
    this.successStreak = 0;

    // Aumenta o delay base para evitar rate-limits futuros
    this.currentDelay = Math.min(
      this.currentDelay * this.increaseFactor,
      this.maxDelay
    );

    process.stdout.write(
      `\x1B[2K\r${chalk.yellow(
        `   Rate-limit detectado! Aguardando ${retryAfterMs}ms (delay ajustado para ${Math.round(this.currentDelay)}ms)`
      )}\n`
    );
  }

  /**
   * Retorna o delay ideal para a próxima operação.
   * Se está em rate-limit, retorna o tempo de retry_after.
   * Caso contrário, retorna o delay adaptativo atual.
   */
  getDelay() {
    if (this._rateLimited) {
      this._rateLimited = false;
      const retryDelay = this._retryAfterMs + 100; // +100ms de margem
      this.stats.totalWaitTime += retryDelay;
      return retryDelay;
    }

    this.stats.totalRequests += 1;
    this.successStreak += 1;

    // Após N operações bem-sucedidas, reduz o delay
    if (this.successStreak >= this.decreaseThreshold) {
      this.currentDelay = Math.max(
        this.currentDelay * this.decreaseFactor,
        this.minDelay
      );
      this.successStreak = 0;
    }

    this.stats.totalWaitTime += this.currentDelay;
    return Math.round(this.currentDelay);
  }

  /**
   * Aguarda o delay ideal antes da próxima operação.
   */
  async wait() {
    const ms = this.getDelay();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retorna uma string formatada com as estatísticas atuais.
   */
  getStatsText() {
    const avgDelay = this.stats.totalRequests > 0
      ? Math.round(this.stats.totalWaitTime / this.stats.totalRequests)
      : 0;

    return [
      chalk.gray(`   Delay atual: ${Math.round(this.currentDelay)}ms`),
      chalk.gray(`   Rate-limits: ${this.stats.rateLimitsHit}`),
      chalk.gray(`   Delay médio: ${avgDelay}ms`),
    ].join('\n');
  }

  /**
   * Imprime o status do rate-limit na linha atual (inline).
   */
  printInlineStatus(deletedCount, totalCount) {
    const percent = totalCount > 0 ? Math.round((deletedCount / totalCount) * 100) : 0;
    const bar = this._progressBar(percent, 20);

    const line =
      `   ${bar} ${chalk.white(`${deletedCount}/${totalCount}`)} ` +
      `${chalk.gray(`(${Math.round(this.currentDelay)}ms/msg)`)} ` +
      `${this.stats.rateLimitsHit > 0 ? chalk.yellow(`RL:${this.stats.rateLimitsHit}`) : chalk.green('OK')}`;

    process.stdout.write(`\x1B[2K\r${line}`);
  }

  _progressBar(percent, width) {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ` ${percent}%`;
  }

  /**
   * Reset das estatísticas (para uma nova sessão de deleção).
   */
  reset() {
    this.currentDelay = 200;
    this.successStreak = 0;
    this.stats = {
      totalRequests: 0,
      rateLimitsHit: 0,
      totalWaitTime: 0,
      lastRateLimitAt: null,
    };
    this._rateLimited = false;
    this._retryAfterMs = 0;
  }
}

module.exports = { RateLimitManager };
