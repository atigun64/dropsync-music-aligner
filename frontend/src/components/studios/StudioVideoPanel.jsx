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
    return <div className="studio-video studio-video--empty" />;
  }

  return (
    <div className="studio-video">
      <video
        ref={videoRef}
        key={computedVideoSrc}
        className="studio-video__element"
        src={computedVideoSrc}
        preload="auto"
        playsInline
        controls={false}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
      />
    </div>
  );
}
