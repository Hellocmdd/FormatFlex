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
  outputs?: string[];
  text?: string;
}
