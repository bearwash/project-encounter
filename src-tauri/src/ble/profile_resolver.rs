//! Mock profile resolver — Supabase 連携の代用。
//!
//! BLE Scan で受信した user_id に対して "向こうのプロフィール" を返す。
//! 本番では Supabase の `profiles` テーブルから取得する処理に置き換わる予定。
//! spec: docs/specs/profile-sync.md §5.4
//!
//! user_id をシードに決定論的に display_name / avatar_code / message を返す
//! ため、再起動しても同じユーザーには同じ姿が当てられる。
//! ※ mock で生成されたユーザーは、現実には Supabase に登録されていないので
//!   Phase 2 で本物の fetch に置き換える際にここを差し替える。

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockProfile {
    pub user_id: String,
    pub display_name: String,
    pub avatar_code: String,
    pub message: String,
}

const NAMES: &[&str] = &[
    "Neko-9", "Riku", "sora", "Pixel.42", "mion", "zoo", "Hex", "もも", "はる", "たくみ", "Aoba",
    "Lin", "Yui", "Kai", "のあ", "Rio",
];

const MESSAGES: &[&str] = &[
    "最近はRust勉強中！",
    "こんにちは",
    "散歩中です",
    "今日は寒い",
    "すれ違いテスト",
    "ねむい",
    "公園にいます",
    "コーヒー飲みたい",
    "",
];

/// user_id をシードに決定論的にプロフィールを生成する。
/// 同じ user_id は再起動後も同じ姿になる。
pub fn resolve(user_id: Uuid) -> MockProfile {
    let bytes = user_id.as_bytes();
    let name_idx = bytes[0] as usize % NAMES.len();
    let msg_idx = bytes[1] as usize % MESSAGES.len();
    let b = (bytes[2] as usize % 4) + 1;
    let h = (bytes[3] as usize % 4) + 1;
    let o = (bytes[4] as usize % 4) + 1;
    let f = (bytes[5] as usize % 4) + 1;
    let suffix = bytes[6] % 100;

    MockProfile {
        user_id: user_id.to_string(),
        display_name: format!("{}#{:02}", NAMES[name_idx], suffix),
        avatar_code: format!("b{:02}_h{:02}_o{:02}_f{:02}", b, h, o, f),
        message: MESSAGES[msg_idx].to_string(),
    }
}
