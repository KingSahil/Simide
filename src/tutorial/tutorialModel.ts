import * as path from 'path';

export type StructureCategory =
  | 'linked_list'
  | 'tree'
  | 'array'
  | 'stack'
  | 'queue'
  | 'graph';

export interface TutorialCompilerOptions {
  standard?: 'c++17' | 'c++20' | 'c++14';
  flags?: string[];
}

export interface TutorialLesson {
  id: string;
  title: string;
  description?: string;
  path: string; // Relative to repository root
  guide?: string; // Relative to repository root (.md)
}

export interface TutorialManifest {
  $schema?: string;
  name: string;
  version: string;
  title: string;
  author?: string;
  description?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  structureType: StructureCategory;
  compiler?: TutorialCompilerOptions;
  lessons: TutorialLesson[];
}

export interface LoadedTutorial {
  manifest: TutorialManifest;
  rootDir: string;
  activeLessonId?: string;
  sourceUrl?: string;
}

export interface TutorialValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SecurityAuditResult {
  isSafe: boolean;
  warnings: string[];
}

/**
 * Validates manifest properties against the SimIDE tutorial contract.
 */
export function validateTutorialManifest(data: any): TutorialValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Manifest must be a valid JSON object.'] };
  }

  if (!data.name || typeof data.name !== 'string' || !/^[a-z0-9_-]+$/.test(data.name)) {
    errors.push('Field "name" is required and must only contain lowercase letters, numbers, underscores, or hyphens.');
  }

  if (!data.version || typeof data.version !== 'string' || !/^\d+\.\d+\.\d+/.test(data.version)) {
    errors.push('Field "version" is required and must follow semantic versioning (e.g. 1.0.0).');
  }

  if (!data.title || typeof data.title !== 'string') {
    errors.push('Field "title" is required and must be a string.');
  }

  const validStructures: StructureCategory[] = [
    'linked_list',
    'tree',
    'array',
    'stack',
    'queue',
    'graph',
  ];
  if (!data.structureType || !validStructures.includes(data.structureType)) {
    errors.push(`Field "structureType" must be one of: ${validStructures.join(', ')}.`);
  }

  if (!Array.isArray(data.lessons) || data.lessons.length === 0) {
    errors.push('Field "lessons" must be a non-empty array of lesson objects.');
  } else {
    data.lessons.forEach((lesson: any, index: number) => {
      const prefix = `lessons[${index}]`;
      if (!lesson.id || typeof lesson.id !== 'string') {
        errors.push(`${prefix}.id is required and must be a string.`);
      }
      if (!lesson.title || typeof lesson.title !== 'string') {
        errors.push(`${prefix}.title is required and must be a string.`);
      }
      if (!lesson.path || typeof lesson.path !== 'string') {
        errors.push(`${prefix}.path is required and must point to a C++ file.`);
      } else if (!isPathSafe(lesson.path)) {
        errors.push(`${prefix}.path contains forbidden path traversal.`);
      } else if (!lesson.path.endsWith('.cpp') && !lesson.path.endsWith('.cc') && !lesson.path.endsWith('.cxx')) {
        errors.push(`${prefix}.path must have a C++ extension (.cpp, .cc, .cxx).`);
      }

      if (lesson.guide && typeof lesson.guide === 'string') {
        if (!isPathSafe(lesson.guide)) {
          errors.push(`${prefix}.guide contains forbidden path traversal.`);
        } else if (!lesson.guide.endsWith('.md')) {
          errors.push(`${prefix}.guide must be a Markdown file (.md).`);
        }
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Ensures a relative path does not escape the repository boundary via `../`.
 */
export function isPathSafe(relPath: string): boolean {
  if (!relPath || typeof relPath !== 'string') return false;
  const normalized = path.normalize(relPath).replace(/\\/g, '/');
  return !normalized.startsWith('..') && !path.isAbsolute(normalized);
}

/**
 * Checks for suspicious C++ headers and syscalls that are unsuitable for educational DSA tutorials.
 */
export function auditCppSourceSafety(sourceCode: string): SecurityAuditResult {
  const warnings: string[] = [];
  const suspiciousPatterns = [
    { pattern: /\b(system|popen|execvp|execlp)\s*\(/, warning: 'Prohibited execution system call detected.' },
    { pattern: /#include\s*<windows\.h>/i, warning: 'Platform-specific <windows.h> header detected.' },
    { pattern: /#include\s*<(sys\/socket\.h|arpa\/inet\.h|winsock2\.h)>/i, warning: 'Network socket header detected.' },
    { pattern: /#include\s*<(unistd\.h|direct\.h)>/i, warning: 'Low-level OS process manipulation header detected.' },
    { pattern: /\b(remove|unlink|rmdir)\s*\(/, warning: 'File deletion API call detected.' },
  ];

  for (const item of suspiciousPatterns) {
    if (item.pattern.test(sourceCode)) {
      warnings.push(item.warning);
    }
  }

  return {
    isSafe: warnings.length === 0,
    warnings,
  };
}
