# Changelog

## [0.4.0](https://github.com/hemi1986/coreslopper/compare/v0.3.0...v0.4.0) (2026-11-09)


### Features

* project brand kits with font weights and palette roles ([c4f7bd1](https://github.com/hemi1986/coreslopper/commit/c4f7bd1b23d4b2767d3f1711db7053a043d3a302))
* project brand kits with font weights and palette roles ([02afa75](https://github.com/hemi1986/coreslopper/commit/02afa7518621c91ba2623085ca5804f1020567c0))


### Bug Fixes

* keep render memory bounded and allow an external media directory ([b133e35](https://github.com/hemi1986/coreslopper/commit/b133e355df3b6cd79212b2750bdb30c93eae6de0))
* upload fal video and lip-sync inputs instead of sending data URIs ([2b69642](https://github.com/hemi1986/coreslopper/commit/2b6964281910a9741de40b82084363cea7636234))
* upload fal video and lip-sync inputs instead of sending data URIs ([d1edc16](https://github.com/hemi1986/coreslopper/commit/d1edc1618f9fcbe6fe62485111e05056b9e34a65))
* use the staged public dir for the QA determinism check ([d580b72](https://github.com/hemi1986/coreslopper/commit/d580b72ad04eab77e60c828aab018b27e5022382))

## [0.3.0](https://github.com/hemi1986/coreslopper/compare/v0.2.2...v0.3.0) (2026-11-09)


### ⚠ BREAKING CHANGES

* the lyrics and song stages, the --song, --song-provider, and --no-suno flags, and the Suno MCP server are removed. Projects always import a finished song; run /new-video <slug> to finish setup.

### Features

* render video clips locally with ComfyUI workflows ([08cb8bf](https://github.com/hemi1986/coreslopper/commit/08cb8bf8a9389bebcc34cbb04d525d2f419f180c))
* render video clips locally with ComfyUI workflows ([67cc632](https://github.com/hemi1986/coreslopper/commit/67cc632b26657fbad7fdf3eaada7082c192a676a))
* start every project from an existing song with a guided new-video skill ([1ebeb7e](https://github.com/hemi1986/coreslopper/commit/1ebeb7e28aae90fe7a8bd56b097647c3378942fd))


### Bug Fixes

* send Kling v4 start frame as start_image_url ([0b463b9](https://github.com/hemi1986/coreslopper/commit/0b463b9beb75b7e269fc5fe75aef186366fa1cdf))

## [0.2.2](https://github.com/hemi1986/coreslopper/compare/v0.2.1...v0.2.2) (2026-11-08)


### Bug Fixes

* keep upstream release automation out of workspaces ([e7f3fa2](https://github.com/hemi1986/coreslopper/commit/e7f3fa2e087c3be4545a57d63aaab50702d3cf5e))
* keep upstream release automation out of workspaces ([f692c72](https://github.com/hemi1986/coreslopper/commit/f692c7264106dcd29319c1e949018cda22fa98b1))

## [0.2.1](https://github.com/hemi1986/coreslopper/compare/v0.2.0...v0.2.1) (2026-11-08)


### Bug Fixes

* **cli:** accept a bare project slug in workspace commands ([58084e6](https://github.com/hemi1986/coreslopper/commit/58084e68a053abc42f95c9c3d0866611bccf2d68))


### Documentation

* restructure README around the user's path ([1a877ab](https://github.com/hemi1986/coreslopper/commit/1a877ab6a371f6dc3ab23a999cee1b0714617b09))
* restructure README around the user's path ([c11e0ec](https://github.com/hemi1986/coreslopper/commit/c11e0ec174b4c950a8cfe8c77556689f39938f80))

## [0.2.0](https://github.com/hemi1986/coreslopper/compare/v0.1.0...v0.2.0) (2026-11-08)


### Features

* add `coreslopper update` to merge a newer workflow into a workspace ([3eddb5c](https://github.com/hemi1986/coreslopper/commit/3eddb5caa64a534a9bf21ca13d45d24c747976e3))
* add `coreslopper update` to merge a newer workflow into a workspace ([1d10ffd](https://github.com/hemi1986/coreslopper/commit/1d10ffda2a6639d1a5b2a489564a54c9b2422cda))

## 0.1.0 (2026-11-08)


### Features

* add example brand kit and brand schema ([08ea9d5](https://github.com/hemi1986/coreslopper/commit/08ea9d579fd48e6ff4a4f13e85d4437b3d3b33f5))
* add Higgsfield provider and setup quickstarts ([6ced780](https://github.com/hemi1986/coreslopper/commit/6ced780ce9effddfb0272e11eff51939610da2f9))
* add lip-sync clips for storyboard shots ([3403cf6](https://github.com/hemi1986/coreslopper/commit/3403cf6efde67025dafc7ecdee583c31668027ad))
* add lip-sync shots and lyrics-first alignment ([d6534a9](https://github.com/hemi1986/coreslopper/commit/d6534a954bf6088f01732a525f629da4426a95d9))
* add npx onboarding and workspace bootstrap ([2393370](https://github.com/hemi1986/coreslopper/commit/2393370392eacb25d9045fb5b700281a4e88b062))
* add timing hooks, media helpers, stage reset, and MCP docs ([0b9ef19](https://github.com/hemi1986/coreslopper/commit/0b9ef1917aced6a0647f3dc8baa07222997e2f1a))
* initial coreslopper workflow and motion-only demo ([a088d10](https://github.com/hemi1986/coreslopper/commit/a088d10e63f3312ef94f8acaa29eb8acc4dfeed4))
* local ffmpeg bootstrap and media command polish ([ab347af](https://github.com/hemi1986/coreslopper/commit/ab347af580ecd4357bc0e4df8390b3d34735bb1c))


### Bug Fixes

* **audio-analysis:** align lyrics first and keep Unicode text ([ac35d0d](https://github.com/hemi1986/coreslopper/commit/ac35d0d33336e61a9bcc68c515f3a85088a8198f))
* keep character reference media out of git ([bb253f0](https://github.com/hemi1986/coreslopper/commit/bb253f091e7bcc7e761dce64ea90e6aaf6bed367))


### Documentation

* mark workflow as work in progress ([cd5c1e8](https://github.com/hemi1986/coreslopper/commit/cd5c1e8275ebec06f772eb59a313bf3fc7b97b32))
