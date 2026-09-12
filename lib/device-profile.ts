/**
 * The DeviceProfile FastFin sends with every PlaybackInfo call. This is what
 * lets the Jellyfin server decide *for us* whether a file can be handed to
 * AVPlayer untouched (direct play), remuxed with the streams copied (cheap),
 * or fully transcoded -- instead of us blindly forcing an H.264 transcode
 * for everything, which is why only some videos used to play.
 *
 * Everything below describes what AVFoundation on iOS can actually decode.
 * Anything that fails a condition gets transcoded server-side, so being
 * conservative here trades server CPU for reliability, never the reverse.
 *
 * HEVC / HDR: AVPlayer decodes HEVC Main/Main 10 in hardware, including
 * HDR10, HDR10+, HLG and Dolby Vision profiles 5 and 8 -- but only inside
 * MP4/MOV (direct play) or fMP4 HLS segments. MKV has no iOS demuxer, so an
 * HEVC MKV is *remuxed*: the server copies the video (and any compatible
 * audio) bit-for-bit into fMP4 segments. Jellyfin reports that as
 * "DirectStream"/"Remux"; it's the closest thing to direct play MKV can get
 * and costs the server almost nothing.
 */

/** Video range types AVFoundation renders correctly. DOVIWithEL (profile 7
 * with an enhancement layer) and DOVIInvalid are deliberately absent. */
const IOS_VIDEO_RANGE_TYPES = "SDR|HDR10|HDR10Plus|HLG|DOVI|DOVIWithHDR10|DOVIWithHLG|DOVIWithSDR";

const IOS_AUDIO_CODECS = "aac,mp3,ac3,eac3,alac,flac";

export const DEVICE_PROFILE = {
  Name: "FastFin iOS",
  MaxStreamingBitrate: 120_000_000,
  MaxStaticBitrate: 120_000_000,
  MusicStreamingTranscodingBitrate: 384_000,

  // Containers AVPlayer opens natively over a plain HTTP byte-range stream.
  // MKV is deliberately absent: it is *the* reason most files need a remux.
  DirectPlayProfiles: [
    {
      Type: "Video",
      Container: "mp4,m4v,mov",
      VideoCodec: "hevc,h264",
      AudioCodec: IOS_AUDIO_CODECS,
    },
    { Type: "Audio", Container: "mp3", AudioCodec: "mp3" },
    { Type: "Audio", Container: "m4a,m4b,mp4", AudioCodec: "aac,alac" },
    { Type: "Audio", Container: "flac", AudioCodec: "flac" },
  ],

  // Order matters: Jellyfin uses the first video profile that applies.
  //
  // 1. fMP4 HLS carrying HEVC or H.264. This is the remux path -- an MKV's
  //    HEVC/HDR stream is copied straight into fragmented-MP4 segments, which
  //    is the only HLS container Apple supports HEVC in. "hevc" is listed
  //    first so a server with HEVC *encoding* enabled targets it; a default
  //    server (AllowHevcEncoding off) falls through to h264 automatically.
  // 2. MPEG-TS H.264/AAC -- never selected by the server while (1) is
  //    present, kept as documentation of the last-resort URL the player
  //    builds by hand (see buildFallbackHlsUrl).
  TranscodingProfiles: [
    {
      Type: "Video",
      Container: "mp4",
      VideoCodec: "hevc,h264",
      AudioCodec: IOS_AUDIO_CODECS,
      Protocol: "hls",
      Context: "Streaming",
      MaxAudioChannels: "6",
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
    },
    {
      Type: "Video",
      Container: "ts",
      VideoCodec: "h264",
      AudioCodec: "aac,ac3,eac3,mp3",
      Protocol: "hls",
      Context: "Streaming",
      MaxAudioChannels: "6",
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
    },
    {
      Type: "Audio",
      Container: "mp4",
      AudioCodec: "aac",
      Protocol: "hls",
      Context: "Streaming",
      MaxAudioChannels: "2",
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
    },
  ],

  // Conditions the server checks before it is allowed to *copy* a stream
  // (direct play or remux). Failing any of these forces a real transcode.
  CodecProfiles: [
    {
      Type: "Video",
      Codec: "h264",
      Conditions: [
        // 10-bit H.264 ("High 10") has no hardware decoder on any iPhone.
        { Condition: "LessThanEqual", Property: "VideoBitDepth", Value: "8", IsRequired: false },
        { Condition: "EqualsAny", Property: "VideoProfile", Value: "high|main|baseline|constrained baseline", IsRequired: false },
        { Condition: "LessThanEqual", Property: "VideoLevel", Value: "52", IsRequired: false },
        { Condition: "NotEquals", Property: "IsAnamorphic", Value: "true", IsRequired: false },
        { Condition: "NotEquals", Property: "IsInterlaced", Value: "true", IsRequired: false },
      ],
    },
    {
      Type: "Video",
      Codec: "hevc",
      Conditions: [
        { Condition: "LessThanEqual", Property: "VideoBitDepth", Value: "10", IsRequired: false },
        { Condition: "EqualsAny", Property: "VideoProfile", Value: "main|main 10", IsRequired: false },
        { Condition: "LessThanEqual", Property: "VideoLevel", Value: "183", IsRequired: false },
        { Condition: "EqualsAny", Property: "VideoRangeType", Value: IOS_VIDEO_RANGE_TYPES, IsRequired: false },
        { Condition: "NotEquals", Property: "IsInterlaced", Value: "true", IsRequired: false },
      ],
    },
    {
      // Progressive MP4 only: AVPlayer refuses HEVC tagged `hev1` in a plain
      // MP4 (it needs `hvc1`/`dvh1`). Scoped to these containers so it does
      // NOT block the remux path -- ffmpeg re-tags to hvc1 when it copies
      // the stream into fMP4 segments, so remuxed hev1 files play fine.
      Type: "Video",
      Codec: "hevc",
      Container: "mp4,m4v,mov",
      Conditions: [{ Condition: "EqualsAny", Property: "VideoCodecTag", Value: "hvc1|dvh1", IsRequired: false }],
    },
    {
      Type: "VideoAudio",
      Codec: "aac",
      Conditions: [{ Condition: "LessThanEqual", Property: "AudioChannels", Value: "6", IsRequired: false }],
    },
  ],

  // Text subtitles ride along as a WebVTT playlist inside the HLS manifest
  // (Jellyfin converts SRT/ASS/SSA/mov_text to VTT), which AVPlayer exposes as
  // a native subtitle track -- no burn-in, no full video re-encode. Bitmap
  // subtitles (PGS/VobSub/DVB) match nothing here, so the server falls back
  // to burning them into the picture, which is the only way they can work
  // (and the one case where an HEVC file will still be re-encoded).
  SubtitleProfiles: [{ Format: "vtt", Method: "Hls" }],

  ResponseProfiles: [{ Type: "Video", Container: "m4v", MimeType: "video/mp4" }],
} as const;
