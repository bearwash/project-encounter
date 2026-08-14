'use client';

import dynamic from 'next/dynamic';

const TowerExperience = dynamic(() => import('./TowerExperience.client'), {
  ssr: false,
});

export default TowerExperience;
