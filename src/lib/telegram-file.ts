export const PLACEHOLDER_IMAGE_URL = "https://via.placeholder.com/300";

export async function resolveFileUrl(
  fileId: string | undefined,
  token: string | undefined
): Promise<string | null> {
  if (!fileId || !token) return null;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const json = await res.json();
    if (!json.ok || !json.result?.file_path) return null;
    return `/api/file?path=${encodeURIComponent(json.result.file_path)}`;
  } catch (e) {
    console.error("getFile error:", e);
    return null;
  }
}

export function isPlaceholderImage(url: string | undefined): boolean {
  return !url || url === PLACEHOLDER_IMAGE_URL;
}