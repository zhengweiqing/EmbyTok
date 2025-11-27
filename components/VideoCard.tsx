
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
  const [isSeeking, setIsSeeking] = useState(false);

  // Gesture State
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [seekOffset, setSeekOffset] = useState<number | null>(null);
  
  // Gesture Refs
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const isLongPress = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine URL (Pass full item to support Plex Direct Play)
  const videoSrc = client.getVideoUrl(item);

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
      if (videoRef.current && !isSeeking) {
          setCurrentTime(videoRef.current.currentTime);
      }
  };

  const handleLoadedMetadata = () => {
      if (videoRef.current) {
          setDuration(videoRef.current.duration);
      }
  };

  // --- Button Handlers with Robust Touch Support ---
  // To solve "buttons not clicking" on mobile while preventing parent gestures:
  // 1. onTouchStart: stopPropagation (Prevents parent Long Press)
  // 2. onTouchEnd: stopPropagation + preventDefault + ACTION (Handles "Tap" immediately)
  // 3. onClick: stopPropagation + ACTION (Handles Desktop, ignored on mobile if preventDefault called)
  
  const handleButtonAction = (e: React.TouchEvent | React.MouseEvent, action: () => void) => {
      e.stopPropagation();
      // If it's a touch end event, we prevent default to avoid ghost click
      if (e.type === 'touchend') {
          e.preventDefault(); 
      }
      action();
  };

  const stopProp = (e: React.TouchEvent | React.MouseEvent) => {
      e.stopPropagation();
  };

  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
  };

  // --- Seek Bar Handlers ---
  const handleSeekStart = (e: React.TouchEvent | React.MouseEvent) => {
      e.stopPropagation();
      setIsSeeking(true);
  };

  const handleSeekMove = (e: React.TouchEvent | React.MouseEvent) => {
      e.stopPropagation();
      if (!isSeeking || !containerRef.current) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, clientX / rect.width));
      setCurrentTime(percent * duration);
  };

  const handleSeekEnd = (e: React.TouchEvent | React.MouseEvent) => {
      e.stopPropagation();
      if (!isSeeking) return;
      
      setIsSeeking(false);
      if (videoRef.current) {
          videoRef.current.currentTime = currentTime;
      }
  };

  // --- Gesture Handlers ---

  const handleTouchStart = (e: React.TouchEvent) => {
      // If we are here, it means the touch was NOT on a button (because buttons call stopPropagation)
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

  const formatTimeText = (ticks?: number) => {
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
        className="w-full h-full object-cover pointer-events-none" 
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

      {/* Seek Overlay - Top Center (Smaller) */}
      {seekOffset !== null && (
          <div className="absolute top-24 left-0 right-0 flex flex-col items-center justify-start z-50 pointer-events-none">
              <div className="flex flex-col items-center gap-1 bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl">
                  {seekOffset > 0 ? (
                       <FastForward className="w-6 h-6 text-white/90 fill-white/20" />
                  ) : (
                       <Rewind className="w-6 h-6 text-white/90 fill-white/20" />
                  )}
                  <div className="text-lg font-bold text-white drop-shadow-lg">
                      {seekOffset > 0 ? '+' : ''}{seekOffset}s
                  </div>
              </div>
          </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-4 z-10">
          <AlertCircle className="w-12 h-12 text-red-500 mb-2" />
          <p className="text-center">{error}</p>
        </div>
      )}

      {/* RIGHT SIDEBAR ACTION BAR (Z-30 to ensure it is above bottom gradient) */}
      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-6 z-30 pointer-events-auto">
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
                onTouchStart={stopProp} 
                onMouseDown={stopProp}
                onTouchEnd={(e) => handleButtonAction(e, onToggleFavorite)}
                onClick={(e) => handleButtonAction(e, onToggleFavorite)}
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
                onTouchStart={stopProp}
                onMouseDown={stopProp}
                onTouchEnd={(e) => handleButtonAction(e, () => setShowInfo(!showInfo))}
                onClick={(e) => handleButtonAction(e, () => setShowInfo(!showInfo))}
                className="p-2 rounded-full bg-white/10 backdrop-blur-sm active:bg-white/20"
              >
                  <Info className="w-7 h-7 text-white drop-shadow-md" />
              </button>
              <span className="text-white text-xs font-bold shadow-black drop-shadow-md">信息</span>
          </div>

           <div 
                onTouchStart={stopProp}
                onMouseDown={stopProp}
                onTouchEnd={(e) => handleButtonAction(e, onToggleMute)}
                onClick={(e) => handleButtonAction(e, onToggleMute)}
                className={`mt-4 w-10 h-10 rounded-full bg-zinc-900 border-4 cursor-pointer transition-colors duration-300 flex items-center justify-center overflow-hidden ${isMuted ? 'border-red-500/80' : 'border-zinc-800'} ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}
           >
                {posterSrc ? (
                    <img src={posterSrc} className="w-full h-full object-cover opacity-70" />
                ) : (
                    <Disc className="w-6 h-6 text-zinc-500" />
                )}
           </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-all duration-300 pointer-events-auto z-10 ${showInfo ? 'h-2/3 from-black/95' : 'pt-24'}`}>
        <div className="flex flex-col items-start max-w-[80%]">
            <h3 className="text-white font-bold text-lg drop-shadow-md mb-2 leading-tight">
              {item.Name}
            </h3>
            
            <div className="flex items-center gap-3 text-xs text-white/90 mb-2 font-medium drop-shadow-md">
               {item.ProductionYear && <span className="bg-white/20 px-1.5 py-0.5 rounded">{item.ProductionYear}</span>}
               <span>{formatTimeText(item.RunTimeTicks)}</span>
               <span className="uppercase border border-white/30 px-1 rounded text-[10px]">{item.MediaType || '视频'}</span>
            </div>

            <div 
                onTouchStart={stopProp}
                onMouseDown={stopProp}
                onTouchEnd={(e) => handleButtonAction(e, () => setShowInfo(!showInfo))}
                onClick={(e) => handleButtonAction(e, () => setShowInfo(!showInfo))}
                className={`text-white/80 text-sm drop-shadow-md transition-all duration-300 cursor-pointer ${showInfo ? 'line-clamp-none overflow-y-auto max-h-[40vh]' : 'line-clamp-2'}`}
            >
                {item.Overview || '暂无简介'}
            </div>
            
            {!showInfo && item.Overview && (
                <button 
                    onTouchStart={stopProp}
                    onMouseDown={stopProp}
                    onTouchEnd={(e) => handleButtonAction(e, () => setShowInfo(!showInfo))}
                    onClick={(e) => handleButtonAction(e, () => setShowInfo(!showInfo))}
                    className="text-white/60 text-xs font-semibold mt-1"
                >
                    更多
                </button>
            )}
        </div>
      </div>

      {/* Progress Bar for Videos > 3 minutes (180s) */}
      {duration > 180 && (
          <div 
            className="absolute bottom-8 left-4 right-4 h-8 flex items-center z-50 pointer-events-auto touch-none"
            onTouchStart={handleSeekStart}
            onTouchMove={handleSeekMove}
            onTouchEnd={handleSeekEnd}
            onClick={(e) => e.stopPropagation()} 
          >
              {/* Visual Track */}
              <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden relative">
                   {/* Played Portion */}
                  <div 
                      className="h-full bg-indigo-500 transition-all duration-75"
                      style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
              </div>
               {/* Thumb / Slider Handle */}
               <div 
                    className="absolute w-4 h-4 bg-white rounded-full shadow-lg transform -translate-x-2"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
               />
          </div>
      )}
    </div>
  );
};

export default VideoCard;
