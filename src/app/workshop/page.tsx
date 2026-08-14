'use client';

import dynamic from 'next/dynamic';

const WorkshopExperience = dynamic(() => import('./WorkshopExperience.client'), {
  ssr: false,
});

export default WorkshopExperience;
