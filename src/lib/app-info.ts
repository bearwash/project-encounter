export const APP_INFO = {
  name: 'Project Encounter',
  version: '0.1.0',
  operator: process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim() || 'Project Encounter 運営チーム',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null,
  publicSiteUrl: process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.replace(/\/$/, '') || null,
  privacyUpdatedAt: '2026年8月14日',
} as const;

export function mailtoUrl(subject: string) {
  if (!APP_INFO.supportEmail) return null;
  return `mailto:${APP_INFO.supportEmail}?subject=${encodeURIComponent(subject)}`;
}
