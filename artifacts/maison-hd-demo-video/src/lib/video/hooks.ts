import { useState, useEffect } from 'react';

// Mock definition for the hook required by the video player structure
export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const sceneKeys = Object.keys(durations);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    // Auto-advance scenes based on their duration
    const currentDuration = durations[sceneKeys[currentSceneIndex]];
    timeout = setTimeout(() => {
      setCurrentSceneIndex((prev) => (prev + 1) % sceneKeys.length);
    }, currentDuration);

    return () => clearTimeout(timeout);
  }, [currentSceneIndex, durations, sceneKeys]);

  return { currentScene: currentSceneIndex };
}
