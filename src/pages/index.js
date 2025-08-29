/**
 * @typedef {Object} GistFile
 * @property {string=} filename
 * @property {string=} content
 * @property {boolean=} truncated
 */
/**
 * @typedef {Object<string, GistFile>} GistFilesMap
 */
/**
 * @typedef {Object} Gist
 * @property {string=} description
 * @property {GistFilesMap=} files
 * @property {string=} html_url
 * @property {string=} url
 */
/**
 * @typedef {Object} GitLabSnippetFile
 * @property {string=} file_path
 * @property {string=} file_name
 * @property {string=} path
 */
/**
 * @typedef {Object} GitLabSnippetMeta
 * @property {string=} title
 * @property {string=} file_name
 * @property {Array<GitLabSnippetFile>=} files
 * @property {string=} web_url
 * @property {string=} url
 * @property {(number|string)=} id
 */
/**
 * @typedef {Object} CreatedGist
 * @property {string=} html_url
 * @property {string=} url
 */
(function init() {
  if (typeof document === 'undefined') {
    // Running in a non-browser environment (e.g., Node/SSR). Skip DOM-dependent initialization.
    return;
  }
  document.addEventListener('DOMContentLoaded', () => {
  /** @type {HTMLSelectElement} */ const modeSelect = document.getElementById('mode');
  /** @type {HTMLElement} */ const connectContainer = document.querySelector('.connect_accounts');
  /** @type {HTMLElement} */ const selectContentContainer = document.querySelector('.select_content');
  /** @type {HTMLElement} */ const mainButtonContainer = document.querySelector('.main_button');

  // Build UI
  connectContainer.innerHTML = `
    <div class="card section">
      <h2>Connect Accounts</h2>
      <p>Provide Personal Access Tokens (PATs). They are kept only on this page (not stored anywhere).</p>
      <div class="input_group">
        <label for="gh_token">GitHub Token <small>(scope: gist)</small></label>
        <input id="gh_token" type="password" placeholder="ghp_..." />
      </div>
      <div class="input_group">
        <label for="gl_token">GitLab Token <small>(scope: api)</small></label>
        <input id="gl_token" type="password" placeholder="glpat-..." />
      </div>
    </div>
  `;

  function renderSelection() {
    const mode = modeSelect.value; // 'snippets' (Gist -> GitLab) or 'gists' (GitLab -> GitHub)
    if (mode === 'snippets') {
      selectContentContainer.innerHTML = `
        <div class="card section">
          <h2>Gist to Snippet</h2>
          <div class="input_group">
            <label for="source_id">GitHub Gist ID</label>
            <input id="source_id" type="text" placeholder="e.g. a1b2c3d4e5f6..." />
          </div>
          <div class="input_group">
            <label for="visibility">GitLab Visibility</label>
            <select id="visibility">
              <option value="private">Private</option>
              <option value="public">Public</option>
              <option value="internal">Internal</option>
            </select>
          </div>
          <p class="note">GitLab personal snippets can include up to 10 files. If the Gist has more than 10 files, multiple snippets will be created in parts (up to 10 files per snippet).</p>
        </div>
      `;
    } else {
      selectContentContainer.innerHTML = `
        <div class="card section">
          <h2>Snippet to Gist</h2>
          <div class="input_group">
            <label for="source_id">GitLab Snippet ID</label>
            <input id="source_id" type="text" placeholder="e.g. 123456" />
          </div>
          <div class="input_group">
            <label for="visibility">Gist Visibility</label>
            <select id="visibility">
              <option value="private">Private (Secret Gist)</option>
              <option value="public">Public</option>
            </select>
          </div>
          <p class="note">Supports multi-file personal snippets: all files will be transferred to a single GitHub Gist. If files are in folders, folder separators will be replaced with "__" in Gist filenames.</p>
        </div>
      `;
    }
  }

  function renderConvertButton() {
    mainButtonContainer.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Convert';
    btn.className = 'primary_button';
    btn.addEventListener('click', handleConvert);
    mainButtonContainer.appendChild(btn);

    const result = document.createElement('div');
    result.className = 'results';
    mainButtonContainer.appendChild(result);
  }

  async function handleConvert() {
    const mode = modeSelect.value;
    /** @type {HTMLInputElement} */ const ghTokenInput = document.getElementById('gh_token');
    /** @type {HTMLInputElement} */ const glTokenInput = document.getElementById('gl_token');
    /** @type {HTMLInputElement} */ const sourceIdInput = document.getElementById('source_id');
    /** @type {HTMLSelectElement} */ const visibilitySelect = document.getElementById('visibility');
    const ghToken = (ghTokenInput ? ghTokenInput.value : '').trim();
    const glToken = (glTokenInput ? glTokenInput.value : '').trim();
    const sourceId = (sourceIdInput ? sourceIdInput.value : '').trim();
    const visibility = visibilitySelect ? visibilitySelect.value : 'private';

    /** @type {HTMLElement} */ const resultsEl = mainButtonContainer.querySelector('.results');
    /** @type {HTMLButtonElement} */ const convertBtn = mainButtonContainer.querySelector('button.primary_button');

    // Prevent spam-clicks if already disabled
    if (convertBtn && convertBtn.disabled) {
      return;
    }

    resultsEl.innerHTML = '';

    // Basic validation before we enter the waiting state
    if (!sourceId) { resultsEl.innerHTML = '<p class="error">Please provide the source ID.</p>'; return; }

    let timeoutHandle = null;
    try {
      // Additional cross-mode token validation
      if (mode === 'snippets') {
        if (!ghToken || !glToken) { resultsEl.innerHTML = '<p class="error">Please provide both GitHub and GitLab tokens.</p>'; return; }
      } else {
        if (!glToken || !ghToken) { resultsEl.innerHTML = '<p class="error">Please provide both GitLab and GitHub tokens.</p>'; return; }
      }

      // Enter waiting state and disable button
      if (convertBtn) {
        convertBtn.disabled = true;
        convertBtn.classList.add('is-disabled');
      }
      resultsEl.innerHTML = '<p class="waiting">Conversion in progress… please wait. Do not close this page.</p>';

      // Auto re-enable after the 30s if still waiting
      timeoutHandle = setTimeout(() => {
        if (convertBtn) {
          convertBtn.disabled = false;
          convertBtn.classList.remove('is-disabled');
        }
        if (resultsEl && resultsEl.querySelector('.waiting')) {
          resultsEl.innerHTML = '<p class="error">30 seconds passed without a response. Please try again.</p>';
        }
      }, 30000);
      if (mode === 'snippets') {
        const gist = await fetchGist(sourceId, ghToken);
        const fileEntries = Object.entries(gist.files || {});
        if (fileEntries.length === 0) { resultsEl.innerHTML = '<p class="error">This Gist has no files.</p>'; return; }

        // Collect all files with content
        const filesWithContent = [];
        for (const [filename, fileInfo] of fileEntries) {
          const content = await fetchGistFileContent(sourceId, filename, ghToken, fileInfo);
          filesWithContent.push({ file_path: filename, content });
        }

        // Chunk into groups of up to 10 files per GitLab snippet
        const chunks = chunkArray(filesWithContent, 10);
        const created = [];
        let part = 1;
        const totalParts = chunks.length;
        for (const chunk of chunks) {
          const baseTitle = gist.description || 'from-gist';
          const title = totalParts > 1 ? `${baseTitle} (part ${part}/${totalParts})` : baseTitle;
          const snippet = await createGitLabSnippetMulti({
            token: glToken,
            title,
            files: chunk,
            visibility,
          });
          created.push(snippet);
          part++;
        }

        resultsEl.innerHTML = `<h3>Created GitLab Snippet(s)</h3>` + created.map(s => {
          const url = s.web_url || s.url || '#';
          const id = s.id || '';
          return `<p>Snippet ${id}: <a target="_blank" href="${url}">${url}</a></p>`;
        }).join('');
      } else {
        const meta = await fetchGitLabSnippetMeta(sourceId, glToken);

        // If multi-file info is present, fetch all files. Otherwise, fallback to a single raw endpoint
        let files = {};
        if (Array.isArray(meta.files) && meta.files.length > 0) {
          const usedNames = new Map();
          for (const f of meta.files) {
            const originalPath = f.file_path || f.path || f.file_name || 'file.txt';
            let raw;
            try {
              raw = await fetchGitLabSnippetFileRaw(sourceId, originalPath, glToken);
            } catch (err) {
              const status = err && (err.status || (/\b(\d{3})\b/.exec(String(err.message || '')) || [])[1]);
              const is404 = String(status) === '404' || String(err && err.message || '').includes('404');
              if (is404) {
                if (Array.isArray(meta.files) && meta.files.length === 1) {
                  // Single-file snippet: fallback to the whole snippet raw content
                  raw = await fetchGitLabSnippetRaw(sourceId, glToken);
                } else {
                  // Multi-file snippet: avoid web raw_url due to CORS; rely on API-only fallbacks
                  console.warn(`Skipping missing file in GitLab snippet: ${originalPath} (404). API per-file and alt raw attempts failed; web raw_url is blocked by CORS in browsers.`);
                  continue;
                }
              } else {
                resultsEl.innerHTML = `<p class="error">Failed to fetch a file from the GitLab snippet (${sanitizeGistFileName(originalPath)}): ${err && err.message ? String(err.message) : 'Unknown error'}</p>`;
                return;
              }
            }
            let sanitized = sanitizeGistFileName(originalPath);
            // deduplicate if name collision after sanitization
            if (usedNames.has(sanitized)) {
              const count = usedNames.get(sanitized) + 1;
              usedNames.set(sanitized, count);
              const dot = sanitized.lastIndexOf('.');
              if (dot > 0) {
                sanitized = `${sanitized.slice(0, dot)}_${count}${sanitized.slice(dot)}`;
              } else {
                sanitized = `${sanitized}_${count}`;
              }
            } else {
              usedNames.set(sanitized, 0);
            }
            files[sanitized] = { content: raw };
          }
          // If after attempts no files were gathered, try a final fallback or error
          if (Object.keys(files).length === 0) {
            if (Array.isArray(meta.files) && meta.files.length === 1) {
              const content = await fetchGitLabSnippetRaw(sourceId, glToken);
              const fileName = meta.files[0].file_name || meta.files[0].file_path || 'snippet.txt';
              files[sanitizeGistFileName(fileName)] = { content };
            } else {
              resultsEl.innerHTML = '<p class="error">No files could be fetched from this GitLab snippet (file endpoints returned 404).</p>'; return;
            }
          }
        } else {
          const content = await fetchGitLabSnippetRaw(sourceId, glToken);
          const fileName = meta.file_name || 'snippet.txt';
          files[fileName] = { content };
        }

        const gist = await createGist({
          token: ghToken,
          description: meta.title || `Imported from GitLab Snippet #${sourceId}`,
          files,
          public: visibility === 'public',
        });

        const url = gist.html_url || gist.url;
        resultsEl.innerHTML = `<h3>Created GitHub Gist</h3><p><a target="_blank" href="${url}">${url}</a></p>`;
      }
    } catch (e) {
      console.error(e);
      resultsEl.innerHTML = `<p class="error">${e.message || 'Conversion failed.'}</p>`;
    } finally {
      if (timeoutHandle) {
        try { clearTimeout(timeoutHandle); } catch (_) {}
      }
      if (convertBtn) {
        convertBtn.disabled = false;
        convertBtn.classList.remove('is-disabled');
      }
      const waitingEl = resultsEl ? resultsEl.querySelector('.waiting') : null;
      if (waitingEl && waitingEl.parentNode) {
        waitingEl.parentNode.removeChild(waitingEl);
      }
    }
  }

  /** @returns {Promise<Gist>} */
  async function fetchGist(id, token) {
    const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(id)}`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) throw new Error(`GitHub Gist fetch failed: ${res.status}`);
    return res.json();
  }

  // CORS-safe retrieval of Gist file content without using raw_url
  async function fetchGistFileContent(gistId, fileName, token, fileInfo) {
    // If content is already present and not truncated, use it
    if (fileInfo && typeof fileInfo.content === 'string' && !fileInfo.truncated) {
      return fileInfo.content;
    }
    // Re-fetch the gist to try to get inline content
    const gist = await fetchGist(gistId, token);
    const file = gist?.files?.[fileName];
    if (file && typeof file.content === 'string' && !file.truncated) {
      return file.content;
    }
    // At this point, the file is likely too large, and the API provides only a truncated preview.
    // Fetching raw_url would require CORS to gist.githubusercontent.com which blocks preflight, so inform the user.
    throw new Error('This Gist file content is not available inline (likely too large/truncated). Browser-only fetch cannot access the raw URL due to CORS. Consider reducing file size, using a different network/origin setup, or a small server-side proxy.');
  }



  /** @returns {Promise<GitLabSnippetMeta>} */
  async function fetchGitLabSnippetMeta(id, token) {
    const res = await fetch(`https://gitlab.com/api/v4/snippets/${encodeURIComponent(id)}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`GitLab snippet fetch failed: ${res.status}`);
    return res.json();
  }

  async function fetchGitLabSnippetRaw(id, token) {
    const res = await fetch(`https://gitlab.com/api/v4/snippets/${encodeURIComponent(id)}/raw`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) throw new Error(`GitLab snippet raw fetch failed: ${res.status}`);
    return res.text();
  }

  // Fetch raw content of a specific file in a multi-file GitLab snippet
  async function fetchGitLabSnippetFileRaw(id, filePath, token) {
    // Prefer API forms that support CORS in browsers. Avoid the noisy per-file endpoint
    // /api/v4/snippets/:id/files/:path/raw which often returns 404 for personal snippets.
    const single = encodeURIComponent(filePath);
    const doubled = encodeURIComponent(single); // try both encodings

    const encodings = doubled !== single ? [doubled, single] : [single];
    const refs = ['main', 'master', undefined];

    const attempts = [];
    const seen = new Set();

    // 1) API whole-snippet raw with a file_path query
    const baseRaw = `https://gitlab.com/api/v4/snippets/${encodeURIComponent(id)}/raw`;
    for (const enc of encodings) {
      for (const ref of refs) {
        const url = ref
          ? `${baseRaw}?file_path=${enc}&ref=${encodeURIComponent(ref)}`
          : `${baseRaw}?file_path=${enc}`;
        if (!seen.has(url)) {
          seen.add(url);
          attempts.push(url);
        }
      }
    }

    // 2) Repository files API via the snippet repository
    const projectIdPath = encodeURIComponent(`snippets/${id}`); // encodes the slash
    const repoBase = `https://gitlab.com/api/v4/projects/${projectIdPath}/repository/files/`;
    for (const enc of encodings) {
      for (const ref of refs) {
        const url = ref
          ? `${repoBase}${enc}/raw?ref=${encodeURIComponent(ref)}`
          : `${repoBase}${enc}/raw`;
        if (!seen.has(url)) {
          seen.add(url);
          attempts.push(url);
        }
      }
    }

    for (const url of attempts) {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/plain, */*',
        },
      });
      if (res.ok) {
        return res.text();
      }
      // Only continue to the next attempt on 404/400; other statuses should surface immediately
      if (res.status && res.status !== 404 && res.status !== 400) {
        const text = await res.text().catch(() => '');
        const err = new Error(`GitLab snippet file raw fetch failed for ${filePath}: ${res.status} ${text}`);
        err.status = res.status;
        err.url = url;
        throw err;
      }
    }
    const notFoundErr = new Error(`GitLab snippet file raw fetch failed for ${filePath}: 404`);
    notFoundErr.status = 404;
    throw notFoundErr;
  }

  // Sanitize GitLab snippet file paths to valid Gist filenames (no directories)
  function sanitizeGistFileName(path) {
    const replaced = String(path).replace(/[\\/]+/g, '__').trim();
    return replaced || 'file.txt';
  }

  /** @returns {Promise<CreatedGist>} */
  async function createGist({ token, description, files, public: isPublic }) {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description, files, public: !!isPublic }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub create gist failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  // Helpers for multi-file GitLab snippets
  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  /** @returns {Promise<GitLabSnippetMeta>} */
  async function createGitLabSnippetMulti({ token, title, files, visibility }) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('No files to create in GitLab snippet.');
    }
    const payload = {
      title: title || 'from-gist',
      visibility: visibility || 'private',
      files: files.map(f => ({ file_path: f.file_path, content: f.content }))
    };
    const res = await fetch('https://gitlab.com/api/v4/snippets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitLab create multi-file snippet failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  // Theme switcher
  const themeBtn = document.getElementById('theme-switcher');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      if (next) {
        document.documentElement.setAttribute('data-theme', next);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    });
  }

  // Initial render
  renderSelection();
  renderConvertButton();
  modeSelect.addEventListener('change', () => {
    renderSelection();
  });
});
})();
