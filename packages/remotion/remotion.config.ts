import { Config } from '@remotion/cli/config';
import { webpackOverride } from './webpack-override';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.overrideWebpackConfig(webpackOverride);
