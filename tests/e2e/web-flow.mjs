import { chromium } from 'playwright';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:1420';
const origin = new URL(baseUrl).origin;
const STORAGE_KEYS = [
  'project_encounter.cloud_profile_consent_at',
  'project_encounter.my_profile',
  'project_encounter.encounters',
  'project_encounter.last_session_opened_at',
];

const DEFAULT_AVATAR = 'b04_h05_o04_f01';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await clearStorage(page);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    await expectVisible(page.getByTestId('cloud-consent-dialog'), 'consent dialog');
    await page.getByTestId('consent-agree').click();
    await page.waitForURL('**/profile');

    await page.getByRole('textbox', { name: /名前/ }).fill('E2E');
    await page.getByRole('textbox', { name: /一言メッセージ/ }).fill('テスト');
    await page.getByRole('button', { name: '保存' }).click();
    await page.waitForURL(`${origin}/`);
    await expectText(page, 'きょうのすれちがい 0 人');

    await addPseudoEncounter(page);
    await expectVisible(page.getByTestId('encounter-greeting'), 'encounter greeting');
    await finishGreeting(page);
    await expectText(page, 'きょうのすれちがい 1 人');
    await expectText(page, 'なかま 1 人');

    await seedRepeatEncounter(page);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByTestId('encounter-greeting').waitFor({ state: 'visible' });
    await page.getByTestId('encounter-greeting').waitFor({ state: 'attached' });
    await page
      .locator('[data-testid="encounter-greeting"][data-phase="meet"]')
      .waitFor({ state: 'visible', timeout: 6_000 });
    await expectText(page, 'クリック / タップしてハイタッチ！');
    await finishGreeting(page);
    await expectText(page, 'きょうのすれちがい 1 人');
    await expectText(page, 'なかま 1 人');

    if (errors.length > 0) {
      throw new Error(`browser errors:\n${errors.join('\n')}`);
    }
  } finally {
    await browser.close();
  }
}

async function clearStorage(page) {
  await page.evaluate((keys) => {
    for (const key of keys) window.localStorage.removeItem(key);
  }, STORAGE_KEYS);
}

async function addPseudoEncounter(page) {
  await page.getByRole('button', { name: 'Dev panel' }).click();
  await page.getByRole('button', { name: '擬似エンカウント追加' }).click();
}

async function finishGreeting(page) {
  const dialog = page.getByTestId('encounter-greeting');
  await page
    .locator('[data-testid="encounter-greeting"][data-phase="meet"]')
    .waitFor({ state: 'visible', timeout: 6_000 });
  await dialog.click();
  await page
    .locator('[data-testid="encounter-greeting"][data-phase="speak"]')
    .waitFor({ state: 'visible', timeout: 6_000 });
  await dialog.click();
  await page.getByText('広場へはいる').waitFor({ state: 'visible', timeout: 8_000 });
  await page.getByText('広場へはいる').click();
  await dialog.waitFor({ state: 'detached', timeout: 8_000 });
}

async function seedRepeatEncounter(page) {
  await page.evaluate((avatarCode) => {
    const now = Math.floor(Date.now() / 1000);
    const userId = '11111111-1111-4111-8111-111111111111';
    window.localStorage.setItem(
      'project_encounter.encounters',
      JSON.stringify([
        {
          log_id: 1,
          encountered_at: now - 60,
          is_read: true,
          user: {
            user_id: userId,
            display_name: 'Repeat',
            avatar_code: avatarCode,
            message: 'first',
            home_prefecture: null,
            encounter_count: 1,
            first_seen_at: now - 60,
            last_seen_at: now - 60,
          },
        },
        {
          log_id: 2,
          encountered_at: now,
          is_read: false,
          user: {
            user_id: userId,
            display_name: 'Repeat',
            avatar_code: avatarCode,
            message: 'again',
            home_prefecture: null,
            encounter_count: 1,
            first_seen_at: now,
            last_seen_at: now,
          },
        },
      ]),
    );
  }, DEFAULT_AVATAR);
}

async function expectVisible(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 8_000 }).catch((error) => {
    throw new Error(`Expected ${label} to be visible: ${error.message}`);
  });
}

async function expectText(page, text) {
  await page.getByText(text).waitFor({ state: 'visible', timeout: 8_000 }).catch((error) => {
    throw new Error(`Expected text "${text}": ${error.message}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
