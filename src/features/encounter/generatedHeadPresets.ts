import type { PlazaHairShape, PlazaPalette } from './StylizedPlazaAvatar';

type GeneratedHeadPreset = Pick<
  PlazaPalette,
  'headModelSrc' | 'headModelScale' | 'headModelPosition'
>;

export const GENERATED_HEAD_PRESETS: Record<PlazaHairShape, GeneratedHeadPreset> = {
  bob: {
    headModelSrc: '/models/meshy-avatar-heads/hair_bob.glb',
    headModelScale: 0.5,
    headModelPosition: [0, 1.64, 0.01],
  },
  topknot: {
    headModelSrc: '/models/meshy-avatar-heads/hair_topknot.glb',
    headModelScale: 0.5,
    headModelPosition: [0, 1.64, 0.01],
  },
  sweep: {
    headModelSrc: '/models/meshy-avatar-heads/hair_sweep.glb',
    headModelScale: 0.5,
    headModelPosition: [0, 1.64, 0.02],
  },
  tentacle: {
    headModelSrc: '/models/meshy-avatar-heads/hair_long.glb',
    headModelScale: 0.5,
    headModelPosition: [0, 1.63, 0.01],
  },
  cap: {
    headModelSrc: '/models/meshy-avatar-heads/hair_mushroom.glb',
    headModelScale: 0.48,
    headModelPosition: [0, 1.63, 0.01],
  },
};
