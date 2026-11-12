import { Composition, type CalculateMetadataFunction } from 'remotion';
import { MusicVideo } from './MusicVideo';
import { Thumbnail } from './Thumbnail';
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from './lib/thumbnail';
import { defaultThumbnailProps, defaultVideoProps, type VideoProps } from './types';

const calculateMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  durationInFrames: Math.max(1, props.durationInFrames),
  fps: props.fps,
  width: props.width,
  height: props.height,
});

export function RemotionRoot() {
  return (
    <>
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
      <Composition
        id="Thumbnail"
        component={Thumbnail}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={defaultThumbnailProps}
      />
    </>
  );
}
