import { AiConfig } from './secretManager';

export interface AiPromptContext {
  problemStatement: string;
  promptType: 'hint' | 'explain' | 'solve' | 'custom';
  userMessage?: string;
  activeCode?: string;
  fileName?: string;
  visualSnapshotSummary?: string;
  terminalOutput?: string;
}

export class AiService {
  private static readonly DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
  private static readonly DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

  /**
   * Ping provider endpoint with a trivial prompt to verify credentials
   */
  public static async testKey(config: AiConfig): Promise<{ ok: boolean; message: string }> {
    try {
      if (config.provider === 'gemini') {
        const model = config.model || this.DEFAULT_GEMINI_MODEL;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
        const res = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Hello' }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        }, 12000);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg = (errData as any)?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
          return { ok: false, message: `Google Gemini error: ${msg}` };
        }
        return { ok: true, message: `Connected to Google Gemini (${model}) successfully!` };
      } else {
        // OpenAI or Custom OpenAI-compatible endpoint
        const model = config.model || this.DEFAULT_OPENAI_MODEL;
        let endpoint = config.customEndpoint?.trim();
        if (!endpoint) {
          endpoint = 'https://api.openai.com/v1/chat/completions';
        } else {
          if (!endpoint.endsWith('/chat/completions')) {
            endpoint = `${endpoint.replace(/\/+$/, '')}/chat/completions`;
          }
        }

        const res = await this.fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 5,
          }),
        }, 12000);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg = (errData as any)?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
          return { ok: false, message: `${config.provider === 'custom' ? 'Custom Provider' : 'OpenAI'} error: ${msg}` };
        }
        return { ok: true, message: `Connected to ${config.provider === 'custom' ? 'Custom API' : 'OpenAI'} (${model}) successfully!` };
      }
    } catch (err: any) {
      return { ok: false, message: err.message || 'Network request failed or timed out.' };
    }
  }

  /**
   * Execute full AI inquiry with problem statement, code context, and visual DSA state
   */
  public static async ask(config: AiConfig, context: AiPromptContext): Promise<string> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    if (config.provider === 'gemini') {
      const model = config.model || this.DEFAULT_GEMINI_MODEL;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 2500,
          },
        }),
      }, 35000);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = (errData as any)?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        throw new Error(`Google Gemini Error: ${msg}`);
      }

      const data = await res.json();
      const candidate = (data as any)?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Google Gemini returned an empty response.');
      }
      return text;
    } else {
      // OpenAI or Custom OpenAI-compatible endpoint
      const model = config.model || this.DEFAULT_OPENAI_MODEL;
      let endpoint = config.customEndpoint?.trim();
      if (!endpoint) {
        endpoint = 'https://api.openai.com/v1/chat/completions';
      } else {
        if (!endpoint.endsWith('/chat/completions')) {
          endpoint = `${endpoint.replace(/\/+$/, '')}/chat/completions`;
        }
      }

      const res = await this.fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.35,
          max_tokens: 2500,
        }),
      }, 35000);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = (errData as any)?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        throw new Error(`${config.provider === 'custom' ? 'Custom Provider' : 'OpenAI'} Error: ${msg}`);
      }

      const data = await res.json();
      const content = (data as any)?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('AI Provider returned an empty response.');
      }
      return content;
    }
  }

  private static buildSystemPrompt(): string {
    return [
      'You are the intelligent pedagogical tutor inside Simide (an interactive C++ DSA simulation IDE and Visual Debugger in VS Code).',
      'The learner is building or debugging a C++ data structure algorithm. You receive their target problem statement, active source code, visual snapshot state of their runtime data structures (e.g. linked lists, arrays, stacks, queues, strings, trees, or graphs), and terminal output.',
      'Your goals:',
      '1. Be direct, clear, encouraging, and accurate in modern C++.',
      '2. When the user asks for a HINT or where they are stuck, DO NOT immediately spoil the full answer. Point out what visual invariants are violated or what edge case was missed.',
      '3. When the user asks to EXPLAIN visual state, connect their code execution to what the visual canvas is currently showing.',
      '4. When the user asks for a SOLUTION or fix, provide a complete, robust, cleanly formatted C++ code block (```cpp ... ```) with brief explanation and time/space complexity.',
      '5. Keep your explanations concise, formatted in standard GitHub Markdown.',
    ].join('\n');
  }

  private static buildUserPrompt(context: AiPromptContext): string {
    const parts: string[] = [];

    parts.push(`### Problem Statement:\n${context.problemStatement || '(No problem statement specified by learner)'}\n`);

    if (context.fileName || context.activeCode) {
      parts.push(`### Student's Current C++ Code (${context.fileName || 'source.cpp'}):\n\`\`\`cpp\n${context.activeCode || '// Empty'}\n\`\`\`\n`);
    }

    if (context.visualSnapshotSummary) {
      parts.push(`### Active DSA Visualization State:\n${context.visualSnapshotSummary}\n`);
    }

    if (context.terminalOutput && context.terminalOutput.trim()) {
      parts.push(`### Terminal / Debugger Output:\n\`\`\`\n${context.terminalOutput.trim()}\n\`\`\`\n`);
    }

    if (context.userMessage) {
      parts.push(`### Learner's Question:\n${context.userMessage}\n`);
    }

    let instruction = '';
    switch (context.promptType) {
      case 'hint':
        instruction = 'Instruction: Give me a thoughtful hint. Point out which edge cases, pointer updates, or indices are going wrong based on my current visual state, without giving away the full code solution immediately.';
        break;
      case 'explain':
        instruction = 'Instruction: Explain my current visualization state in relation to the problem. Why do my data structure pointers/elements look like this right now?';
        break;
      case 'solve':
        instruction = 'Instruction: Provide the corrected, complete, and idiomatic C++ code to solve this problem statement properly, along with a concise explanation.';
        break;
      default:
        instruction = 'Instruction: Answer my question accurately and suggest improvements to my C++ implementation.';
    }

    parts.push(instruction);
    return parts.join('\n');
  }

  private static async fetchWithTimeout(url: string, options: any, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (err: any) {
      clearTimeout(id);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw err;
    }
  }
}
