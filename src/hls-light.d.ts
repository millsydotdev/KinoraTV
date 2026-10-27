// hls.js 1.7.3 ships no types for its `./light` entry. The light build has the same API as the full
// build (minus alternate audio, subtitles and EME), so it reuses the full build's declarations.
declare module 'hls.js/light' {
  export * from 'hls.js'
  export { default } from 'hls.js'
}
