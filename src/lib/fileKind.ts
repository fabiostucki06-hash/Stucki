export type FileKind = 'image' | 'pdf' | 'other';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

export function getFileKind(name: string): FileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return 'other';
}
