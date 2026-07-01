// AlgoVault — Background Service Worker

const LANG_EXTENSIONS = {
  cpp: 'cpp', java: 'java', python: 'py', python3: 'py',
  c: 'c', csharp: 'cs', javascript: 'js', typescript: 'ts',
  swift: 'swift', golang: 'go', go: 'go', scala: 'scala',
  kotlin: 'kt', rust: 'rs', php: 'php', ruby: 'rb',
  sql: 'sql', mysql: 'sql', mssql: 'sql', oraclesql: 'sql',
  bash: 'sh', shell: 'sh', dart: 'dart', elixir: 'ex',
  erlang: 'erl', racket: 'rkt', haskell: 'hs'
};

// UTF-8–safe base64 for Service Worker (no DOM btoa quirks)
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Retry wrapper with exponential backoff (1s → 2s → 4s).
// Retries when fn returns a falsy value or throws; passes through truthy results.
async function withRetry(fn, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await fn();
      if (result?.pushed ?? result) return result;
    } catch (err) {
      if (i === maxAttempts - 1) throw err;
    }
    if (i < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  return null;
}

// Build GitHub path respecting organization mode
function computeFilePath(basePath, orgMode, difficulty, langName, fileName) {
  const segments = basePath ? [basePath.replace(/\/+$/, '')] : [];
  if (orgMode === 'byDifficulty') segments.push(difficulty);
  else if (orgMode === 'byLanguage') segments.push(langName.toUpperCase());
  segments.push(fileName);
  return segments.join('/');
}

// Fetch problem metadata including topic tags from LeetCode GraphQL
async function fetchProblemMetadata(titleSlug) {
  try {
    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query meta($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            questionFrontendId
            title
            difficulty
            topicTags { name }
          }
        }`,
        variables: { titleSlug }
      })
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.question ?? null;
  } catch {
    return null;
  }
}

// Always create a new file on GitHub (never update/overwrite)
async function createFile(token, owner, repo, path, content, message) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, content: utf8ToBase64(content) })
  });
  // 201 = created, 200 = updated (shouldn't happen without SHA, but accept it)
  return { ok: res.ok, conflict: res.status === 422 };
}

// Push a new versioned file, auto-incrementing if a name collision occurs on GitHub.
// Collisions only happen after an extension re-install (local counts were reset).
async function pushVersionedFile(token, owner, repo, dirPath, baseName, ext, code, commitMsg, startVersion) {
  for (let v = startVersion; v <= startVersion + 9; v++) {
    const suffix = v === 1 ? '' : `_v${v}`;
    const filePath = `${dirPath ? dirPath + '/' : ''}${baseName}${suffix}.${ext}`;
    const result = await createFile(token, owner, repo, filePath, code, commitMsg);
    if (result.ok)       return { pushed: true, version: v, filePath };
    if (!result.conflict) return { pushed: false };
    // 422 = file already exists — try next version
  }
  return { pushed: false };
}

// Track consecutive-day solving streaks
function updateStreak(stats) {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  if (stats.lastPushDate === today) return; // already pushed today
  stats.streak = stats.lastPushDate === yesterday ? (stats.streak || 0) + 1 : 1;
  stats.lastPushDate = today;
}

// Show desktop notification after a successful vault
async function showNotification(questionId, title, difficulty, enabled) {
  if (!enabled) return;
  chrome.notifications.create(`av_${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon.png'),
    title: 'AlgoVault — Vaulted!',
    message: `${questionId}. ${title} (${difficulty}) pushed to GitHub`
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SOLUTION_ACCEPTED') {
    handleAcceptedSolution(message.payload);
  }
  return true;
});

