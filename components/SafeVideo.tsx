import React from 'react';
import { ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface SafeVideoProps {
  sourceUri: string;
  style?: ViewStyle;
  contentFit?: 'cover' | 'contain' | 'fill';
}

export function SafeVideo({ sourceUri, style, contentFit = 'cover' }: SafeVideoProps) {
  const player = useVideoPlayer(sourceUri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <VideoView
      style={style}
      player={player}
      nativeControls={false}
      contentFit={contentFit}
    />
  );
}
