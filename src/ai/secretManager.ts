import * as vscode from 'vscode';

export interface AiConfig {
  provider: 'gemini' | 'openai' | 'custom';
  apiKey: string;
  customEndpoint?: string;
  model?: string;
}

export class AiSecretManager {
  private static readonly SECRET_KEY = 'simide.ai.apiKey';
  private static readonly CONFIG_KEY = 'simide.ai.config';

  private inMemorySecrets: Map<string, string> = new Map();

  constructor(
    private readonly secrets?: vscode.SecretStorage,
    private readonly globalState?: vscode.Memento
  ) {}

  public async getApiKey(): Promise<string | undefined> {
    if (this.secrets) {
      try {
        const key = await this.secrets.get(AiSecretManager.SECRET_KEY);
        if (key) return key;
      } catch (err) {
        console.warn('[AiSecretManager] Error reading from SecretStorage:', err);
      }
    }
    return this.inMemorySecrets.get(AiSecretManager.SECRET_KEY);
  }

  public async getConfig(): Promise<AiConfig | null> {
    const key = await this.getApiKey();
    if (!key) return null;

    let parsedConfig: Partial<AiConfig> = {};
    if (this.globalState) {
      parsedConfig = this.globalState.get<Partial<AiConfig>>(AiSecretManager.CONFIG_KEY) || {};
    } else {
      const stored = this.inMemorySecrets.get(AiSecretManager.CONFIG_KEY);
      if (stored) {
        try {
          parsedConfig = JSON.parse(stored);
        } catch {}
      }
    }

    return {
      provider: parsedConfig.provider || 'gemini',
      apiKey: key,
      customEndpoint: parsedConfig.customEndpoint,
      model: parsedConfig.model,
    };
  }

  public async saveConfig(config: AiConfig): Promise<void> {
    const trimmedKey = config.apiKey.trim();
    if (this.secrets) {
      try {
        await this.secrets.store(AiSecretManager.SECRET_KEY, trimmedKey);
      } catch (err) {
        console.warn('[AiSecretManager] Error storing in SecretStorage, using in-memory fallback:', err);
        this.inMemorySecrets.set(AiSecretManager.SECRET_KEY, trimmedKey);
      }
    } else {
      this.inMemorySecrets.set(AiSecretManager.SECRET_KEY, trimmedKey);
    }

    const meta = {
      provider: config.provider,
      customEndpoint: config.customEndpoint?.trim(),
      model: config.model?.trim(),
    };

    if (this.globalState) {
      await this.globalState.update(AiSecretManager.CONFIG_KEY, meta);
    } else {
      this.inMemorySecrets.set(AiSecretManager.CONFIG_KEY, JSON.stringify(meta));
    }
  }

  public async deleteConfig(): Promise<void> {
    if (this.secrets) {
      try {
        await this.secrets.delete(AiSecretManager.SECRET_KEY);
      } catch (err) {
        console.warn('[AiSecretManager] Error deleting from SecretStorage:', err);
      }
    }
    this.inMemorySecrets.delete(AiSecretManager.SECRET_KEY);

    if (this.globalState) {
      await this.globalState.update(AiSecretManager.CONFIG_KEY, undefined);
    } else {
      this.inMemorySecrets.delete(AiSecretManager.CONFIG_KEY);
    }
  }

  public async hasKey(): Promise<boolean> {
    const key = await this.getApiKey();
    return Boolean(key && key.trim().length > 0);
  }
}
