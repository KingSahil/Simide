import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  auditCppSourceSafety,
  TutorialManifest,
  validateTutorialManifest,
} from '../tutorial/tutorialModel';

const execFileAsync = promisify(execFile);

export interface ValidationSummary {
  success: boolean;
  manifest?: TutorialManifest;
  errors: string[];
  warnings: string[];
  lessonsTested: number;
}

export class TutorialValidator {
  /**
   * Find a suitable C++ compiler.
   */
  public static async findCompiler(): Promise<string | null> {
    const candidates = ['g++', 'clang++', 'gcc'];
    for (const cmd of candidates) {
      try {
        await execFileAsync(cmd, ['--version'], { timeout: 5000 });
        return cmd;
      } catch {
        // try next
      }
    }
    return null;
  }

  /**
   * Validate a tutorial directory completely.
   */
  public static async validateDirectory(rootDir: string = process.cwd()): Promise<ValidationSummary> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let lessonsTested = 0;

    const manifestPath = path.join(rootDir, 'simide.json');
    if (!fs.existsSync(manifestPath)) {
      return {
        success: false,
        errors: [`No simide.json found in ${rootDir}. Ensure you are running this in your tutorial repository root.`],
        warnings: [],
        lessonsTested: 0,
      };
    }

    let manifestRaw: any;
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      manifestRaw = JSON.parse(content);
    } catch (e: any) {
      return {
        success: false,
        errors: [`simide.json contains invalid JSON: ${e.message}`],
        warnings: [],
        lessonsTested: 0,
      };
    }

    const valResult = validateTutorialManifest(manifestRaw);
    if (!valResult.valid) {
      return {
        success: false,
        errors: valResult.errors,
        warnings: [],
        lessonsTested: 0,
      };
    }

    const manifest = manifestRaw as TutorialManifest;

    // Check compiler availability
    const compiler = await this.findCompiler();
    if (!compiler) {
      warnings.push('No C++ compiler (g++, clang++) detected on PATH. Skipping compilation checks.');
    }

    const buildDir = path.join(rootDir, '.simide-build');
    if (compiler && !fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }

    for (const lesson of manifest.lessons) {
      const codePath = path.join(rootDir, lesson.path);
      if (!fs.existsSync(codePath)) {
        errors.push(`Lesson "${lesson.id}": Source file not found: ${lesson.path}`);
        continue;
      }

      // Security check
      const code = fs.readFileSync(codePath, 'utf8');
      const audit = auditCppSourceSafety(code);
      if (!audit.isSafe) {
        warnings.push(...audit.warnings.map((w) => `[${lesson.id}] ${w}`));
      }

      // Guide check
      if (lesson.guide) {
        const guidePath = path.join(rootDir, lesson.guide);
        if (!fs.existsSync(guidePath)) {
          errors.push(`Lesson "${lesson.id}": Guide Markdown file not found: ${lesson.guide}`);
        }
      }

      // Compilation check
      if (compiler) {
        const outExt = process.platform === 'win32' ? '.exe' : '';
        const outBin = path.join(buildDir, `${lesson.id}${outExt}`);
        const std = manifest.compiler?.standard || 'c++17';
        const flags = manifest.compiler?.flags || ['-g', '-O0'];
        const args = [...flags, `--std=${std}`, lesson.path, '-o', outBin];

        try {
          await execFileAsync(compiler, args, { cwd: rootDir, timeout: 30000 });
          lessonsTested++;
        } catch (err: any) {
          const stderr = err.stderr ? err.stderr.toString() : err.message;
          errors.push(`Lesson "${lesson.id}": C++ Compilation failed:\n${stderr}`);
        }
      } else {
        lessonsTested++;
      }
    }

    // Clean up temporary build artifacts
    if (fs.existsSync(buildDir)) {
      try {
        fs.rmSync(buildDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }

    return {
      success: errors.length === 0,
      manifest,
      errors,
      warnings,
      lessonsTested,
    };
  }
}
