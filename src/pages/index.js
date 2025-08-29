(function init() {
  if (typeof document === 'undefined') {
    // Running in a non-browser environment (e.g., Node/SSR). Skip DOM-dependent initialization.
    return;
  }
  document.addEventListener('DOMContentLoaded', () => {
  const modeSelect = document.getElementById('mode');
  const connectContainer = document.querySelector('.connect_accounts');
  const selectContentContainer = document.querySelector('.select_content');
  const mainButtonContainer = document.querySelector('.main_button');

  // Build UI
  connectContainer.innerHTML = `
    <div class="card section">
      <h2>Connect Accounts</h2>
      <p>Provide Personal Access Tokens (PATs). They are kept only in this page (not stored anywhere).</p>
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
          <p class="note">If the Gist has multiple files, one GitLab snippet will be created per file due to GitLab personal snippets limitation.</p>
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
          <p class="note">This supports personal snippets (single-file). If the snippet has multiple files, only the main file content will be migrated via raw endpoint.</p>
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
    const ghToken = document.getElementById('gh_token').value.trim();
    const glToken = document.getElementById('gl_token').value.trim();
    const sourceId = document.getElementById('source_id').value.trim();
    const visibility = document.getElementById('visibility').value;

    const resultsEl = mainButtonContainer.querySelector('.results');
    resultsEl.innerHTML = '';

    try {
      if (!sourceId) throw new Error('Please provide the source ID.');
      if (mode === 'snippets') {
        if (!ghToken || !glToken) throw new Error('Please provide both GitHub and GitLab tokens.');
        const gist = await fetchGist(sourceId, ghToken);
        const fileEntries = Object.entries(gist.files || {});
        if (fileEntries.length === 0) throw new Error('This Gist has no files.');

        const created = [];
        for (const [filename, fileInfo] of fileEntries) {
          const content = await fetchGistFileContent(sourceId, filename, ghToken, fileInfo);
          const title = gist.description || filename;
          const snippet = await createGitLabSnippet({
            token: glToken,
            title,
            file_name: filename,
            content,
            visibility: visibility,
          });
          created.push(snippet);
        }

        resultsEl.innerHTML = `<h3>Created GitLab Snippet(s)</h3>` + created.map(s => {
          const url = s.web_url || s.url || '#';
          const id = s.id || '';
          return `<p>Snippet ${id}: <a target="_blank" href="${url}">${url}</a></p>`;
        }).join('');
      } else {
        if (!glToken || !ghToken) throw new Error('Please provide both GitLab and GitHub tokens.');
        const meta = await fetchGitLabSnippetMeta(sourceId, glToken);
        const content = await fetchGitLabSnippetRaw(sourceId, glToken);

        const files = {};
        const fileName = meta.file_name || 'snippet.txt';
        files[fileName] = { content };

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
    }
  }

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
    // Re-fetch the gist to try to obtain inline content
    const gist = await fetchGist(gistId, token);
    const file = gist?.files?.[fileName];
    if (file && typeof file.content === 'string' && !file.truncated) {
      return file.content;
    }
    // At this point, the file is likely too large and the API provides only a truncated preview.
    // Fetching raw_url would require CORS to gist.githubusercontent.com which blocks preflight, so inform user.
    throw new Error('This Gist file content is not available inline (likely too large/truncated). Browser-only fetch cannot access the raw URL due to CORS. Consider reducing file size, using a different network/origin setup, or a small server-side proxy.');
  }

  async function fetchRaw(url, token) {
    const res = await fetch(url, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Raw content fetch failed: ${res.status}`);
    return res.text();
  }

  async function createGitLabSnippet({ token, title, file_name, content, visibility }) {
    const form = new URLSearchParams();
    form.set('title', title || file_name || 'from-gist');
    form.set('file_name', file_name || 'file.txt');
    form.set('content', content || '');
    form.set('visibility', visibility || 'private');

    const res = await fetch('https://gitlab.com/api/v4/snippets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitLab create snippet failed: ${res.status} ${text}`);
    }
    return res.json();
  }

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
