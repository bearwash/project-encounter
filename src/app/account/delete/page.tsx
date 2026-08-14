'use client';

import dynamic from 'next/dynamic';

const DeleteAccount = dynamic(() => import('./DeleteAccount.client'), { ssr: false });

export default function DeleteAccountPage() {
  return <DeleteAccount />;
}
