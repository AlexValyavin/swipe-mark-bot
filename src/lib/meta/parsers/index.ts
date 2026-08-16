import type { ParsedMeta } from "./shared";
import { parseYoutube, isYoutubeUrl } from "./youtube";
import { parseInstagram, isInstagramUrl } from "./instagram";
import { parseTiktok, isTiktokUrl } from "./tiktok";
import { parseTwitter, isTwitterUrl } from "./twitter";
import { parseTelegram, isTelegramUrl } from "./telegram";
import { parseGeneric } from "./generic";

export type { ParsedMeta } from "./shared";

export type Provider =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "telegram"
  | "generic";

export function providerForUrl(url: string): Provider {
  if (isYoutubeUrl(url)) return "youtube";
  if (isInstagramUrl(url)) return "instagram";
  if (isTiktokUrl(url)) return "tiktok";
  if (isTwitterUrl(url)) return "twitter";
  if (isTelegramUrl(url)) return "telegram";
  return "generic";
}

export function parseByProvider(provider: Provider, url: string): Promise<ParsedMeta | null> {
  switch (provider) {
    case "youtube":
      return parseYoutube(url);
    case "instagram":
      return parseInstagram(url);
    case "tiktok":
      return parseTiktok(url);
    case "twitter":
      return parseTwitter(url);
    case "telegram":
      return parseTelegram(url);
    default:
      return parseGeneric(url);
  }
}

export async function parseUrl(url: string): Promise<{ provider: Provider; meta: ParsedMeta | null }> {
  const provider = providerForUrl(url);
  const meta = await parseByProvider(provider, url);
  return { provider, meta };
}