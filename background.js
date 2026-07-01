// Leet2Git Background Service Worker

const EXTENSIONS = {
  'cpp': 'cpp',
  'java': 'java',
  'python': 'py',
  'python3': 'py',
  'c': 'c',
  'csharp': 'cs',
  'javascript': 'js',
  'typescript': 'ts',
  'swift': 'swift',
  'golang': 'go',
  'go': 'go',
  'scala': 'scala',
  'kotlin': 'kt',
  'rust': 'rs',
  'php': 'php',
  'ruby': 'rb',
  'sql': 'sql',
  'mysql': 'sql',
  'mssql': 'sql',
  'oraclesql': 'sql'
};

// Standard UTF-8 safe base64 encoding for Service Worker
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binString = '';
  for (let i = 0; i < bytes.length; i++) {
    binString += String.fromCharCode(bytes[i]);
  }
  return btoa(binString);
}

// Fetch problem details (like difficulty and canonical ID) from LeetCode GraphQL
async function fetchLeetCodeDetails(titleSlug) {
  try {
    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query questionTitle($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
              questionId
              questionFrontendId
              title
              titleSlug
              difficulty
            }
          }
        `,
        variables: {
          titleSlug: titleSlug
        }
      })
    });
    
    if (!response.ok) return null;
    const result = await response.json();
    return result.data && result.data.question ? result.data.question : null;
  } catch (err) {
    console.error('[Leet2Git] Error fetching LeetCode GraphQL:', err);
    return null;
  }
}

// Check if file exists on GitHub (to get the SHA)
async function getGitHubFileSHA(token, owner, repo, path) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (response.status === 200) {
      const data = await response.json();
      return data.sha;
    }
    return null;
  } catch (err) {
    console.error('[Leet2Git] Error fetching file SHA:', err);
    return null;
  }
}

// Upload file to GitHub
async function pushToGitHub(token, owner, repo, path, content, commitMessage, sha = null) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  
  const body = {
    message: commitMessage,
    content: utf8ToBase64(content)
  };
  
  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  return response.ok;
}

// Listener for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBMISSION_ACCEPTED') {
    handleAcceptedSubmission(message.payload);
  }
  return true; // Keep message channel open for async response if needed
});

async function handleAcceptedSubmission(payload) {
  console.log('[Leet2Git] Handling accepted submission:', payload);

  // Get user configurations
  const config = await chrome.storage.local.get([
    'github_token',
    'github_repo_owner',
    'github_repo_name'
  ]);

  const token = config.github_token;
  const owner = config.github_repo_owner;
  const repo = config.github_repo_name;

  if (!token || !owner || !repo) {
    console.warn('[Leet2Git] Extension not configured. Please open settings and fill required fields.');
    return;
  }

  // Retrieve detailed info from LeetCode GraphQL
  let questionFrontendId = payload.questionId;
  let difficulty = 'Easy'; // fallback default
  let title = payload.title;
  let titleSlug = payload.slug;

  if (titleSlug) {
    const details = await fetchLeetCodeDetails(titleSlug);
    if (details) {
      questionFrontendId = details.questionFrontendId || details.questionId;
      difficulty = details.difficulty;
      title = details.title;
    }
  }

  // Format file extension
  const cleanLangName = (payload.lang || '').toLowerCase();
  const ext = EXTENSIONS[cleanLangName] || 'txt';

  // Format file name: (leetcode question no)_(question name).(extension)
  // Example: "Two Sum" -> "Two_Sum", "1_Two_Sum.py"
  const cleanTitle = title.trim().replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/[\s-]+/g, '_');
  const fileName = `${questionFrontendId}_${cleanTitle}.${ext}`;

  // Check if file already exists in repo to get SHA
  console.log(`[Leet2Git] Checking if ${fileName} exists on GitHub...`);
  const sha = await getGitHubFileSHA(token, owner, repo, fileName);

  // Push to GitHub
  console.log(`[Leet2Git] Pushing ${fileName} to repo ${owner}/${repo}...`);
  const commitMessage = `Sync: ${questionFrontendId}. ${title} (${difficulty}) - Leet2Git`;
  const success = await pushToGitHub(token, owner, repo, fileName, payload.code, commitMessage, sha);

  if (success) {
    console.log(`[Leet2Git] Successfully pushed ${fileName} to GitHub!`);
    
    // Save to storage statistics
    const statsResult = await chrome.storage.local.get(['stats']);
    const stats = statsResult.stats || {
      Easy: 0,
      Medium: 0,
      Hard: 0,
      total: 0,
      languages: {},
      history: []
    };

    // Prevent duplicate entries in history for the same question
    const alreadyPushed = stats.history.some(item => item.questionId === questionFrontendId);

    if (!alreadyPushed) {
      if (difficulty === 'Easy') stats.Easy += 1;
      else if (difficulty === 'Medium') stats.Medium += 1;
      else if (difficulty === 'Hard') stats.Hard += 1;
      stats.total += 1;
    }

    // Update language counts
    const langDisplay = EXTENSIONS[cleanLangName] ? cleanLangName.toUpperCase() : 'UNKNOWN';
    stats.languages[langDisplay] = (stats.languages[langDisplay] || 0) + 1;

    // Add to history list (prepend to keep recent at top)
    const historyItem = {
      questionId: questionFrontendId,
      title: title,
      difficulty: difficulty,
      language: langDisplay,
      timestamp: Date.now()
    };
    
    // Filter out previous entry for the same question in history if it exists, then prepend
    stats.history = [
      historyItem,
      ...stats.history.filter(item => item.questionId !== questionFrontendId)
    ].slice(0, 50); // Cap history at last 50 items

    await chrome.storage.local.set({ stats });
    console.log('[Leet2Git] Stats updated locally.');
  } else {
    console.error(`[Leet2Git] Failed to push code to GitHub. Please check repository permissions and API token.`);
  }
}
