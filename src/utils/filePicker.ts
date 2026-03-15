import { open, save } from '@tauri-apps/plugin-dialog';

const WINDOWS_ABS_PATH = /^[A-Za-z]:[\\/]/;

const isAbsolutePath = (value: string): boolean =>
  value.startsWith('/') || WINDOWS_ABS_PATH.test(value);

const normalizePathLike = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const maybePath = (value as { path?: unknown }).path;
    if (typeof maybePath === 'string') return maybePath;
  }
  return '';
};

/**
 * Try to resolve a native absolute path from antd Upload file objects.
 * Falls back to empty string when browser fake paths are encountered.
 */
export const getNativeUploadPath = (file: unknown): string => {
  const f = file as any;
  const candidates = [
    f?.path,
    f?.originFileObj?.path,
    f?.originFileObj?.filepath,
  ];

  for (const raw of candidates) {
    const path = normalizePathLike(raw).trim();
    if (!path) continue;
    if (path.toLowerCase().includes('fakepath')) continue;
    if (!isAbsolutePath(path)) continue;
    return path;
  }

  return '';
};

export const pickSinglePath = async (options: Record<string, unknown>): Promise<string> => {
  const selected = await open({ ...options, multiple: false } as any);
  if (!selected) return '';
  if (Array.isArray(selected)) {
    return normalizePathLike(selected[0]);
  }
  return normalizePathLike(selected);
};

export const pickMultiplePaths = async (options: Record<string, unknown>): Promise<string[]> => {
  const selected = await open({ ...options, multiple: true } as any);
  if (!selected) return [];
  const values = Array.isArray(selected) ? selected : [selected];
  return values
    .map((item) => normalizePathLike(item))
    .filter((path) => Boolean(path));
};

export const ensureSingleLocalPath = async (
  file: unknown,
  pickerOptions: Record<string, unknown>,
): Promise<string> => {
  const direct = getNativeUploadPath(file);
  if (direct) return direct;
  return pickSinglePath(pickerOptions);
};

export const pickSavePath = async (options: Record<string, unknown>): Promise<string> => {
  const selected = await save({ ...options } as any);
  if (!selected) return '';
  return normalizePathLike(selected);
};

export const ensureMultipleLocalPaths = async (
  file: unknown,
  pickerOptions: Record<string, unknown>,
): Promise<string[]> => {
  const direct = getNativeUploadPath(file);
  if (direct) return [direct];
  return pickMultiplePaths(pickerOptions);
};
