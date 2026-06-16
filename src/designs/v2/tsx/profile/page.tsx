'use client'

/**
 * /profile — v2 design
 * Softer: 1px line borders, inset bg for inputs, iOS-style toggle
 * Real data: useProfile / useSaveProfile
 */

import { useEffect, useState } from 'react'
import { Avatar } from '@/features/encounter/Avatar'
import { AvatarEditor } from '@/features/profile/AvatarEditor'
import { PrefectureSelect } from '@/features/profile/PrefectureSelect'
import { useProfile, useSaveProfile } from '@/features/profile/queries'

const NAME_MAX = 10
const MESSAGE_MAX = 30

function FieldLabel({ label, optional = false }: { label: string; optional?: boolean }) {
  return (
    <div className="v2p-label mb-2 flex items-center gap-1.5">
      <span className="v2p-label-jp">{label}</span>
      {optional ? <span className="v2p-label-opt">任意</span> : null}
    </div>
  )
}

function ToggleRow({
  id, name, desc, on, onChange,
}: { id: string; name: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="v2p-setting-row flex items-center justify-between gap-3 py-3">
      <div>
        <div className="v2p-setting-name" id={id}>{name}</div>
        <div className="v2p-setting-desc mt-px">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={id}
        className={`v2p-toggle relative shrink-0 ${on ? 'is-on' : ''}`}
        onClick={() => onChange(!on)}
      >
        <span className="v2p-toggle-knob absolute" />
      </button>
    </div>
  )
}

