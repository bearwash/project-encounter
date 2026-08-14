import { invoke } from '@tauri-apps/api/core';
import { getDb } from '@/lib/db/client';
import { getSupabase } from '@/lib/supabase/client';
import { isTauri } from '@/lib/tauri/env';
import {
  COIN_PRODUCTS,
  TEST_PURCHASES_ENABLED,
  type CoinProduct,
  type CoinProductId,
  type StoreListing,
} from './catalog';

type NativeStoreProduct = {
  productId: string;
  localizedPrice: string;
  available: boolean;
};

type NativePurchaseReceipt = {
  platform: 'ios' | 'android';
  productId: string;
  transactionId: string;
  receipt: string;
};

type VerifyResponse = {
  accepted: boolean;
  balance: number;
};

type LocalWallet = {
  entries: Array<{
    id: string;
    userId: string;
    amount: number;
    reason: string;
    createdAt: number;
  }>;
};

export type PurchaseResult = {
  balance: number;
  granted: number;
  mode: 'test' | 'store';
};

const LOCAL_WALLET_KEY = 'project-encounter:test-wallet:v1';
const PURCHASE_API_URL = process.env.NEXT_PUBLIC_PURCHASE_API_URL?.replace(/\/$/, '');

export class StoreConnectionPendingError extends Error {
  constructor(message = 'App Store / Google Play の購入接続がまだ設定されていません。') {
    super(message);
    this.name = 'StoreConnectionPendingError';
  }
}

export async function loadStoreListings(): Promise<StoreListing[]> {
  if (TEST_PURCHASES_ENABLED) {
    return COIN_PRODUCTS.map((product) => ({
      ...product,
      localizedPrice: '¥0 TEST',
      available: true,
    }));
  }

  if (!isTauri()) {
    return COIN_PRODUCTS.map((product) => ({
      ...product,
      localizedPrice: null,
      available: false,
    }));
  }

  try {
    const nativeProducts = await invoke<NativeStoreProduct[]>('iap_get_products', {
      productIds: COIN_PRODUCTS.map((product) => product.id),
    });
    const byId = new Map(nativeProducts.map((product) => [product.productId, product]));
    return COIN_PRODUCTS.map((product) => {
      const native = byId.get(product.id);
      return {
        ...product,
        localizedPrice: native?.localizedPrice ?? null,
        available: native?.available ?? false,
      };
    });
  } catch (error) {
    console.warn('[commerce] native product loading pending:', error);
    return COIN_PRODUCTS.map((product) => ({
      ...product,
      localizedPrice: null,
      available: false,
    }));
  }
}

export async function loadCoinBalance(userId: string): Promise<number> {
  if (TEST_PURCHASES_ENABLED) return loadTestBalance(userId);
  if (!PURCHASE_API_URL) return 0;

  const response = await fetch(`${PURCHASE_API_URL}/v1/wallet`, {
    headers: await purchaseApiHeaders(),
  });
  if (!response.ok) throw new Error(`wallet request failed: ${response.status}`);
  const body = (await response.json()) as { balance?: number };
  return Math.max(0, Math.floor(body.balance ?? 0));
}

export async function purchaseCoins(
  userId: string,
  product: CoinProduct,
): Promise<PurchaseResult> {
  if (TEST_PURCHASES_ENABLED) {
    const balance = await grantTestCoins(userId, product);
    return { balance, granted: product.coins, mode: 'test' };
  }

  if (!isTauri() || !PURCHASE_API_URL) throw new StoreConnectionPendingError();

  const receipt = await invoke<NativePurchaseReceipt>('iap_purchase', {
    productId: product.id,
  });
  if (receipt.productId !== product.id) {
    throw new Error('購入商品とレシートの商品 ID が一致しません。');
  }

  const response = await fetch(`${PURCHASE_API_URL}/v1/purchases/verify`, {
    method: 'POST',
    headers: await purchaseApiHeaders(true),
    body: JSON.stringify(receipt),
  });
  if (!response.ok) throw new Error(`receipt verification failed: ${response.status}`);
  const verified = (await response.json()) as VerifyResponse;
  if (!verified.accepted) throw new Error('ストアの購入確認が完了しませんでした。');
  return { balance: verified.balance, granted: product.coins, mode: 'store' };
}

export async function restorePurchases(userId: string): Promise<number> {
  if (TEST_PURCHASES_ENABLED) return loadTestBalance(userId);
  if (!isTauri() || !PURCHASE_API_URL) throw new StoreConnectionPendingError();

  const receipts = await invoke<NativePurchaseReceipt[]>('iap_restore');
  const response = await fetch(`${PURCHASE_API_URL}/v1/purchases/restore`, {
    method: 'POST',
    headers: await purchaseApiHeaders(true),
    body: JSON.stringify({ receipts }),
  });
  if (!response.ok) throw new Error(`purchase restore failed: ${response.status}`);
  const restored = (await response.json()) as VerifyResponse;
  return restored.balance;
}

async function grantTestCoins(userId: string, product: CoinProduct): Promise<number> {
  const entry = {
    id: crypto.randomUUID(),
    userId,
    amount: product.coins,
    reason: `test-purchase:${product.id}`,
    createdAt: Math.floor(Date.now() / 1000),
  };

  if (isTauri()) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO dev_wallet_ledger (entry_id, user_id, amount, reason, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.id, entry.userId, entry.amount, entry.reason, entry.createdAt],
    );
  } else {
    const wallet = readLocalWallet();
    wallet.entries.push(entry);
    window.localStorage.setItem(LOCAL_WALLET_KEY, JSON.stringify(wallet));
  }

  return loadTestBalance(userId);
}

async function loadTestBalance(userId: string): Promise<number> {
  if (isTauri()) {
    const db = await getDb();
    const rows = await db.select<Array<{ balance: number }>>(
      'SELECT COALESCE(SUM(amount), 0) AS balance FROM dev_wallet_ledger WHERE user_id = $1',
      [userId],
    );
    return Math.max(0, Number(rows[0]?.balance ?? 0));
  }

  return readLocalWallet().entries
    .filter((entry) => entry.userId === userId)
    .reduce((total, entry) => total + entry.amount, 0);
}

function readLocalWallet(): LocalWallet {
  if (typeof window === 'undefined') return { entries: [] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_WALLET_KEY) ?? '{}') as Partial<LocalWallet>;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

export function productById(productId: CoinProductId) {
  return COIN_PRODUCTS.find((product) => product.id === productId) ?? null;
}

async function purchaseApiHeaders(json = false): Promise<Record<string, string>> {
  const sb = getSupabase();
  const session = sb ? (await sb.auth.getSession()).data.session : null;
  if (!session?.access_token || session.user.is_anonymous) {
    throw new StoreConnectionPendingError('購入サーバーへ渡す認証セッションを確認できません。');
  }

  return {
    authorization: `Bearer ${session.access_token}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}