async function handleAcceptedSolution(payload) {
  console.log('[AlgoVault] Processing accepted solution:', payload);

  const [cfg, { stats: existing }] = await Promise.all([
    chrome.storage.local.get(['github_token', 'github_owner', 'github_repo',
                              'github_folder', 'org_mode', 'notifications_enabled']),
    chrome.storage.local.get(['stats'])
  ]);

  const { github_token: token, github_owner: owner, github_repo: repo } = cfg;
  if (!token || !owner || !repo) {
    console.warn('[AlgoVault] Not configured — open the extension settings.');
    return;
  }

  const stats = existing || {
    Easy: 0, Medium: 0, Hard: 0, total: 0,
    languages: {}, history: [],
    streak: 0, lastPushDate: null,
    submissionCounts: {},  // tracks versions per (questionId, language)
    lastPushed: {}         // rate-limit guard per (questionId, language)
  };
  if (!stats.submissionCounts) stats.submissionCounts = {};
  if (!stats.lastPushed)       stats.lastPushed = {};

  const orgMode             = cfg.org_mode || 'flat';
  const baseFolder          = (cfg.github_folder || '').trim();
  const notificationsEnabled = cfg.notifications_enabled !== false;

  let { questionId, title, slug, lang, code, runtime, memory } = payload;
  let difficulty = 'Easy';
  let tags = [];

  if (slug) {
    const meta = await fetchProblemMetadata(slug);
    if (meta) {
      questionId = meta.questionFrontendId || questionId;
      title      = meta.title              || title;
      difficulty = meta.difficulty         || difficulty;
      tags       = (meta.topicTags || []).map(t => t.name);
    }
  }

  const cleanLang = (lang || '').toLowerCase();
  const langKey   = cleanLang.toUpperCase();
  const ext       = LANG_EXTENSIONS[cleanLang] || 'txt';

  // Rate-limit: REST and GraphQL paths can both fire for the same submission.
  // Ignore if the same (question, language) was processed within the last 30 s.
  const rateKey      = `${questionId}_${langKey}`;
  const lastPushedAt = stats.lastPushed[rateKey] || 0;
  if (Date.now() - lastPushedAt < 30_000) {
    console.log('[AlgoVault] Skipping duplicate event (within 30 s window).');
    return;
  }

  // Determine next version number from local state.
  // v1 → no suffix ("1_Two_Sum.py"), v2+ → "_v2", "_v3", etc.
  const prevCount   = stats.submissionCounts[rateKey] || 0;
  const nextVersion = prevCount + 1;

  const cleanTitle = title.trim()
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/[\s-]+/g, '_');

  // Directory portion of the path (org mode applied here, not to the file name)
  const dirPath = computeFilePath(baseFolder, orgMode, difficulty, cleanLang, '').replace(/\/$/, '');

  const tagStr   = tags.length ? ` [${tags.slice(0, 3).join(', ')}]` : '';
  const commitMsg = `vault(${difficulty.toLowerCase()}): ${questionId}. ${title}${tagStr}`;

  const result = await withRetry(() =>
    pushVersionedFile(token, owner, repo, dirPath, `${questionId}_${cleanTitle}`, ext, code, commitMsg, nextVersion)
  );

  if (!result?.pushed) {
    console.error('[AlgoVault] Failed to vault after retries.');
    return;
  }

  console.log(`[AlgoVault] Vaulted v${result.version} → ${owner}/${repo}/${result.filePath}`);

  // Update stats — problem totals count unique questionIds only, not re-submissions
  const seenBefore = stats.history.some(h => h.questionId === questionId);
  if (!seenBefore) {
    stats[difficulty] = (stats[difficulty] || 0) + 1;
    stats.total += 1;
  }

  stats.languages[langKey]            = (stats.languages[langKey] || 0) + 1;
  stats.submissionCounts[rateKey]     = result.version;  // persist actual version used
  stats.lastPushed[rateKey]           = Date.now();

  updateStreak(stats);

  // Every submission gets its own history entry (no deduplication)
  const entry = {
    questionId,
    title,
    difficulty,
    language: langKey,
    version: result.version,
    filePath: result.filePath,
    tags,
    runtime: runtime || null,
    memory:  memory  || null,
    timestamp: Date.now()
  };

  stats.history = [entry, ...stats.history].slice(0, 200);

  await chrome.storage.local.set({ stats });
  await showNotification(questionId, title, difficulty, notificationsEnabled);
}
