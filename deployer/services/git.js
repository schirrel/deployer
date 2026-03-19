/**
 * Git Service
 * Wrapper para comandos git usando child_process.spawn.
 * 
 * @agent DevOps Agent
 */

'use strict';

const { spawnCmd } = require('./docker');

// Lê env dinamicamente para evitar problemas de ordem de carregamento de módulos
function getGitEnv() {
  return {
    repoPath:  process.env.REPO_PATH  || process.cwd(),
    gitBranch: process.env.GIT_BRANCH || 'main',
  };
}

/**
 * Retorna o hash do commit atual (HEAD).
 */
async function getCurrentHash() {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
  if (result.code !== 0) throw new Error('git rev-parse HEAD falhou');
  return result.stdout.trim();
}

async function getPreviousHash() {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd('git', ['rev-parse', 'HEAD~1'], { cwd: repoPath });
  if (result.code !== 0) throw new Error('git rev-parse HEAD~1 falhou');
  return result.stdout.trim();
}

async function pull(onLine) {
  const { repoPath, gitBranch } = getGitEnv();
  const result = await spawnCmd(
    'git', ['pull', 'origin', gitBranch],
    { cwd: repoPath },
    onLine
  );
  if (result.code !== 0) throw new Error(`git pull falhou (exit ${result.code})`);
  return result;
}

async function checkout(hash, onLine) {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd(
    'git', ['checkout', hash],
    { cwd: repoPath },
    onLine
  );
  if (result.code !== 0) throw new Error(`git checkout ${hash} falhou`);
  return result;
}

async function diffFile(filePath) {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd(
    'git', ['diff', 'HEAD~1', 'HEAD', '--', filePath],
    { cwd: repoPath }
  );
  return result.stdout.trim();
}

async function getLastCommitInfo() {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd(
    'git', ['log', '-1', '--pretty=format:%H|%s|%an|%ar'],
    { cwd: repoPath }
  );
  if (result.code !== 0) return null;
  const [hash, subject, author, relTime] = result.stdout.trim().split('|');
  return { hash, subject, author, relTime };
}

/**
 * Faz `git fetch origin` para atualizar refs remotas sem alterar a working tree.
 */
async function fetch(onLine) {
  const { repoPath, gitBranch } = getGitEnv();
  const result = await spawnCmd(
    'git', ['fetch', 'origin', gitBranch],
    { cwd: repoPath },
    onLine
  );
  if (result.code !== 0) throw new Error(`git fetch falhou (exit ${result.code})`);
  return result;
}

/**
 * Retorna o nome da branch atual.
 */
async function getBranch() {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd('git', ['branch', '--show-current'], { cwd: repoPath });
  if (result.code !== 0) throw new Error('git branch --show-current falhou');
  return result.stdout.trim();
}

/**
 * Retorna `git status --short` (lista de arquivos modificados).
 */
async function status() {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd('git', ['status', '--short'], { cwd: repoPath });
  return result.stdout.trim();
}

/**
 * Retorna os últimos N commits em formato oneline.
 */
async function logRecent(n = 10) {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd(
    'git', ['log', `--oneline`, `-${n}`],
    { cwd: repoPath }
  );
  return result.stdout.trim();
}

/**
 * Retorna commits que existem no remote mas não no HEAD local.
 * Requer `git fetch` prévio para refs atualizadas.
 */
async function getRemoteDiff() {
  const { repoPath, gitBranch } = getGitEnv();
  const result = await spawnCmd(
    'git', ['log', `HEAD..origin/${gitBranch}`, '--oneline'],
    { cwd: repoPath }
  );
  return result.stdout.trim();
}

/**
 * Retorna contagem de commits atrás/à frente em relação ao remote.
 * Requer `git fetch` prévio.
 */
async function getRevCount() {
  const { repoPath, gitBranch } = getGitEnv();
  const result = await spawnCmd(
    'git', ['rev-list', '--left-right', '--count', `HEAD...origin/${gitBranch}`],
    { cwd: repoPath }
  );
  if (result.code !== 0) return { ahead: 0, behind: 0 };
  const [ahead, behind] = result.stdout.trim().split(/\s+/).map(Number);
  return { ahead: ahead || 0, behind: behind || 0 };
}

module.exports = {
  getCurrentHash,
  getPreviousHash,
  pull,
  checkout,
  diffFile,
  getLastCommitInfo,
  fetch,
  getBranch,
  status,
  logRecent,
  getRemoteDiff,
  getRevCount,
};
