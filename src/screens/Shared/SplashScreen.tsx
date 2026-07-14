import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { VideoView, useVideoPlayer } from 'expo-video';

const splashVideo = require('../../../assets/splash/tatzo-splash.mp4');
const SPLASH_FAILSAFE_MS = 9000;

type SplashScreenProps = {
  onPlaybackEnd?: () => void;
};

const SplashScreen = ({ onPlaybackEnd }: SplashScreenProps) => {
  const didFinishRef = useRef(false);
  const didStartRef = useRef(false);
  const player = useVideoPlayer(splashVideo, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = true;
    videoPlayer.currentTime = 0;
  });

  const finish = useCallback(() => {
    if (didFinishRef.current) return;
    didFinishRef.current = true;
    onPlaybackEnd?.();
  }, [onPlaybackEnd]);

  useEffect(() => {
    const startPlayback = () => {
      if (didStartRef.current) return;
      didStartRef.current = true;
      player.currentTime = 0;
      player.play();
    };

    if (player.status === 'readyToPlay') startPlayback();

    const statusSubscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') startPlayback();
      if (status === 'error') setTimeout(finish, 900);
    });
    const endSubscription = player.addListener('playToEnd', finish);
    const failsafe = setTimeout(finish, SPLASH_FAILSAFE_MS);
    return () => {
      statusSubscription.remove();
      endSubscription.remove();
      clearTimeout(failsafe);
    };
  }, [finish, player]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <VideoView
        player={player}
        style={styles.video}
        nativeControls={false}
        contentFit="contain"
        fullscreenOptions={{ enable: false }}
        useExoShutter={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default SplashScreen;

