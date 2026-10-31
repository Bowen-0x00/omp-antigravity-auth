export interface AccountItem {
  email: string;
  refreshToken: string;
  projectId?: string;
  rawSource?: string;
}

export interface ParseResult {
  accounts: AccountItem[];
  invalidLines: string[];
}

export interface OmpCredential {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  projectId: string;
  email: string;
}

export interface OmpAuthDocument {
  version: 1;
  credentials: Array<{
    provider: "google-antigravity";
    credential: OmpCredential;
  }>;
}

export interface ImportOptions {
  projectId?: string;
  dryRun?: boolean;
  verify?: boolean;
}

export interface ImportResult {
  total: number;
  imported: number;
  accounts: AccountItem[];
  output?: string;
  success: boolean;
  error?: string;
}

declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }
}
