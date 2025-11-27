
import React, { useRef, useEffect, useState } from 'react';
import { EmbyItem } from '../types';
import { MediaClient } from '../services/MediaClient';
import { Play, AlertCircle, Heart, Info, Disc, ChevronsRight, Rewind, FastForward, Zap } from 'lucide-react';

interface VideoCardProps {
  item: EmbyItem;
  client: MediaClient;
  isActive: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

const VideoCard: React.FC<VideoCardProps> = ({ 
    item, 
    client, 
    isActive, 
    isFavorite, 
    onToggleFavorite,
    isMuted,
    onToggleMute
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  
  // Progress State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Gesture State
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [seekOffset, setSeekOffset] = useState<number | null>(null);
  
  // Gesture Refs
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const isLongPress = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoSrc = client.getVideoUrl(item.Id);
  const posterSrc = item.ImageTags?.Primary 
    ? client.getImageUrl(item.Id, item.ImageTags.Primary, 'Primary') 
    : undefined;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    video.muted = isMuted;

    if (isActive) {
      setError(null);
      // Reset speed on new video
      video.playbackRate = 1.0;
      setPlaybackRate(1.0);
      
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn("Autoplay failed", err);
            setIsPlaying(false);
          });
      }
    } else {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
    }
  }, [isActive, isMuted]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
      if (videoRef.current) {
          setCurrentTime(videoRef.current.currentTime);
      }
  };

  const handleLoadedMetadata = () => {
      if (videoRef.current) {
          setDuration(videoRef.current.duration);
      }
  };

  const handleFavorite = (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      onToggleFavorite();
  };

  const handleMuteToggle = (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      onToggleMute();
  };

  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
  };

  // --- Gesture Handlers ---

  const handleTouchStart = (e: React.TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isDragging.current = false;
      isLongPress.current = false;
      setSeekOffset(null);

      // Start Timer for Long Press (2x Speed)
      longPressTimer.current = setTimeout(() => {
          isLongPress.current = true;
          setPlaybackRate(2.0);
          if (videoRef.current) videoRef.current.playbackRate = 2.0;
      }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = currentX - touchStartX.current;
      const deltaY = currentY - touchStartY.current;

      // If moved significantly (>10px), cancel Long Press Timer
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          if (longPressTimer.current) {
              clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
          }
      }

      // Horizontal Swipe Logic (Seek)
      // Condition: Not currently long pressing, moved > 20px, and horizontal move > vertical move
      if (!isLongPress.current && Math.abs(deltaX) > 20 && Math.abs(deltaX) > Math.abs(deltaY)) {
           isDragging.current = true;
           // Calculate seek seconds (e.g., 5px = 1 second)
           const offset = Math.round(deltaX / 5); 
           setSeekOffset(offset);
      }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      // Clear Long Press Timer
      if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
      }

      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;

      if (isLongPress.current) {
          // End 2x Speed
          isLongPress.current = false;
          setPlaybackRate(1.0);
          if (videoRef.current) videoRef.current.playbackRate = 1.0;
      } else if (isDragging.current) {
          // Apply Seek
          if (videoRef.current && seekOffset !== null) {
              const newTime = videoRef.current.currentTime + seekOffset;
              videoRef.current.currentTime = Math.min(Math.max(newTime, 0), videoRef.current.duration);
          }
          isDragging.current = false;
          setSeekOffset(null);
      } else {
          // Tap Logic (Toggle Play)
          // Only trigger if movement was minimal (not a scroll)
          if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
              togglePlay();
          }
      }
  };

  const formatTime = (ticks?: number) => {
      if (!ticks) return '';
      const minutes = Math.round(ticks / 10000000 / 60);
      return `${minutes} 分钟`;
  }

  return (
    <div 
        ref={containerRef}
        className="relative w-full h-full bg-black snap-start shrink-0 flex items-center justify-center overflow-hidden touch-pan-y select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-cover pointer-events-none" // pointer-events-none ensures touches go to container
        src={videoSrc}
        poster={posterSrc}
        loop
        playsInline
        muted={isMuted}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={() => setError("无法加载视频")}
      />

      {/* Play/Pause Overlay Icon */}
      {!isPlaying && !error && !seekOffset && !isLongPress.current && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
          <Play className="w-16 h-16 text-white/50 fill-white/50" />
        </div>
      )}

      {/* 2x Speed Overlay - Top Center */}
      {playbackRate > 1.0 && (
          <div className="absolute top-24 left-0 right-0 flex justify-center z-50 pointer-events-none">
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full animate-in fade-in zoom-in duration-200">
                <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span className="text-white font-bold text-sm">2倍速中</span>
                <ChevronsRight className="w-4 h-4 text-white" />
            </div>
          </div>
      )}

      {/* Seek Overlay - Top Center (Replaced Center) */}
      {seekOffset !== null && (
          <div className="absolute top-24 left-0 right-0 flex flex-col items-center justify-start z-50 pointer-events-none">
              <div className="flex flex-col items-center gap-2 bg-black/40 backdrop-blur-md px-6 py-4 rounded-2xl">
                  {seekOffset > 0 ? (
                       <FastForward className="w-10 h-10 text-white/90 fill-white/20" />
                  ) : (
                       <Rewind className="w-10 h-10 text-white/90 fill-white/20" />
                  )}
                  <div className="text-2xl font-bold text-white drop-shadow-lg">
                      {seekOffset > 0 ? '+' : ''}{seekOffset}s
                  </div>
                  {videoRef.current && (
                      <div className="text-white/70 text-xs font-mono mt-1">
                          {new Date(Math.max(0, videoRef.current.currentTime + seekOffset) * 1000).toISOString().substr(14, 5)} 
                          {' / '}
                          {new Date(videoRef.current.duration * 1000).toISOString().substr(14, 5)}
                      </div>
                  )}
              </div>
          </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-4 z-10">
          <AlertCircle className="w-12 h-12 text-red-500 mb-2" />
          <p className="text-center">{error}</p>
        </div>
      )}

      {/* RIGHT SIDEBAR ACTION BAR */}
      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-6 z-20 pointer-events-auto">
          <div className="relative w-12 h-12 mb-2">
              <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden bg-zinc-800">
                  {posterSrc ? (
                      <img src={posterSrc} alt="Poster" className="w-full h-full object-cover" />
                  ) : (
                      <div className="w-full h-full flex items-center justify-center bg-indigo-600 text-xs">Media</div>
                  )}
              </div>
          </div>

          <div className="flex flex-col items-center gap-1">
              <button 
                onTouchEnd={handleFavorite}
                onClick={handleFavorite} // Desktop fallback
                className="p-2 rounded-full transition-transform active:scale-75"
              >
                  <Heart 
                    className={`w-8 h-8 drop-shadow-md transition-colors duration-300 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-white fill-transparent'}`} 
                    strokeWidth={isFavorite ? 0 : 2}
                  />
              </button>
              <span className="text-white text-xs font-bold shadow-black drop-shadow-md">
                {isFavorite ? '已赞' : '点赞'}
              </span>
          </div>

          <div className="flex flex-col items-center gap-1">
              <button 
                onTouchEnd={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
                onClick={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
                className="p-2 rounded-full bg-white/10 backdrop-blur-sm active:bg-white/20"
              >
                  <Info className="w-7 h-7 text-white drop-shadow-md" />
              </button>
              <span className="text-white text-xs font-bold shadow-black drop-shadow-md">信息</span>
          </div>

           <div 
                onTouchEnd={handleMuteToggle}
                onClick={handleMuteToggle}
                className={`mt-4 w-10 h-10 rounded-full bg-zinc-900 border-4 cursor-pointer transition-colors duration-300 flex items-center justify-center overflow-hidden ${isMuted ? 'border-red-500/80' : 'border-zinc-800'} ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}
           >
                {posterSrc ? (
                    <img src={posterSrc} className="w-full h-full object-cover opacity-70" />
                ) : (
                    <Disc className="w-6 h-6 text-zinc-500" />
                )}
           </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-all duration-300 pointer-events-auto ${showInfo ? 'h-2/3 from-black/95' : 'pt-24'}`}>
        <div className="flex flex-col items-start max-w-[80%]">
            <h3 className="text-white font-bold text-lg drop-shadow-md mb-2 leading-tight">
              {item.Name}
            </h3>
            
            <div className="flex items-center gap-3 text-xs text-white/90 mb-2 font-medium drop-shadow-md">
               {item.ProductionYear && <span className="bg-white/20 px-1.5 py-0.5 rounded">{item.ProductionYear}</span>}
               <span>{formatTime(item.RunTimeTicks)}</span>
               <span className="uppercase border border-white/30 px-1 rounded text-[10px]">{item.MediaType || '视频'}</span>
            </div>

            <div 
                onClick={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
                className={`text-white/80 text-sm drop-shadow-md transition-all duration-300 cursor-pointer ${showInfo ? 'line-clamp-none overflow-y-auto max-h-[40vh]' : 'line-clamp-2'}`}
            >
                {item.Overview || '暂无简介'}
            </div>
            
            {!showInfo && item.Overview && (
                <button 
                    onClick={(e) => { e.stopPropagation(); setShowInfo(true); }}
                    className="text-white/60 text-xs font-semibold mt-1"
                >
                    更多
                </button>
            )}
        </div>
      </div>

      {/* Progress Bar for Videos > 3 minutes (180s) */}
      {duration > 180 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-50 pointer-events-none">
              <div 
                  className="h-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
              />
          </div>
      )}
    </div>
  );
};

export default VideoCard;
