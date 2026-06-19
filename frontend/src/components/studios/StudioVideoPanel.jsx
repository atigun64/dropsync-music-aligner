import { useMemo } from "react";

export default function StudioVideoPanel({
  studioId,
  hasVideo = false,
  videoToken = 0,
  videoRef,
  videoSrc = "",
  onLoadedMetadata,
  onTimeUpdate,
}) {
  const computedVideoSrc = useMemo(() => {
    if (!hasVideo) return "";
    if (videoSrc) return videoSrc;
    return `/api/studios/${studioId}/video?cb=${videoToken}`;
  }, [hasVideo, studioId, videoToken, videoSrc]);

  if (!hasVideo) {
    return (
      <div
        style={{
          background: "black",
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
        }}
      />
    );
  }

  return (
    <div
      style={{
        background: "black",
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <video
        ref={videoRef}
        key={computedVideoSrc}
        src={computedVideoSrc}
        preload="auto"
        controls={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          background: "black",
        }}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
      />
    </div>
  );
}
