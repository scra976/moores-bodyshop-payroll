'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const OWNER = 'scra976';
const REPO = 'moores-bodyshop-payroll';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = val;
  }
}

function redact(text) {
  return String(text || '').replace(/gh[pso]_[A-Za-z0-9_]+/g, '***').replace(/github_pat_[A-Za-z0-9_]+/g, '***');
}

function fail(message) {
  process.stderr.write(`${redact(message)}\n`);
  process.exit(1);
}

loadEnvFile(path.join(root, '.env'));

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  fail(
    [
      'Missing GH_TOKEN.',
      'Put it in .env next to package.json:',
      '  GH_TOKEN=your_token_here',
      ''
    ].join('\n')
  );
}

process.env.GH_TOKEN = token;
if (!process.env.CSC_IDENTITY_AUTO_DISCOVERY) {
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: opts.shell || false,
    env: { ...process.env, ...(opts.env || {}) }
  });
  if (result.status !== 0) {
    const err = redact((result.stderr || result.stdout || `${cmd} failed`).trim());
    if (opts.allowFail) return { ok: false, err, stdout: result.stdout || '' };
    throw new Error(err);
  }
  return { ok: true, stdout: result.stdout || '', stderr: result.stderr || '' };
}

async function gh(url, opts = {}) {
  const {
    method = 'GET',
    json,
    body,
    contentType,
    headers = {}
  } = opts;
  const res = await fetch(url, {
    method,
    headers: {
      'User-Agent': 'MooresBodyShopPayroll-Release',
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: json ? JSON.stringify(json) : body
  });
  const raw = Buffer.from(await res.arrayBuffer());
  let data = null;
  const text = raw.toString('utf8');
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data && data.message) || `HTTP ${res.status}`;
    const extra = data && data.errors ? JSON.stringify(data.errors) : '';
    throw new Error(`${msg}${extra ? ` ${extra}` : ''}`);
  }
  return { status: res.status, data, raw };
}

function ensureGitAndTag() {
  if (!fs.existsSync(path.join(root, '.git'))) {
    run('git', ['init', '-b', 'main']);
  }
  run('git', ['config', 'core.autocrlf', 'true'], { allowFail: true });
  const name = run('git', ['config', '--get', 'user.name'], { allowFail: true });
  const email = run('git', ['config', '--get', 'user.email'], { allowFail: true });
  if (!name.ok || !String(name.stdout).trim()) {
    run('git', ['config', 'user.name', OWNER]);
  }
  if (!email.ok || !String(email.stdout).trim()) {
    run('git', ['config', 'user.email', `${OWNER}@users.noreply.github.com`]);
  }

  run('git', ['remote', 'remove', 'origin'], { allowFail: true });
  run('git', ['remote', 'add', 'origin', `https://github.com/${OWNER}/${REPO}.git`]);
  run('git', ['add', '-A']);
  const status = run('git', ['status', '--porcelain']);
  if (String(status.stdout).trim()) {
    run('git', ['commit', '-m', `Release ${tag}`]);
  } else {
    const head = run('git', ['rev-parse', '--verify', 'HEAD'], { allowFail: true });
    if (!head.ok) {
      run('git', ['commit', '--allow-empty', '-m', `Release ${tag}`]);
    }
  }

  const authRemote = `https://x-access-token:${token}@github.com/${OWNER}/${REPO}.git`;
  try {
    run('git', ['push', authRemote, 'HEAD:main']);
  } catch (err) {
    process.stderr.write(`git push main: ${redact(err.message)}\n`);
    process.stderr.write('Continuing with tag/release upload.\n');
  }

  run('git', ['tag', '-f', tag]);
  try {
    run('git', ['push', authRemote, `${tag}:${tag}`, '--force']);
  } catch (err) {
    process.stderr.write(`git push tag: ${redact(err.message)}\n`);
  }
}

async function getOrCreateRelease() {
  try {
    const existing = await gh(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
    if (existing.data && existing.data.id) return existing.data;
  } catch {
    /* create below */
  }

  try {
    const created = await gh(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
      method: 'POST',
      json: {
        tag_name: tag,
        name: version,
        body: `Moore's Body Shop Payroll ${version}`,
        draft: false,
        prerelease: false,
        make_latest: 'true',
        target_commitish: 'main'
      }
    });
    return created.data;
  } catch (err) {
    const draft = await gh(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
      method: 'POST',
      json: {
        tag_name: tag,
        name: version,
        body: `Moore's Body Shop Payroll ${version}`,
        draft: true,
        prerelease: false
      }
    });
    if (draft.data && draft.data.id) {
      const published = await gh(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${draft.data.id}`, {
        method: 'PATCH',
        json: { draft: false, make_latest: 'true', tag_name: tag }
      });
      return published.data;
    }
    throw err;
  }
}

async function uploadAsset(release, filePath) {
  const name = path.basename(filePath);
  const existing = (release.assets || []).find((a) => a.name === name);
  if (existing) {
    await gh(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`, {
      method: 'DELETE'
    });
  }
  const buf = fs.readFileSync(filePath);
  await gh(
    `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      body: buf,
      contentType: 'application/octet-stream',
      headers: { 'Content-Length': String(buf.length) }
    }
  );
  process.stdout.write(`uploaded ${name}\n`);
}

async function main() {
  process.stdout.write(`Building ${version}...\n`);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const build = spawnSync(
    npx,
    ['electron-builder', '--win', 'nsis', 'portable', '--publish', 'never'],
    { cwd: root, env: process.env, stdio: 'inherit', shell: true }
  );
  if (build.status !== 0) fail('electron-builder failed');

  const setup = path.join(root, 'dist', `MooresBodyShop-Payroll-Setup-${version}.exe`);
  const blockmap = `${setup}.blockmap`;
  const yml = path.join(root, 'dist', 'latest.yml');
  for (const f of [setup, blockmap, yml]) {
    if (!fs.existsSync(f)) fail(`Missing build output: ${path.basename(f)}`);
  }

  process.stdout.write('Creating git tag so GitHub will accept a published release...\n');
  ensureGitAndTag();

  process.stdout.write(`Uploading ${tag} assets...\n`);
  const release = await getOrCreateRelease();
  await uploadAsset(release, yml);
  await uploadAsset(release, setup);
  await uploadAsset(release, blockmap);
  process.stdout.write(`Release ${tag} is live.\n`);
}

main().catch((err) => fail(err && err.message ? err.message : err));
