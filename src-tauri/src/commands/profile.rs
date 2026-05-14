//! Profile resolution commands.
//! 契約: docs/contracts/tauri-commands.md (`profile.fetch_remote`)
//!
//! 本フェーズでは mock resolver で固定マッピングを返す。Phase 2 で
//! Supabase 連携に置き換えるとき、ここを Rust 側で Supabase REST 叩く
//! 実装か、TS 側で supabase-js を叩く実装に切り替える。

use uuid::Uuid;

use crate::ble::profile_resolver::{resolve, MockProfile};

#[tauri::command]
pub fn profile_fetch_remote(user_id: String) -> Result<Option<MockProfile>, String> {
    let uuid = match Uuid::parse_str(&user_id) {
        Ok(u) => u,
        Err(e) => return Err(format!("invalid user_id: {e}")),
    };
    // mock では「常に取得できる」想定。Supabase 連携時は 404 のとき None を返す。
    Ok(Some(resolve(uuid)))
}
