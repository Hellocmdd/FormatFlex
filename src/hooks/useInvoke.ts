import { invoke } from '@tauri-apps/api/core';

/** Generic Tauri command invoker that serializes params as JSON string. */
export async function invokeCmd<T = unknown>(
  cmd: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const result = await invoke<string>(cmd, { params: JSON.stringify(params) });
  return JSON.parse(result) as T;
}

export interface PyResult {
  success: boolean;
  error?: string;
  output?: string;
  output_dir?: string;
  outputs?: string[];
  success_count?: number;
  fail_count?: number;
  errors?: Array<{ input?: string; error?: string }>;
  info?: Record<string, unknown>;
  source?: string;
  pages?: number;
  images_count?: number;
  images_dir?: string;
  text?: string;
  warnings?: string[];
  config_applied?: Record<string, unknown>;
  capabilities?: Record<string, boolean>;
}
