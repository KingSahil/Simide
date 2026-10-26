import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as zlib from 'zlib';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  auditCppSourceSafety,
  isPathSafe,
  LoadedTutorial,
  SecurityAuditResult,
  TutorialLesson,
  TutorialManifest,
  validateTutorialManifest,
} from './tutorialModel';

const execFileAsync = promisify(execFile);

export interface GitHubRepoRef {
  owner: string;
  repo: string;
  ref: string;
}

export interface ImportResult {
  success: boolean;
  tutorial?: LoadedTutorial;
  securityAudit?: SecurityAuditResult;
  error?: string;
}

export class TutorialManager {
  private static activeTutorial: LoadedTutorial | null = null;

  public static getActiveTutorial(): LoadedTutorial | null {
    return this.activeTutorial;
  }

  public static setActiveTutorial(tutorial: LoadedTutorial | null): void {
    this.activeTutorial = tutorial;
  }

  /**
   * Parse GitHub URL or shorthand (e.g. "owner/repo", "https://github.com/owner/repo/tree/dev")
   */
  public static parseGitHubUrl(input: string): GitHubRepoRef | null {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim().replace(/\.git$/, '');

    // Pattern 1: https://github.com/owner/repo(/tree/ref)?
    const urlMatch = clean.match(/^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/tree\/([a-zA-Z0-9_.-]+))?\/?$/);
    if (urlMatch) {
      return {
        owner: urlMatch[1],
        repo: urlMatch[2],
        ref: urlMatch[3] || 'main',
      };
    }

    // Pattern 2: owner/repo(#ref)?
    const shortMatch = clean.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:#([a-zA-Z0-9_.-]+))?$/);
    if (shortMatch) {
      return {
        owner: shortMatch[1],
        repo: shortMatch[2],
        ref: shortMatch[3] || 'main',
      };
    }

