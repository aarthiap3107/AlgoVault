// AlgoVault — MAIN world page interceptor
// Hooks fetch/XHR to capture submitted code and detect accepted submissions.
(function () {
  if (window.AlgoVault_Loaded) return;
  window.AlgoVault_Loaded = true;

  let pendingCode = null;
  let pendingLang = null;

  function getEditorCode() {
    try {
      if (window.monaco?.editor) {
        const models = window.monaco.editor.getModels();
        if (models?.length) return models[0].getValue();
      }
      const cm = document.querySelector('.CodeMirror');
      if (cm?.CodeMirror) return cm.CodeMirror.getValue();
    } catch { }
    return null;
  }

  function parseBody(body) {
    if (!body) return null;
    try {
      return JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body));
    } catch {
      return null;
    }
  }

  // ── Fetch hook ────────────────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, opts] = args;
    const url = resource instanceof Request ? resource.url : String(resource);

    // Capture code from submission request body
    if (url.includes('/submit/')) {
      const body = parseBody(opts?.body);
      if (body?.typed_code) {
        pendingCode = body.typed_code;
        pendingLang = body.lang;
      }
    }

    const response = await _fetch.apply(this, args);

    try {
      // Path A: classic REST check endpoint
      if (url.includes('/submissions/detail/') && url.includes('/check/')) {
        const data = await response.clone().json();
        if (data?.state === 'SUCCESS' && data.status_msg === 'Accepted') {
          window.postMessage({
            type: 'AV_SUBMISSION_CHECKED',
            data: {
              ...data,
              code: data.code || pendingCode || getEditorCode(),
              lang: data.lang || pendingLang
            }
          }, '*');
        }

      // Path B: GraphQL submission detail / status check
      } else if (url.includes('/graphql')) {
        const reqBody = parseBody(opts?.body);
        const isSubmissionOp = reqBody && (
          reqBody.operationName === 'submissionDetails' ||
          reqBody.operationName === 'checkSubmissionStatus'
        );
        if (isSubmissionOp) {
          const res = await response.clone().json();
          const sub = res?.data?.submissionDetails;
          if (sub && (sub.statusDisplay === 'Accepted' || sub.statusDisplay === 'SUCCESS')) {
            if (!sub.code) sub.code = pendingCode || getEditorCode();
            window.postMessage({ type: 'AV_SUBMISSION_GRAPHQL', data: res.data }, '*');
          }
        }
      }
    } catch { }

    return response;
  };

  // ── XHR hook (fallback for legacy LeetCode paths) ─────────────────────────
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._avUrl = url;
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this._avUrl?.includes('/submit/') && body) {
      const parsed = parseBody(body);
      if (parsed?.typed_code) {
        pendingCode = parsed.typed_code;
        pendingLang = parsed.lang;
      }
    }

    this.addEventListener('load', function () {
      try {
        if (this._avUrl?.includes('/submissions/detail/') && this._avUrl.includes('/check/')) {
          const data = JSON.parse(this.responseText);
          if (data?.state === 'SUCCESS' && data.status_msg === 'Accepted') {
            window.postMessage({
              type: 'AV_SUBMISSION_CHECKED',
              data: {
                ...data,
                code: data.code || pendingCode || getEditorCode(),
                lang: data.lang || pendingLang
              }
            }, '*');
          }
        }
      } catch { }
    });

    return _send.apply(this, arguments);
  };
})();
