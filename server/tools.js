// The PC version needs no yt-dlp or ffmpeg of its own (see ytdlp-emulation.js), so the tools are always ready.
const READY = { ytDlp: true, ffmpeg: true, progress: { status: 'done', tool: '', percent: 100, error: '' } };
module.exports = {
  toolsStatus: () => READY,
  ensureTools: async () => {},
  updateYtDlpIfManaged: async () => {},
  expectedHash: () => null, ytDlpAsset: () => null, ffmpegAsset: () => null,
};
