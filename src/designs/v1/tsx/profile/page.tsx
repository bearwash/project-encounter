'use client'

/**
 * /profile — v1 design
 * 縁日スタンプラリー × Game Boy Pocket — hard borders, physical buttons
 * Real data: useProfile / useSaveProfile
 */

import { useEffect, useState } from 'react'
import { Avatar } from '@/features/encounter/Avatar'
import { AvatarEditor } from '@/features/profile/AvatarEditor'
import { PrefectureSelect } from '@/features/profile/PrefectureSelect'
import { useProfile, useSaveProfile } from '@/features/profile/queries'

const NAME_MAX = 10
const MESSAGE_MAX = 30

function SectionLabel({
  jp, en, tone = 'accent', optional = false,
}: { jp: string; en: string; tone?: 'accent' | 'indigo' | 'lcd'; optional?: boolean }) {
  return (
    <div className={`enc-label enc-label--${tone} mb-2 flex items-baseline gap-2 pl-2`}>
      <span className="enc-label-jp">{jp}</span>
      <span className="enc-label-en">{en}</span>
      {optional ? <span className="enc-label-opt ml-auto">任意</span> : null}
    </div>
  )
}

function ToggleRow({
  id, name, desc, on, onChange,
}: { id: string; name: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="enc-setting-row flex items-center justify-between gap-3 py-3">
      <div>
        <div className="enc-setting-name" id={id}>{name}</div>
        <div className="enc-setting-desc mt-px">{desc}</div>
      </div>
      <button
        type="button" role="switch"
        aria-checked={on} aria-labelledby={id}
        className={`enc-toggle relative shrink-0 ${on ? 'is-on' : ''}`}
        onClick={() => onChange(!on)}
      >
        <span className="enc-toggle-knob absolute" />
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
    saveProfile.mutate({ display_name: name, avatar_code: avatarCode, message, home_prefecture: prefecture })
  }

  const saved = saveProfile.isSuccess

  return (
    <div className="enc-root min-h-screen">
      <style>{`
        .enc-root {
          --paper: #EFE3CB; --paper-dot: #DECBA4;
          --panel: #FFFBF0; --panel-inset: #F6EEDB;
          --ink: #3A332B; --ink-soft: #8A7E6B;
          --accent: #DE4D28; --indigo: #46589B;
          --lcd: #C2CB9D; --lcd-deep: #5D6645; --gold: #E8AE3C;

          font-family: var(--font-rounded);
          color: var(--ink);
          background-color: var(--paper);
          background-image: radial-gradient(var(--paper-dot) 1.5px, transparent 1.5px);
          background-size: 18px 18px;
        }

        .enc-header { background-color: #EFE3CB; border-bottom: 2px solid var(--ink); }
        .enc-title-h1 { font-size: 15px; font-weight: 800; letter-spacing: 0.22em; }
        .enc-title-underline { width: 28px; height: 4px; background: var(--accent); border-radius: 2px; }
        .enc-back { font-size: 13px; font-weight: 700; color: var(--ink); text-decoration: none; }
        .enc-back:active { transform: translateY(1px); }

        .enc-card {
          background: var(--panel);
          border: 2px solid var(--ink); border-radius: 14px;
          box-shadow: 5px 5px 0 0 var(--ink); overflow: hidden;
        }
        .enc-card-head { border-bottom: 2px dashed var(--paper-dot); }
        .enc-card-badge {
          background: var(--gold);
          border: 2px solid var(--ink); border-radius: 10px;
          box-shadow: 3px 3px 0 0 var(--ink);
          font-size: 18px; font-weight: 800;
        }
        .enc-card-head-title { font-size: 16px; font-weight: 800; }
        .enc-card-head-sub { font-size: 11px; font-weight: 500; color: var(--ink-soft); }

        .enc-label { border-left: 3px solid var(--accent); }
        .enc-label--indigo { border-left-color: var(--indigo); }
        .enc-label--lcd { border-left-color: var(--lcd-deep); }
        .enc-label-jp { font-size: 13px; font-weight: 800; }
        .enc-label-en {
          font-family: var(--font-mono); font-size: 10px; font-weight: 600;
          letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-soft);
        }
        .enc-label-opt {
          font-size: 10px; font-weight: 700; color: var(--ink-soft);
          border: 1.5px solid var(--paper-dot); border-radius: 99px; padding: 1px 8px;
        }

        .enc-lcd {
          background: var(--lcd);
          border: 2px solid var(--lcd-deep); border-radius: 12px;
          box-shadow: inset 3px 3px 0 0 rgba(58, 51, 43, 0.18);
        }
        .enc-avatar-frame {
          background: #D4DBB4;
          border: 2px solid var(--lcd-deep); border-radius: 10px; padding: 4px;
        }
        .enc-lcd-code {
          font-family: var(--font-mono); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; color: var(--lcd-deep);
        }
        .enc-lcd-note { font-size: 10px; font-weight: 700; color: var(--lcd-deep); opacity: 0.75; }

        .enc-btn {
          font-family: var(--font-rounded);
          border: 2px solid var(--ink); border-radius: 10px;
          background: var(--panel); color: var(--ink);
          font-size: 13px; font-weight: 800; cursor: pointer;
          box-shadow: 4px 4px 0 0 var(--ink);
          transition: transform 80ms ease, box-shadow 80ms ease;
        }
        .enc-btn:active { transform: translate(3px, 3px); box-shadow: 1px 1px 0 0 var(--ink); }
        .enc-btn--customize { background: var(--gold); }
        .enc-btn--save {
          background: var(--accent); color: #FFFBF0;
          font-size: 16px; letter-spacing: 0.08em;
          border-radius: 12px; box-shadow: 5px 5px 0 0 var(--ink);
        }
        .enc-btn--save:active { transform: translate(4px, 4px); box-shadow: 1px 1px 0 0 var(--ink); }
        .enc-btn--save.is-saved { background: #5D8A5E; }

        .enc-input {
          font-family: var(--font-rounded); font-size: 15px; font-weight: 700; color: var(--ink);
          background: var(--panel); border: 2px solid var(--ink); border-radius: 10px;
          outline: none; box-shadow: 3px 3px 0 0 var(--paper-dot);
          transition: box-shadow 80ms ease;
        }
        .enc-input::placeholder { color: var(--ink-soft); font-weight: 500; opacity: 0.7; }
        .enc-input:focus { box-shadow: 3px 3px 0 0 var(--accent); }
        .enc-counter { font-family: var(--font-mono); font-size: 11px; font-weight: 600; color: var(--ink-soft); }
        .enc-counter.is-max { color: var(--accent); }

        .enc-settings { background: var(--panel-inset); border: 2px solid var(--paper-dot); border-radius: 12px; }
        .enc-setting-row + .enc-setting-row { border-top: 2px dashed var(--paper-dot); }
        .enc-setting-name { font-size: 13px; font-weight: 800; }
        .enc-setting-desc { font-size: 10px; font-weight: 500; color: var(--ink-soft); }

        .enc-toggle {
          width: 56px; height: 30px; padding: 0;
          border: 2px solid var(--ink); border-radius: 8px;
          background: var(--paper-dot);
          box-shadow: inset 2px 2px 0 0 rgba(58, 51, 43, 0.15);
          cursor: pointer;
          transition: background-color 120ms ease;
        }
        .enc-toggle.is-on { background: var(--accent); }
        .enc-toggle-knob {
          top: 2px; left: 2px; width: 22px; height: 22px;
          background: var(--panel);
          border: 2px solid var(--ink); border-radius: 6px;
          box-shadow: 2px 2px 0 0 var(--ink);
          transition: left 120ms ease;
        }
        .enc-toggle.is-on .enc-toggle-knob { left: 28px; }
      `}</style>

      <header className="enc-header sticky top-0 z-20">
        <div className="mx-auto flex max-w-[448px] items-center justify-between px-4 py-3.5">
          <a className="enc-back flex w-16 items-center gap-1.5" href="/designs/v1">
            <span aria-hidden="true">←</span> もどる
          </a>
          <div className="text-center">
            <h1 className="enc-title-h1">PROFILE</h1>
            <div className="enc-title-underline mx-auto mt-1" />
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-[448px] px-4 pb-14 pt-6">
        <div className="enc-card">
          <div className="enc-card-head flex items-center gap-3 px-4 py-4">
            <div className="enc-card-badge grid h-10 w-10 shrink-0 place-items-center" aria-hidden="true">登</div>
            <div>
              <div className="enc-card-head-title">キャラクター登録</div>
              <div className="enc-card-head-sub mt-px">すれちがいで配られる、あなたのカードです</div>
            </div>
          </div>

          <div className="flex flex-col gap-6 p-4 pt-5">

            {/* avatar */}
            <section>
              <SectionLabel jp="アバター" en="Avatar" />
              <div className="enc-lcd flex items-center gap-3.5 p-3.5">
                <div className="enc-avatar-frame shrink-0">
                  <Avatar code={avatarCode} size={72} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="enc-lcd-code">{avatarCode}</div>
                  <div className="enc-lcd-note mt-0.5">すれちがった相手に表示されます</div>
                  <button type="button" className="enc-btn enc-btn--customize mt-2 px-3.5 py-2" onClick={() => setEditorOpen((v) => !v)}>
                    カスタマイズ
                  </button>
                </div>
              </div>
              {editorOpen ? <div className="mt-2.5"><AvatarEditor value={avatarCode} onChange={setAvatarCode} /></div> : null}
            </section>

            {/* name */}
            <section>
              <SectionLabel jp="名前" en="Name" />
              <input className="enc-input w-full px-3 py-2.5" type="text" value={name} maxLength={NAME_MAX} placeholder="れい：ぴかまる" onChange={(e) => setName(e.target.value)} />
              <span className={`enc-counter mt-1 block text-right ${name.length >= NAME_MAX ? 'is-max' : ''}`}>{name.length}/{NAME_MAX}</span>
            </section>

            {/* message */}
            <section>
              <SectionLabel jp="ひとこと" en="Message" tone="indigo" />
              <input className="enc-input w-full px-3 py-2.5" type="text" value={message} maxLength={MESSAGE_MAX} placeholder="れい：よろしくおねがいします！" onChange={(e) => setMessage(e.target.value)} />
              <span className={`enc-counter mt-1 block text-right ${message.length >= MESSAGE_MAX ? 'is-max' : ''}`}>{message.length}/{MESSAGE_MAX}</span>
            </section>

            {/* prefecture */}
            <section>
              <SectionLabel jp="出身地" en="Home" tone="indigo" optional />
              <PrefectureSelect value={prefecture} onChange={setPrefecture} />
            </section>

            {/* settings */}
            <section>
              <SectionLabel jp="システム設定" en="System" tone="lcd" />
              <div className="enc-settings px-3.5 py-1">
                <ToggleRow id="lbl-sound" name="効果音" desc="すれちがい時にピロリン♪と鳴ります" on={soundOn} onChange={setSoundOn} />
                <ToggleRow id="lbl-vibration" name="振動" desc="ポケットの中でも気づけます" on={vibrationOn} onChange={setVibrationOn} />
              </div>
            </section>

            {/* save */}
            <button
              type="button"
              className={`enc-btn enc-btn--save w-full px-3.5 py-4 ${saved ? 'is-saved' : ''}`}
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
