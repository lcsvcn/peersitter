import { useEffect, useRef, useState } from "react";
import { homekitMotion } from "../lib/homekit";
import { MotionDetector, LocalRecorder, recordingFilename, type ClipStorage } from "@peersitter/core";

/**
 * Wires a MediaStream to motion detection: while `enabled`, recording
 * starts automatically when movement is seen and stops (saving the clip
 * into `storage`, which enforces the ring-buffer cap) once things go
 * quiet again. Only "movements or things important" end up recorded.
 */
export function useMotionRecording(
  stream: MediaStream | null,
  storage: ClipStorage | null,
  enabled: boolean,
  sensitivity: number,
  filenamePrefix: string,
) {
  const [isRecording, setIsRecording] = useState(false);
  const [lastSavedClip, setLastSavedClip] = useState<string | null>(null);
  const recorderRef = useRef(new LocalRecorder());

  useEffect(() => {
    if (!enabled || !stream || !storage) return;

    const detector = new MotionDetector(stream, { sensitivity });
    detector.onMotionStart = () => {
      homekitMotion(true);
      recorderRef.current.start(stream);
      setIsRecording(true);
    };
    detector.onMotionEnd = async () => {
      homekitMotion(false);
      if (!recorderRef.current.isRecording) return;
      const blob = await recorderRef.current.stop();
      const name = recordingFilename(filenamePrefix);
      await storage.saveClip(blob, name);
      setLastSavedClip(name);
      setIsRecording(false);
    };
    detector.start();

    return () => {
      detector.stop();
      homekitMotion(false);
      // Don't discard a clip that was mid-recording when motion recording
      // got toggled off or the page navigated away — save what we have.
      if (recorderRef.current.isRecording) {
        void recorderRef.current.stop().then((blob) => storage.saveClip(blob, recordingFilename(filenamePrefix)));
      }
      setIsRecording(false);
    };
  }, [enabled, stream, storage, sensitivity, filenamePrefix]);

  return { isRecording, lastSavedClip };
}
