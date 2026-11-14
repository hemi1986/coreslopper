import { Composition, type CalculateMetadataFunction } from 'remotion';
import { MusicVideo } from './MusicVideo';
import { Thumbnail } from './Thumbnail';
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH, thumbnailSize } from './lib/thumbnail';
import { defaultThumbnailProps, defaultVideoProps, type ThumbnailProps, type VideoProps } from './types';

const calculateMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  durationInFrames: Math.max(1, props.durationInFrames),
  fps: props.fps,
  width: props.width,
  height: props.height,
});

const thumbnailMetadata: CalculateMetadataFunction<ThumbnailProps> = ({ props }) => ({
  ...thumbnailSize(props.format ?? '16x9'),
  durationInFrames: 1,
  fps: 30,
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
        calculateMetadata={thumbnailMetadata}
      />
    </>
  );
}
