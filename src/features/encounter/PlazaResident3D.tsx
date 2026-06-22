'use client';

/**
 * A resident in the plaza.
 * Residents are intentionally static to keep the plaza readable and lightweight.
 */

import { type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { StylizedPlazaAvatar } from './StylizedPlazaAvatar';

type Props = {
  userId: string;
  avatarCode: string;
  initialX: number;
  initialZ?: number;
  showMarker?: boolean;
  markerText?: string;
  onTap?: () => void;
};

export function PlazaResident3D({
  userId,
  avatarCode,
  initialX,
  initialZ = 0,
  showMarker = false,
  markerText = '...',
  onTap,
}: Props) {
  const baseLookAngle =
    Math.atan2(-initialX, -initialZ || -0.001) + ((hashString(userId) % 17) - 8) * 0.025;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onTap?.();
  };

  return (
    <group
      position={[initialX, 0, initialZ]}
      rotation={[0, baseLookAngle, 0]}
      onClick={handleClick}
      scale={0.94}
    >
      <StylizedPlazaAvatar avatarCode={avatarCode} userId={userId} mode="idle" animated={false} />
      {showMarker && (
        <Html
          center
          distanceFactor={8.5}
          position={[0, 2.82, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="resident-speech-bubble">
            {markerText.slice(0, 18) || '...'}
          </div>
        </Html>
      )}
    </group>
  );
}

function hashString(value: string) {
  let acc = 0;
  for (let i = 0; i < value.length; i += 1) {
    acc = (acc * 31 + value.charCodeAt(i)) >>> 0;
  }
  return acc;
}
