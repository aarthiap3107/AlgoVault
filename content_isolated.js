(function() {
  console.log('[Leet2Git] ISOLATED world content script loaded.');

  // Helper to extract problem slug from current LeetCode URL
  function getProblemSlug() {
    const match = window.location.pathname.match(/\/problems\/([^\/]+)/);
    return match ? match[1] : null;
  }

  // Listen for messages from the page context (content_main.js)
  window.addEventListener('message', function(event) {
    // Only trust messages from our own window
    if (event.source !== window || !event.data || !event.data.type) {
      return;
    }

    const { type, data } = event.data;

    // 1. Handle REST check endpoint intercept
    if (type === 'LEET2GIT_SUBMISSION_CHECKED') {
      if (data && data.status_msg === 'Accepted') {
        const payload = {
          code: data.code,
          lang: data.lang,
          title: data.title,
          questionId: data.question_id ? data.question_id.toString() : null,
          slug: getProblemSlug(),
          runtime: data.status_runtime,
          memory: data.status_memory
        };
        
        console.log('[Leet2Git] Submission accepted (REST). Sending to background...', payload.title);
        chrome.runtime.sendMessage({
          type: 'SUBMISSION_ACCEPTED',
          payload: payload
        });
      }
    }
    
    // 2. Handle GraphQL check/detail endpoint intercept
    else if (type === 'LEET2GIT_SUBMISSION_GRAPHQL') {
      const submission = data && data.submissionDetails;
      if (submission && (submission.statusDisplay === 'Accepted' || submission.statusDisplay === 'SUCCESS')) {
        const payload = {
          code: submission.code,
          lang: submission.lang ? submission.lang.name : null,
          title: submission.question ? submission.question.title : null,
          questionId: submission.question ? submission.question.questionId : null,
          slug: submission.question ? submission.question.titleSlug : getProblemSlug(),
          runtime: submission.runtime,
          memory: submission.memory
        };

        console.log('[Leet2Git] Submission accepted (GraphQL). Sending to background...', payload.title);
        chrome.runtime.sendMessage({
          type: 'SUBMISSION_ACCEPTED',
          payload: payload
        });
      }
    }
  });
})();
