// AlgoVault — ISOLATED world bridge
// Receives postMessage events from page_hook.js and forwards them to the service worker.
(function () {
  function getProblemSlug() {
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    return match ? match[1] : null;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data?.type) return;
    const { type, data } = event.data;

    // ── REST check endpoint ──────────────────────────────────────────────────
    if (type === 'AV_SUBMISSION_CHECKED') {
      if (data?.status_msg !== 'Accepted') return;
      chrome.runtime.sendMessage({
        type: 'SOLUTION_ACCEPTED',
        payload: {
          code: data.code,
          lang: data.lang,
          title: data.title,
          questionId: data.question_id?.toString() ?? null,
          slug: getProblemSlug(),
          runtime: data.status_runtime ?? null,
          memory: data.status_memory ?? null
        }
      });

    // ── GraphQL detail endpoint ──────────────────────────────────────────────
    } else if (type === 'AV_SUBMISSION_GRAPHQL') {
      const sub = data?.submissionDetails;
      if (!sub || !['Accepted', 'SUCCESS'].includes(sub.statusDisplay)) return;
      chrome.runtime.sendMessage({
        type: 'SOLUTION_ACCEPTED',
        payload: {
          code: sub.code,
          lang: sub.lang?.name ?? null,
          title: sub.question?.title ?? null,
          questionId: sub.question?.questionId ?? null,
          slug: sub.question?.titleSlug ?? getProblemSlug(),
          runtime: sub.runtime ?? null,
          memory: sub.memory ?? null
        }
      });
    }
  });
})();
