'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  COIN_PRODUCTS,
  TEST_PURCHASES_ENABLED,
  type CoinProduct,
  type StoreListing,
} from '@/lib/commerce/catalog';
import {
  loadCoinBalance,
  loadStoreListings,
  purchaseCoins,
  restorePurchases,
} from '@/lib/commerce/purchases';

export default function ShopExperience() {
  const { user, isAuthenticated, requestLogin } = useAuth();
  const [listings, setListings] = useState<StoreListing[]>(
    COIN_PRODUCTS.map((product) => ({ ...product, localizedPrice: null, available: false })),
  );
  const [balance, setBalance] = useState(0);
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStoreListings().then(setListings).catch((loadError) => {
      console.warn('[shop] listing load failed:', loadError);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setBalance(0);
      return;
    }
    loadCoinBalance(user.id).then(setBalance).catch((balanceError) => {
      console.warn('[shop] balance load failed:', balanceError);
    });
  }, [user]);

  const buy = async (product: CoinProduct) => {
    if (!user || !isAuthenticated) {
      requestLogin({
        returnTo: '/shop',
        reason: '購入したコインをあなたの残高へ安全に保存するため、購入の確定にはログインが必要です。',
      });
      return;
    }

    setBusyProduct(product.id);
    setError(null);
    setNotice(null);
    try {
      const result = await purchaseCoins(user.id, product);
      setBalance(result.balance);
      setNotice(
        result.mode === 'test'
          ? `${product.coins.toLocaleString('ja-JP')}コインを0円のテスト購入で追加しました。実決済は発生していません。`
          : `${product.coins.toLocaleString('ja-JP')}コインを追加しました。`,
      );
    } catch (purchaseError) {
      console.error('[shop] purchase failed:', purchaseError);
      setError(purchaseError instanceof Error ? purchaseError.message : '購入を完了できませんでした。');
    } finally {
      setBusyProduct(null);
    }
  };

  const restore = async () => {
    if (!user) {
      requestLogin({ returnTo: '/shop', reason: '以前の購入を復元するにはログインが必要です。' });
      return;
    }
    setBusyProduct('restore');
    setError(null);
    try {
      const nextBalance = await restorePurchases(user.id);
      setBalance(nextBalance);
      setNotice(TEST_PURCHASES_ENABLED ? 'テスト残高を確認しました。' : '購入を復元しました。');
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : '購入を復元できませんでした。');
    } finally {
      setBusyProduct(null);
    }
  };

  return (
    <main className="coin-shop" data-app-ready="true">
      <header className="coin-shop__topbar">
        <Link href="/" className="tower-icon-button" aria-label="Messengerへ戻る">‹</Link>
        <div>
          <span>TRAVEL SUPPLY</span>
          <h1>コイン売り場</h1>
        </div>
        <div className="coin-balance" aria-label={isAuthenticated ? `${balance}コイン` : 'ログイン後に残高を表示'}>
          <span aria-hidden>◆</span>
          <strong data-testid="coin-balance">{isAuthenticated ? balance.toLocaleString('ja-JP') : '—'}</strong>
          <small>COINS</small>
        </div>
      </header>

      <section className="coin-shop__hero">
        <div className="coin-shop__mascot" aria-hidden>
          <span className="coin-shop__bag">◆</span>
          <i /><i /><i />
        </div>
        <div>
          <p>{TEST_PURCHASES_ENABLED ? 'PAYMENT-FREE TEST COUNTER' : 'APP STORE / GOOGLE PLAY'}</p>
          <h2>{TEST_PURCHASES_ENABLED ? '検証中は、コインを0円で受け取れます' : '工房で使うコインを追加'}</h2>
          <span>
            {TEST_PURCHASES_ENABLED
              ? 'この表示中はクレジットカード・App Store・Google Playへ請求しません。'
              : '価格と決済は端末の公式ストアが表示・処理します。'}
          </span>
        </div>
      </section>

      <section className="coin-products" aria-label="コイン商品">
        {listings.map((product, index) => (
          <article
            key={product.id}
            className={`coin-product coin-product--${product.art}${index === 1 ? ' coin-product--featured' : ''}`}
          >
            {product.bonusLabel && <span className="coin-product__bonus">{product.bonusLabel}</span>}
            <div className="coin-product__art" aria-hidden>
              <i /><i /><i /><strong>◆</strong>
            </div>
            <div className="coin-product__copy">
              <p>{product.name}</p>
              <strong>{product.coins.toLocaleString('ja-JP')}<small> COINS</small></strong>
              <span>{product.description}</span>
            </div>
            <button
              type="button"
              onClick={() => buy(product)}
              disabled={busyProduct !== null || (isAuthenticated && !product.available)}
              data-product-id={product.id}
            >
              {!isAuthenticated
                ? 'ログインして受け取る'
                : busyProduct === product.id
                  ? '処理中…'
                  : product.localizedPrice ?? 'ストア接続待ち'}
            </button>
          </article>
        ))}
      </section>

      <section className="coin-shop__footer">
        {notice && <p className="coin-shop__notice" role="status">{notice}</p>}
        {error && <p className="coin-shop__error" role="alert">{error}</p>}
        <button type="button" onClick={restore} disabled={busyProduct !== null}>購入を復元</button>
        <Link href="/support#purchases">購入について</Link>
        <Link href="/legal/terms">利用規約</Link>
        <p>コインに現金価値はなく、アプリ外へ移動・換金できません。</p>
      </section>
    </main>
  );
}
