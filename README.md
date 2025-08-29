# Gists ⇄ Snippets Converter

A simple client‑side web app to convert between GitHub Gists and GitLab Snippets.

No server is used — your Personal Access Tokens (PATs) are only kept in memory in your browser while the page is open.

## Features
- Convert GitHub Gist ➜ GitLab personal Snippet(s)
  - Gists with multiple files are batched into GitLab personal snippets of up to 10 files each (multiple snippets will be created if needed).
- Convert GitLab personal Snippet ➜ GitHub Gist
  - Supports multi-file snippets: fetches all files and creates a single multi-file Gist. If files are in folders, folder separators are replaced with "__" in Gist filenames. The created Gist will be public or secret based on your selection.
- Basic error handling and direct links to the created items.

## Permissions (Tokens)
Provide tokens directly in the page when prompted:
- GitHub token: scope `gist`
- GitLab token: scope `api`

Tokens are never stored or transmitted anywhere except directly to the respective official APIs from your browser.

## Usage
1. Open `src/pages/index.html` in your browser (or host the repository with any static server).
2. Choose a conversion mode:
   - "GitHub Gists to GitLab Snippets"
   - "GitLab Snippets to GitHub Gists"
3. Paste the required source ID (Gist ID or Snippet ID).
4. Paste both tokens (GitHub + GitLab).
5. Pick visibility on the destination side.
6. Click "Convert" and follow the link(s) to the created item(s).

## Notes & Limitations
- GitLab personal snippets can include up to 10 files. When converting a multi‑file Gist to GitLab, files are batched into snippets of up to 10 files each (multiple snippets will be created if needed).
- When importing a GitLab snippet to GitHub, the file name comes from the snippet metadata (falls back to `snippet.txt`).
- CORS: Both GitHub and GitLab public APIs support CORS. If you’re using a self‑hosted GitLab instance with custom CORS rules, the app may need to be served from an allowed origin, or a small proxy would be required.
- GitHub Gist raw URLs (gist.githubusercontent.com) may block browser CORS preflight when Authorization headers are present. The app avoids fetching raw_url directly and instead reads file content from the `GET /gists/{id}` response.
- For GitLab multi‑file snippets, if the per‑file Snippets API returns 404 for a valid file path, the app also tries the Repository Files API at `/api/v4/projects/snippets/{id}/repository/files/{file_path}/raw?ref=main|master` using both single and double encoding of the file path.
- Large Gist files may be truncated in the API response, in which case inline content is unavailable. The app will show an error explaining that a smaller file, different hosting/origin setup, or a minimal proxy is required to proceed.

## Development
This project is a static web app. You can use any static server, for example:

```bash
# Using Node (serve) or any other static server of your choice
npx serve .
```

Then open `http://localhost:3000/src/pages/index.html` (path may vary depending on your server setup).

## License
MIT
