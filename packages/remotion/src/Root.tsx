import { Composition, type CalculateMetadataFunction } from 'remotion';
import { MusicVideo } from './MusicVideo';
import { defaultVideoProps, type VideoProps } from './types';

const calculateMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  durationInFrames: Math.max(1, props.durationInFrames),
  fps: props.fps,
  width: props.width,
  height: props.height,
});

export function RemotionRoot() {
  return (
    <Composition
      id="MusicVideo"
      component={MusicVideo}
      durationInFrames={defaultVideoProps.durationInFrames}
      fps={defaultVideoProps.fps}
      width={defaultVideoProps.width}
      height={defaultVideoProps.height}
      defaultProps={defaultVideoProps}
      calculateMetadata={calculateMetadata}
    />
  );
}
