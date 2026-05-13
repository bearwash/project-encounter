// 仕様: docs/specs/encounter-popup.md / encounter-list.md
// 契約: docs/contracts/tauri-commands.md (encounter.*)

export type CachedUser = {
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
  encounter_count: number;
  first_seen_at: number;
  last_seen_at: number;
};

/** 未読の 1 件（ポップアップで順次表示する単位） */
export type UnreadEncounter = {
  log_id: number;
  encountered_at: number;
  user: CachedUser;
};

/** 履歴リストの 1 行 */
export type HistoryItem = CachedUser & {
  last_encountered_at: number;
};
