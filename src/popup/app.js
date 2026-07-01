// AlgoVault — Popup Application

document.addEventListener('DOMContentLoaded', () => {

  // ── Element refs ──────────────────────────────────────────────────────────
  const tabBtns       = document.querySelectorAll('.tab-btn');
  const tabPanes      = document.querySelectorAll('.tab-pane');

  // Dashboard
  const streakCount   = document.getElementById('streak-count');
  const statTotal     = document.getElementById('stat-total');
  const statEasy      = document.getElementById('stat-easy');
  const statMedium    = document.getElementById('stat-medium');
  const statHard      = document.getElementById('stat-hard');
  const langBars      = document.getElementById('lang-bars');

  // Vault
  const searchInput   = document.getElementById('search-input');
  const diffFilter    = document.getElementById('diff-filter');
  const langFilter    = document.getElementById('lang-filter');
  const solutionList  = document.getElementById('solution-list');

  // Settings
  const tokenInput    = document.getElementById('github-token');
  const ownerInput    = document.getElementById('github-owner');
  const repoInput     = document.getElementById('github-repo');
  const folderInput   = document.getElementById('github-folder');
  const orgRadios     = document.querySelectorAll('input[name="org-mode"]');
  const notifToggle   = document.getElementById('notif-toggle');
  const saveBtn       = document.getElementById('save-btn');
  const statusMsg     = document.getElementById('status-msg');

  // Internal state
  let allHistory = [];

  // ── Bootstrap: load config + stats ───────────────────────────────────────
  chrome.storage.local.get([
    'github_token', 'github_owner', 'github_repo', 'github_folder',
    'org_mode', 'notifications_enabled', 'stats'
  ], (data) => {
    // Populate settings fields
    if (data.github_token)  tokenInput.value  = data.github_token;
    if (data.github_owner)  ownerInput.value  = data.github_owner;
    if (data.github_repo)   repoInput.value   = data.github_repo;
    if (data.github_folder) folderInput.value = data.github_folder;

    const orgMode = data.org_mode || 'flat';
    orgRadios.forEach(r => { r.checked = r.value === orgMode; });

    notifToggle.checked = data.notifications_enabled !== false;

    // Render stats
    renderDashboard(data.stats);

    // Cold-start: go straight to settings if unconfigured
    if (!data.github_token || !data.github_owner || !data.github_repo) {
      switchTab('settings');
    }
  });

  // ── Tab navigation ────────────────────────────────────────────────────────
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function switchTab(name) {
    tabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
      b.setAttribute('aria-selected', b.dataset.tab === name);
    });
    tabPanes.forEach(p => p.classList.toggle('hidden', p.id !== `tab-${name}`));

    if (name === 'dashboard' || name === 'vault') {
      chrome.storage.local.get(['stats'], ({ stats }) => {
        renderDashboard(stats);
        renderVault(stats?.history ?? []);
      });
    }
  }

  // ── Dashboard rendering ───────────────────────────────────────────────────
  function renderDashboard(stats) {
    const s = stats || { Easy: 0, Medium: 0, Hard: 0, total: 0, languages: {}, history: [], streak: 0 };

    streakCount.textContent = s.streak || 0;
    statTotal.textContent   = s.total  || 0;
    statEasy.textContent    = s.Easy   || 0;
    statMedium.textContent  = s.Medium || 0;
    statHard.textContent    = s.Hard   || 0;

    renderLanguageBars(s.languages || {});
    allHistory = s.history || [];
    renderVault(allHistory);
  }

  function renderLanguageBars(languages) {
    const entries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      langBars.innerHTML = '<p class="empty-hint">No data yet</p>';
      return;
    }
    const total = entries.reduce((sum, [, n]) => sum + n, 0);
    const top   = entries.slice(0, 5); // show at most 5 languages

    langBars.innerHTML = top.map(([lang, count]) => {
      const pct = Math.round((count / total) * 100);
      return `
        <div class="lang-bar-row">
          <span class="lang-bar-name">${escHtml(lang)}</span>
          <div class="lang-bar-track">
            <div class="lang-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="lang-bar-pct">${pct}%</span>
        </div>`;
    }).join('');
  }

  // ── Vault rendering ───────────────────────────────────────────────────────
  function renderVault(history) {
    // Populate language filter options from unique languages in history
    const langs = [...new Set(history.map(h => h.language).filter(Boolean))].sort();
    const currentLangFilter = langFilter.value;
    langFilter.innerHTML = '<option value="">All Languages</option>' +
      langs.map(l => `<option value="${escHtml(l)}"${l === currentLangFilter ? ' selected' : ''}>${escHtml(l)}</option>`).join('');

    applyFilters(history);
  }

  function applyFilters(history) {
    const query = searchInput.value.trim().toLowerCase();
    const diff  = diffFilter.value;
    const lang  = langFilter.value;

    const filtered = history.filter(item => {
      if (diff && item.difficulty !== diff) return false;
      if (lang && item.language !== lang) return false;
      if (query) {
        const haystack = `${item.questionId} ${item.title}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      solutionList.innerHTML = '<li class="empty-hint">No matching solutions.</li>';
      return;
    }

    solutionList.innerHTML = filtered.map(item => {
      const diffClass = (item.difficulty || 'easy').toLowerCase();
      const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '';
      const perf = [
        item.runtime ? `${item.runtime}` : null,
        item.memory  ? `${item.memory}`  : null
      ].filter(Boolean).join(' · ');
      const versionLabel = item.version > 1 ? ` · v${item.version}` : '';

      const tagHtml = (item.tags?.length)
        ? `<div class="solution-tags">${item.tags.slice(0, 3).map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('')}</div>`
        : '';

      return `
        <li class="solution-item ${diffClass}">
          <div class="solution-info">
            <span class="solution-title">${escHtml(item.questionId + '. ' + item.title)}</span>
            <span class="solution-meta">
              <span>${escHtml(item.difficulty || '')}</span>
              ${date ? `<span class="meta-dot">·</span><span>${date}</span>` : ''}
              ${perf ? `<span class="meta-dot">·</span><span>${escHtml(perf)}</span>` : ''}
              ${versionLabel ? `<span class="meta-dot">·</span><span style="color:var(--accent)">${escHtml(versionLabel.trim())}</span>` : ''}
            </span>
            ${tagHtml}
          </div>
          <span class="solution-lang">${escHtml(item.language || 'TXT')}</span>
        </li>`;
    }).join('');
  }

  // ── Vault filters: live update ────────────────────────────────────────────
  searchInput.addEventListener('input',  () => applyFilters(allHistory));
  diffFilter.addEventListener('change',  () => applyFilters(allHistory));
  langFilter.addEventListener('change',  () => applyFilters(allHistory));

  // ── Settings: save ────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const token  = tokenInput.value.trim();
    const owner  = ownerInput.value.trim();
    const repo   = repoInput.value.trim();
    const folder = folderInput.value.trim();
    const orgMode = [...orgRadios].find(r => r.checked)?.value || 'flat';
    const notificationsEnabled = notifToggle.checked;

    if (!token || !owner || !repo) {
      showStatus('Please fill in token, owner, and repository name.', 'error');
      return;
    }

    showStatus('Verifying with GitHub…', 'info');
    saveBtn.disabled = true;

    const valid = await verifyGitHub(token, owner, repo);
    saveBtn.disabled = false;

    if (!valid) {
      showStatus('Repository not found or token has no access. Check your credentials.', 'error');
      return;
    }

    chrome.storage.local.set({
      github_token: token,
      github_owner: owner,
      github_repo: repo,
      github_folder: folder,
      org_mode: orgMode,
      notifications_enabled: notificationsEnabled
    }, () => {
      showStatus('Configuration saved!', 'success');
      setTimeout(() => {
        switchTab('dashboard');
        clearStatus();
      }, 1200);
    });
  });

  async function verifyGitHub(token, owner, repo) {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showStatus(msg, type) {
    statusMsg.textContent = msg;
    statusMsg.className   = `status-msg status-${type}`;
  }

  function clearStatus() {
    statusMsg.textContent = '';
    statusMsg.className   = 'status-msg';
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
