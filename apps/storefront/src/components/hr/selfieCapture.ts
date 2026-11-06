/**
 * The camera preview is shown mirrored (like a mirror / front camera on a
 * phone). The saved selfie must look exactly like that preview, so the frame
 * is flipped horizontally before it is drawn to the canvas.
 */
export const drawMirroredVideoFrame = (
  context: Pick<CanvasRenderingContext2D, 'translate' | 'scale' | 'drawImage' | 'setTransform'>,
  video: CanvasImageSource,
  width: number,
): void => {
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.translate(width, 0)
  context.scale(-1, 1)
  context.drawImage(video, 0, 0)
  context.setTransform(1, 0, 0, 1, 0, 0)
}