export default function ProfilePage() {
  const profile = useProfile()
  const saveProfile = useSaveProfile()

  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [prefecture, setPrefecture] = useState<string | null>(null)
  const [avatarCode, setAvatarCode] = useState('b01_h01_o01_f01')
  const [soundOn, setSoundOn] = useState(true)
  const [vibrationOn, setVibrationOn] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (profile.data && !initialized) {
      setName(profile.data.display_name ?? '')
      setMessage(profile.data.message ?? '')
      setPrefecture(profile.data.home_prefecture ?? null)
      setAvatarCode(profile.data.avatar_code ?? 'b01_h01_o01_f01')
      setInitialized(true)
    }
  }, [profile.data, initialized])

  const handleSave = () => {
    saveProfile.mutate({
      display_name: name,
      avatar_code: avatarCode,
      message,
      home_prefecture: prefecture,
    })
  }

  const saved = saveProfile.isSuccess

  return (
    <div className="v2p-root min-h-screen">
      <style>{`
        .v2p-root {
          --bg:      #F4EFE4;
          --surface: #FDFBF5;
          --inset:   #EDE7D8;
          --line:    #E2DBC9;
          --text:    #3E3A32;
          --muted:   #8D8674;
          --accent:  #C95B38;
          --lcd:     #C8CFA6;

          font-family: var(--font-rounded);
          color: var(--text);
          background: var(--bg);
        }

        .v2p-header {
          position: sticky; top: 0; z-index: 20;
          background: var(--bg);
          border-bottom: 1px solid var(--line);
        }
        .v2p-back {
          display: flex; align-items: center; gap: 5px; width: 64px;
          font-size: 13px; font-weight: 500; color: var(--muted);
          text-decoration: none;
        }
        .v2p-back:active { opacity: 0.6; }
        .v2p-title { font-size: 14px; font-weight: 700; }

        .v2p-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          overflow: hidden;
        }
        .v2p-card-head { border-bottom: 1px solid var(--line); }
        .v2p-card-head-title { font-size: 15px; font-weight: 700; }
        .v2p-card-head-sub { font-size: 11px; color: var(--muted); margin-top: 3px; }

        .v2p-label { display: flex; align-items: baseline; gap: 8px; }
        .v2p-label-jp { font-size: 12px; font-weight: 700; color: var(--muted); }
        .v2p-label-opt {
          font-size: 10px; font-weight: 400; color: var(--muted);
        }

        .v2p-avatar-frame {
          flex: none; width: 80px; height: 80px;
          display: grid; place-items: center;
          background: var(--lcd); border-radius: 14px;
        }
        .v2p-avatar-code {
          font-family: var(--font-mono); font-size: 11px;
          color: var(--muted); letter-spacing: 0.04em;
        }
        .v2p-btn-customize {
          margin-top: 8px;
          display: inline-flex; align-items: center;
          background: var(--inset); color: var(--text);
          border: none; border-radius: 10px;
          padding: 8px 14px;
          font-family: var(--font-rounded); font-size: 12px; font-weight: 700;
          cursor: pointer;
          transition: opacity 100ms ease;
        }
        .v2p-btn-customize:active { opacity: 0.7; }

        .v2p-input {
          width: 100%;
          font-family: var(--font-rounded);
          font-size: 15px; font-weight: 500; color: var(--text);
          background: var(--inset);
          border: 1px solid transparent; border-radius: 12px;
          padding: 12px 14px;
          outline: none;
          transition: border-color 120ms ease, background-color 120ms ease;
        }
        .v2p-input::placeholder { color: var(--muted); font-weight: 400; opacity: 0.7; }
        .v2p-input:focus { background: var(--surface); border-color: var(--muted); }
        .v2p-counter {
          display: block; text-align: right; margin-top: 5px;
          font-family: var(--font-mono); font-size: 10px;
          color: var(--muted); opacity: 0.8;
        }
        .v2p-counter.is-max { color: var(--accent); opacity: 1; }

        .v2p-settings { background: var(--inset); border-radius: 12px; padding: 2px 14px; }
        .v2p-setting-row + .v2p-setting-row { border-top: 1px solid var(--line); }
        .v2p-setting-name { font-size: 13px; font-weight: 500; }
        .v2p-setting-desc { font-size: 10px; color: var(--muted); }

        /* iOS-style pill toggle */
        .v2p-toggle {
          flex: none; width: 48px; height: 28px;
          border: none; border-radius: 999px;
          background: var(--line);
          cursor: pointer; padding: 0;
          transition: background-color 150ms ease;
        }
        .v2p-toggle.is-on { background: var(--accent); }
        .v2p-toggle-knob {
          position: absolute; top: 3px; left: 3px;
          width: 22px; height: 22px;
          background: var(--surface);
          border-radius: 50%;
          box-shadow: 0 1px 2px rgba(62,58,50,0.20);
          transition: left 150ms ease;
        }
        .v2p-toggle.is-on .v2p-toggle-knob { left: 23px; }

        .v2p-btn-save {
          width: 100%;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--accent); color: #FFFDF8;
          border: none; border-radius: 13px;
          padding: 15px;
          font-family: var(--font-rounded); font-size: 15px; font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(201,91,56,0.25);
          transition: opacity 100ms ease, transform 100ms ease;
        }
        .v2p-btn-save:active { opacity: 0.85; transform: scale(0.99); }
        .v2p-btn-save.is-saved { background: #5D8A5E; box-shadow: 0 2px 8px rgba(93,138,94,0.25); }
      `}</style>

      {/* header */}
      <header className="v2p-header">
        <div className="mx-auto flex max-w-[448px] items-center justify-between px-4 py-3">
          <a className="v2p-back" href="/designs/v2">← もどる</a>
          <div className="v2p-title">プロフィール</div>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-[448px] px-4 pb-14 pt-5">
        <div className="v2p-card">
          <div className="v2p-card-head px-4 py-4">
            <div className="v2p-card-head-title">キャラクター登録</div>
            <div className="v2p-card-head-sub">すれちがいで配られる、あなたのカードです</div>
          </div>

          <div className="flex flex-col gap-6 p-4">

            {/* avatar */}
            <section>
              <FieldLabel label="アバター" />
              <div className="flex items-center gap-3.5">
                <div className="v2p-avatar-frame shrink-0">
                  <Avatar code={avatarCode} size={72} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="v2p-avatar-code">{avatarCode}</div>
                  <button type="button" className="v2p-btn-customize" onClick={() => setEditorOpen((v) => !v)}>
                    カスタマイズ
                  </button>
                </div>
              </div>
              {editorOpen ? <div className="mt-2.5"><AvatarEditor value={avatarCode} onChange={setAvatarCode} /></div> : null}
            </section>

            {/* name */}
            <section>
              <FieldLabel label="名前" />
              <input
                className="v2p-input"
                type="text"
                value={name}
                maxLength={NAME_MAX}
                placeholder="れい：ぴかまる"
                onChange={(e) => setName(e.target.value)}
              />
              <span className={`v2p-counter ${name.length >= NAME_MAX ? 'is-max' : ''}`}>
                {name.length}/{NAME_MAX}
              </span>
            </section>

            {/* message */}
            <section>
              <FieldLabel label="ひとこと" />
              <input
                className="v2p-input"
                type="text"
                value={message}
                maxLength={MESSAGE_MAX}
                placeholder="れい：よろしくおねがいします！"
                onChange={(e) => setMessage(e.target.value)}
              />
              <span className={`v2p-counter ${message.length >= MESSAGE_MAX ? 'is-max' : ''}`}>
                {message.length}/{MESSAGE_MAX}
              </span>
            </section>

            {/* prefecture */}
            <section>
              <FieldLabel label="出身地" optional />
              <PrefectureSelect value={prefecture} onChange={setPrefecture} />
            </section>

            {/* settings */}
            <section>
              <FieldLabel label="システム設定" />
              <div className="v2p-settings">
                <ToggleRow
                  id="v2p-sound" name="効果音"
                  desc="すれちがい時にピロリン♪と鳴ります"
                  on={soundOn} onChange={setSoundOn}
                />
                <ToggleRow
                  id="v2p-vibration" name="振動"
                  desc="ポケットの中でも気づけます"
                  on={vibrationOn} onChange={setVibrationOn}
                />
              </div>
            </section>

            {/* save */}
            <button
              type="button"
              className={`v2p-btn-save ${saved ? 'is-saved' : ''}`}
              onClick={handleSave}
              disabled={saveProfile.isPending}
            >
              {saved ? '保存しました ✓' : saveProfile.isPending ? '保存中…' : '保存する'}
            </button>

          </div>
        </div>
      </main>
    </div>
  )
}
