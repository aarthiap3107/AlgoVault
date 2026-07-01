// Leet2Git Popup Logic

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabToggleBtn = document.getElementById('tab-toggle');
  const dashboardView = document.getElementById('dashboard-view');
  const settingsView = document.getElementById('settings-view');
  
  const tokenInput = document.getElementById('github-token');
  const ownerInput = document.getElementById('github-owner');
  const repoInput = document.getElementById('github-repo');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-message');

  const statTotal = document.getElementById('stat-total');
  const statEasy = document.getElementById('stat-easy');
  const statMedium = document.getElementById('stat-medium');
  const statHard = document.getElementById('stat-hard');
  const historyList = document.getElementById('history-list');

  // Load existing configuration and statistics
  chrome.storage.local.get([
    'github_token',
    'github_repo_owner',
    'github_repo_name',
    'stats'
  ], (data) => {
    if (data.github_token) tokenInput.value = data.github_token;
    if (data.github_repo_owner) ownerInput.value = data.github_repo_owner;
    if (data.github_repo_name) repoInput.value = data.github_repo_name;

    // Render Stats
    renderStats(data.stats);

    // If configuration is empty, default to settings view
    if (!data.github_token || !data.github_repo_owner || !data.github_repo_name) {
      showView('settings');
    }
  });

  // Toggle View Handler
  tabToggleBtn.addEventListener('click', () => {
    if (settingsView.classList.contains('hidden')) {
      showView('settings');
    } else {
      // Reload stats in case anything updated in the background
      chrome.storage.local.get(['stats'], (data) => {
        renderStats(data.stats);
        showView('dashboard');
      });
    }
  });

  // Save Settings Handler
  saveBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    const owner = ownerInput.value.trim();
    const repo = repoInput.value.trim();

    if (!token || !owner || !repo) {
      showStatus('Please fill in all fields.', 'error');
      return;
    }

    showStatus('Verifying repository with GitHub...', 'info');
    saveBtn.disabled = true;

    const isValid = await verifyGitHubCredentials(token, owner, repo);
    
    saveBtn.disabled = false;

    if (isValid) {
      // Save configurations
      chrome.storage.local.set({
        github_token: token,
        github_repo_owner: owner,
        github_repo_name: repo
      }, () => {
        showStatus('Configuration verified & saved successfully!', 'success');
        
        // Auto-switch to dashboard after a delay
        setTimeout(() => {
          chrome.storage.local.get(['stats'], (data) => {
            renderStats(data.stats);
            showView('dashboard');
          });
        }, 1200);
      });
    } else {
      showStatus('Invalid credentials or repository not found.\nPlease check your Token and Repository details.', 'error');
    }
  });

  // Helper: Switch Popup Views
  function showView(view) {
    if (view === 'settings') {
      settingsView.classList.remove('hidden');
      dashboardView.classList.add('hidden');
      tabToggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      `; // List icon
      tabToggleBtn.title = "View Dashboard";
    } else {
      settingsView.classList.add('hidden');
      dashboardView.classList.remove('hidden');
      tabToggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      `; // Gear icon
      tabToggleBtn.title = "View Settings";
      statusMsg.textContent = '';
      statusMsg.className = 'status-message';
    }
  }

  // Helper: Show status message in settings
  function showStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = 'status-message';
    
    if (type === 'success') statusMsg.classList.add('status-success');
    else if (type === 'error') statusMsg.classList.add('status-error');
    else statusMsg.style.color = '#FFA116';
  }

  // Helper: Verify repository info via GitHub API
  async function verifyGitHubCredentials(token, owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      return response.status === 200;
    } catch (e) {
      console.error('[Leet2Git] GitHub validation error:', e);
      return false;
    }
  }

  // Helper: Render statistics and history list
  function renderStats(stats) {
    const defaultStats = {
      Easy: 0,
      Medium: 0,
      Hard: 0,
      total: 0,
      history: []
    };

    const currentStats = stats || defaultStats;

    // Update Counter text
    statTotal.textContent = currentStats.total || 0;
    statEasy.textContent = currentStats.Easy || 0;
    statMedium.textContent = currentStats.Medium || 0;
    statHard.textContent = currentStats.Hard || 0;

    // Update history list
    historyList.innerHTML = '';
    const history = currentStats.history || [];

    if (history.length === 0) {
      historyList.innerHTML = `<li class="empty-msg">No solutions synced yet. Solve a LeetCode problem!</li>`;
      return;
    }

    history.forEach(item => {
      const li = document.createElement('li');
      const diffClass = item.difficulty ? item.difficulty.toLowerCase() : 'easy';
      li.className = `history-item ${diffClass}`;

      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'history-details';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'history-title';
      titleSpan.textContent = `${item.questionId}. ${item.title}`;

      const metaSpan = document.createElement('span');
      metaSpan.className = 'history-meta';
      const dateString = item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '';
      metaSpan.textContent = `${item.difficulty || 'Easy'} • ${dateString}`;

      detailsDiv.appendChild(titleSpan);
      detailsDiv.appendChild(metaSpan);

      const langSpan = document.createElement('span');
      langSpan.className = 'history-lang';
      langSpan.textContent = item.language || 'TXT';

      li.appendChild(detailsDiv);
      li.appendChild(langSpan);
      historyList.appendChild(li);
    });
  }
});
