(function() {
  // Prevent duplicate injection
  if (window.Leet2Git_Loaded) return;
  window.Leet2Git_Loaded = true;

  console.log('[Leet2Git] MAIN world interceptor loaded.');

  // Cache variables to store the code submitted in the request
  let latestCode = null;
  let latestLang = null;

  // Helper to extract code from Monaco or CodeMirror editor as a fallback
  function getCodeFromDOM() {
    try {
      if (window.monaco && window.monaco.editor) {
        const models = window.monaco.editor.getModels();
        if (models && models.length > 0) {
          return models[0].getValue();
        }
      }
      
      const cmEl = document.querySelector('.CodeMirror');
      if (cmEl && cmEl.CodeMirror) {
        return cmEl.CodeMirror.getValue();
      }
    } catch (e) {
      console.error('[Leet2Git] DOM extraction failed:', e);
    }
    return null;
  }

  // Hook Fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [resource, config] = args;
    const url = resource instanceof Request ? resource.url : resource.toString();

    // Intercept code during submission request body
    if (url.includes('/submit/')) {
      try {
        let reqBody = null;
        if (config && config.body) {
          const bodyText = typeof config.body === 'string' ? config.body : new TextDecoder().decode(config.body);
          reqBody = JSON.parse(bodyText);
        }
        if (reqBody && reqBody.typed_code) {
          latestCode = reqBody.typed_code;
          latestLang = reqBody.lang;
          console.log('[Leet2Git] Captured submitted code of length:', latestCode.length);
        }
      } catch (e) {
        console.error('[Leet2Git] Error capturing code in fetch request body:', e);
      }
    }

    const response = await originalFetch.apply(this, args);

    try {
      // 1. Intercept classic check submissions endpoint
      if (url.includes('/submissions/detail/') && url.includes('/check/')) {
        const clone = response.clone();
        const data = await clone.json();
        if (data && data.state === 'SUCCESS') {
          // If status is accepted, send standard payload
          if (data.status_msg === 'Accepted') {
            // Use cached code or DOM extraction if check response doesn't have it
            const codeToSync = data.code || latestCode || getCodeFromDOM();
            const langToSync = data.lang || latestLang;

            window.postMessage({
              type: 'LEET2GIT_SUBMISSION_CHECKED',
              data: {
                ...data,
                code: codeToSync,
                lang: langToSync
              }
            }, '*');
          }
        }
      }
      // 2. Intercept GraphQL requests
      else if (url.includes('/graphql')) {
        let reqBody = null;
        if (config && config.body) {
          try {
            const bodyText = typeof config.body === 'string' ? config.body : new TextDecoder().decode(config.body);
            reqBody = JSON.parse(bodyText);
          } catch (e) {}
        }

        if (reqBody && (reqBody.operationName === 'submissionDetails' || reqBody.operationName === 'checkSubmissionStatus')) {
          const clone = response.clone();
          const resBody = await clone.json();
          if (resBody && resBody.data && resBody.data.submissionDetails) {
            const details = resBody.data.submissionDetails;
            if (details.statusDisplay === 'Accepted' || details.statusDisplay === 'SUCCESS') {
              // Ensure code is populated
              if (!details.code) {
                details.code = latestCode || getCodeFromDOM();
              }
              if (details.lang && !details.lang.name) {
                details.lang.name = latestLang;
              }
              
              window.postMessage({
                type: 'LEET2GIT_SUBMISSION_GRAPHQL',
                operationName: reqBody.operationName,
                data: resBody.data
              }, '*');
            }
          }
        }
      }
    } catch (err) {
      // Silently catch parsing issues
    }

    return response;
  };

  // Hook XMLHttpRequest (Fallback for legacy/other submission calls)
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    try {
      const url = this._url;
      // Intercept code during submission request body
      if (url && url.includes('/submit/') && body) {
        const reqBody = JSON.parse(body);
        if (reqBody && reqBody.typed_code) {
          latestCode = reqBody.typed_code;
          latestLang = reqBody.lang;
          console.log('[Leet2Git] Captured submitted code via XHR of length:', latestCode.length);
        }
      }
    } catch (e) {}

    this.addEventListener('load', function() {
      try {
        const url = this._url;
        if (url && url.includes('/submissions/detail/') && url.includes('/check/')) {
          const data = JSON.parse(this.responseText);
          if (data && data.state === 'SUCCESS' && data.status_msg === 'Accepted') {
            const codeToSync = data.code || latestCode || getCodeFromDOM();
            const langToSync = data.lang || latestLang;

            window.postMessage({
              type: 'LEET2GIT_SUBMISSION_CHECKED',
              data: {
                ...data,
                code: codeToSync,
                lang: langToSync
              }
            }, '*');
          }
        }
      } catch (e) {}
    });

    return originalSend.apply(this, arguments);
  };
})();