    return null;
  }

  public static async getGitHubToken(): Promise<string | null> {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
    try {
      const { stdout } = await execFileAsync('gh', ['auth', 'token'], { timeout: 3000 });
      const token = stdout.trim();
      if (token) return token;
    } catch {
      // gh not available or not logged in
    }
    return null;
  }

  /**
   * Downloads a buffer from a URL following HTTP 301/302 redirects.
   */
  public static async fetchBufferWithRedirects(
    url: string,
    maxRedirects = 5,
    token?: string | null
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (maxRedirects < 0) {
        return reject(new Error('Too many HTTP redirects.'));
      }

      const headers: Record<string, string> = {
        'User-Agent': 'SimIDE-Tutorial-Importer/1.0',
        Accept: 'application/vnd.github.v3+json, application/octet-stream',
      };

      try {
        const parsedUrl = new URL(url);
        if (token && (parsedUrl.hostname === 'api.github.com' || parsedUrl.hostname === 'github.com')) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      } catch {
        // ignore url parse error
      }

      const req = https.get(
        url,
        {
          headers,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return resolve(this.fetchBufferWithRedirects(res.headers.location, maxRedirects - 1, token));
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`GitHub request failed with HTTP ${res.statusCode}: ${res.statusMessage}`));
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', (err) => reject(err));
        }
      );

      req.on('error', (err) => reject(err));
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Network timeout while connecting to GitHub.'));
      });
    });
  }

  /**
   * Extracts a .tar buffer into the destination directory.
   * Strips the GitHub root folder (e.g. "owner-repo-commit/").
   */
  public static extractTar(tarBuffer: Buffer, destDir: string): void {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    let offset = 0;
    while (offset < tarBuffer.length - 512) {
      const header = tarBuffer.subarray(offset, offset + 512);
      // Check for two consecutive null blocks signaling end of archive
      if (header.every((b) => b === 0)) break;

      // Extract filename (bytes 0 - 99)
      let name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '').trim();
      // Prefix (bytes 345 - 499)
      const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '').trim();
      if (prefix) {
        name = `${prefix}/${name}`;
      }

      // Size in octal (bytes 124 - 135)
      const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
      const size = parseInt(sizeStr, 8) || 0;

      // Type flag (byte 156)
      const typeFlag = String.fromCharCode(header[156]);

      offset += 512;
      const fileData = tarBuffer.subarray(offset, offset + size);
      offset += Math.ceil(size / 512) * 512;

      if (!name) continue;

      // Strip GitHub's top-level archive directory (e.g. "owner-repo-abcdef/")
      const segments = name.split('/').filter(Boolean);
      if (segments.length <= 1) continue; // Root directory itself
      const relativePath = segments.slice(1).join('/');

      if (!isPathSafe(relativePath)) continue;

      const targetPath = path.join(destDir, relativePath);

      if (typeFlag === '5' || name.endsWith('/')) {
        // Directory
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }
      } else {
        // Regular file
        const parentDir = path.dirname(targetPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(targetPath, fileData);
      }
    }
  }

  /**
   * Load and validate a tutorial from an on-disk directory.
   */
  public static async loadFromDirectory(tutorialDir: string): Promise<ImportResult> {
    const manifestPath = path.join(tutorialDir, 'simide.json');
    if (!fs.existsSync(manifestPath)) {
      return {
        success: false,
        error: 'Missing simide.json manifest in repository root.',
      };
    }

    let manifestRaw: any;
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      manifestRaw = JSON.parse(content);
    } catch (e: any) {
      return {
        success: false,
        error: `Invalid JSON in simide.json: ${e.message}`,
      };
    }

    const validation = validateTutorialManifest(manifestRaw);
    if (!validation.valid) {
      return {
        success: false,
        error: `Tutorial manifest errors:\n${validation.errors.join('\n')}`,
      };
    }

    const manifest = manifestRaw as TutorialManifest;

    // Verify all referenced files exist and audit C++ safety
    const allWarnings: string[] = [];
    for (const lesson of manifest.lessons) {
      const codePath = path.join(tutorialDir, lesson.path);
      if (!fs.existsSync(codePath)) {
        return {
          success: false,
          error: `Lesson "${lesson.id}" source file not found: ${lesson.path}`,
        };
      }

      // Check safety of the C++ file
      try {
        const code = fs.readFileSync(codePath, 'utf8');
        const audit = auditCppSourceSafety(code);
        if (!audit.isSafe) {
          allWarnings.push(...audit.warnings.map((w) => `[${lesson.id}] ${w}`));
        }
      } catch {
        // ignore read error
      }

      if (lesson.guide) {
        const guidePath = path.join(tutorialDir, lesson.guide);
        if (!fs.existsSync(guidePath)) {
          return {
            success: false,
            error: `Lesson "${lesson.id}" guide file not found: ${lesson.guide}`,
          };
        }
      }
    }

    const loaded: LoadedTutorial = {
      manifest,
      rootDir: tutorialDir,
      activeLessonId: manifest.lessons[0]?.id,
    };

    this.setActiveTutorial(loaded);

    return {
      success: true,
      tutorial: loaded,
      securityAudit: {
        isSafe: allWarnings.length === 0,
        warnings: allWarnings,
      },
    };
  }

  /**
   * Download repository from GitHub, extract into storage, and load tutorial.
   */
  public static async importFromGitHub(
    repoInput: string,
    storageDir: string
  ): Promise<ImportResult> {
    const repoRef = this.parseGitHubUrl(repoInput);
    if (!repoRef) {
      return {
        success: false,
        error: `Invalid GitHub repository format: "${repoInput}". Expected "owner/repo" or "https://github.com/owner/repo".`,
      };
    }

    const targetDir = path.join(storageDir, 'tutorials', repoRef.owner, repoRef.repo);
    const tarballUrl = `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}/tarball/${repoRef.ref}`;

    try {
      const token = await this.getGitHubToken();
      const gzipBuffer = await this.fetchBufferWithRedirects(tarballUrl, 5, token);
      const tarBuffer = zlib.gunzipSync(gzipBuffer);

      // Clean target directory before extracting
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      this.extractTar(tarBuffer, targetDir);

      const result = await this.loadFromDirectory(targetDir);
      if (result.success && result.tutorial) {
        result.tutorial.sourceUrl = `https://github.com/${repoRef.owner}/${repoRef.repo}`;
      }
      return result;
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to import tutorial from GitHub: ${err.message}`,
      };
    }
  }

  /**
   * Select an active lesson by ID, returning its absolute paths and guide content.
   */
  public static selectLesson(lessonId: string): {
    lesson: TutorialLesson;
    codePath: string;
    guideMarkdown?: string;
  } | null {
    if (!this.activeTutorial) return null;
    const lesson = this.activeTutorial.manifest.lessons.find((l) => l.id === lessonId);
    if (!lesson) return null;

    this.activeTutorial.activeLessonId = lesson.id;
    const codePath = path.join(this.activeTutorial.rootDir, lesson.path);

    let guideMarkdown: string | undefined;
    if (lesson.guide) {
      const guidePath = path.join(this.activeTutorial.rootDir, lesson.guide);
      if (fs.existsSync(guidePath)) {
        try {
          guideMarkdown = fs.readFileSync(guidePath, 'utf8');
        } catch {
          // ignore
        }
      }
    }

    return {
      lesson,
      codePath,
      guideMarkdown,
    };
  }
}
