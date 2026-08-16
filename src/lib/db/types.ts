export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface ProfileRow {
  id: string;
  email: string | null;
  telegram_id: number | null;
  telegram_username: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettingsRow {
  user_id: string;
  ai_provider: string | null;
  ai_key_enc: string | null;
  ai_model: string | null;
  ai_custom_base_url: string | null;
  ai_mode: string;
  archive_ttl_hours: number | null;
  ui_scale: string;
  updated_at: string;
}

export interface BulkJobRow {
  id: string;
  user_id: string;
  kind: string;
  total: number;
  done: number;
  failed: number;
  status: string;
  created_at: string;
}

export interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  sort_order: number;
  created_at: string;
}

export interface TagRow {
  id: string;
  user_id: string;
  name: string;
  source: string;
  created_at: string;
}

export interface CardRow {
  id: string;
  user_id: string;
  source_type: string;
  primary_type: string;
  source_url: string | null;
  canonical_url: string | null;
  domain: string | null;
  source_chat_id: number | null;
  source_message_id: number | null;
  telegram_message_id: number | null;
  media_group_id: string | null;
  title: string | null;
  text: string | null;
  image_url: string | null;
  duration_seconds: number | null;
  estimated_minutes: number | null;
  status: string;
  defer_until: string | null;
  archived_at: string | null;
  ai_title: string | null;
  ai_summary: string | null;
  ai_status: string;
  ai_folder_id: string | null;
  ai_confidence: number | null;
  ai_tags: Json | null;
  meta_status: string;
  meta_error: string | null;
  embedding: unknown;
  created_at: string;
  updated_at: string;
}

export interface CardFoldersRow {
  card_id: string;
  folder_id: string;
  created_at: string;
}

export interface CardTagsRow {
  card_id: string;
  tag_id: string;
  source: string;
}

export interface AttachmentRow {
  id: string;
  card_id: string;
  type: string;
  telegram_file_id: string | null;
  thumbnail_file_id: string | null;
  storage_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface CardLinkRow {
  id: string;
  card_id: string;
  url: string;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  created_at: string;
}

export interface SwipeActionRow {
  id: string;
  user_id: string;
  card_id: string;
  action: string;
  previous_status: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface PairingCodeRow {
  code: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface MetaCacheRow {
  url_hash: string;
  url: string;
  provider: string | null;
  data: Json;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: ProfileRow };
      user_settings: { Row: UserSettingsRow };
      folders: { Row: FolderRow };
      tags: { Row: TagRow };
      cards: { Row: CardRow };
      card_folders: { Row: CardFoldersRow };
      card_tags: { Row: CardTagsRow };
      attachments: { Row: AttachmentRow };
      card_links: { Row: CardLinkRow };
      swipe_actions: { Row: SwipeActionRow };
      pairing_codes: { Row: PairingCodeRow };
      meta_cache: { Row: MetaCacheRow };
    };
  };
}