/**
 * @file OrderFinishPhotoDialog.tsx
 * @description Mandatory "order finished" photo, required before an order
 * can advance into Ready. Mobile gets camera/library capture and desktop gets
 * drag/drop. Upload + authoritative order attachment are treated as one user
 * confirmation; attachment failure is surfaced without closing the dialog.
 */

import type { ChangeEvent, FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Camera, Crop, ImageOff, UploadCloud } from 'lucide-react'
import {
  FINISH_PHOTO_HEIGHT_PX,
  FINISH_PHOTO_MAX_BYTES,
  FINISH_PHOTO_WIDTH_PX,
  dataUrlToBlob,
  drawFinishPhotoCrop,
  exportFinishPhoto,
} from '../../domain/orderFinishPhotoDomain'
import { uploadOrderFinishPhoto } from '../../data/orderMediaUpload'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Slider } from '../ui/slider'

export interface OrderFinishPhotoDialogProps {
  open: boolean
  orderId: string
  onCancel: () => void
  onUploaded: (finishPhotoUrl: string) => Promise<void> | void
}

const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read that file.')))
    reader.onerror = () => reject(new Error('Could not read that file, try again.'))
    reader.readAsDataURL(file)
  })

export const OrderFinishPhotoDialog: FC<OrderFinishPhotoDialogProps> = ({ open, orderId, onCancel, onUploaded }) => {
  const [error, setError] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const libraryInputRef = useRef<HTMLInputElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const exportCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!open) {
      setError(null)
      setSourceUrl(null)
      setSourceImage(null)
      setZoom(1)
      setOffsetX(0)
      setOffsetY(0)
    }
  }, [open])

  useEffect(() => {
    if (!sourceUrl) {
      setSourceImage(null)
      return
    }
    const image = new Image()
    image.onload = () => setSourceImage(image)
    image.onerror = () => setError('Could not open that photo.')
    image.src = sourceUrl
  }, [sourceUrl])

  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas || !sourceImage) return
    drawFinishPhotoCrop(canvas, sourceImage, { zoom, offsetX, offsetY })
  }, [sourceImage, zoom, offsetX, offsetY])

  const openFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setError('Photo is too large (max 10 MB).')
      return
    }
    try {
      const nextSource = await readFileAsDataUrl(file)
      setZoom(1)
      setOffsetX(0)
      setOffsetY(0)
      setSourceUrl(nextSource)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not read that file.')
    }
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void openFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleConfirm = async () => {
    if (!sourceImage || !exportCanvasRef.current || uploading) return
    setUploading(true)
    setError(null)
    try {
      drawFinishPhotoCrop(exportCanvasRef.current, sourceImage, { zoom, offsetX, offsetY })
      const dataUrl = exportFinishPhoto(exportCanvasRef.current)
      const blob = dataUrlToBlob(dataUrl)
      const finishPhotoUrl = await uploadOrderFinishPhoto(orderId, blob)
      await onUploaded(finishPhotoUrl)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not save this photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !uploading) onCancel() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Crop className="size-4" /> Photo the finished order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {sourceImage ? (
            <>
              <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-xl bg-muted ring-1 ring-border" style={{ aspectRatio: `${FINISH_PHOTO_WIDTH_PX} / ${FINISH_PHOTO_HEIGHT_PX}` }}>
                <canvas ref={previewCanvasRef} width={FINISH_PHOTO_WIDTH_PX} height={FINISH_PHOTO_HEIGHT_PX} className="h-full w-full" aria-label="Finish photo crop preview" />
              </div>
              <div className="space-y-3 rounded-xl bg-muted/50 p-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs"><span>Zoom</span><span>{zoom.toFixed(2)}×</span></div>
                  <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={([next]) => setZoom(next)} aria-label="Photo zoom" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs"><span>Horizontal position</span><span>{Math.round(offsetX * 100)}%</span></div>
                  <Slider value={[offsetX]} min={-1} max={1} step={0.01} onValueChange={([next]) => setOffsetX(next)} aria-label="Horizontal crop position" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs"><span>Vertical position</span><span>{Math.round(offsetY * 100)}%</span></div>
                  <Slider value={[offsetY]} min={-1} max={1} step={0.01} onValueChange={([next]) => setOffsetY(next)} aria-label="Vertical crop position" />
                </div>
              </div>
              <button type="button" disabled={uploading} onClick={() => { setSourceUrl(null); setSourceImage(null) }} className="text-xs font-medium text-muted-foreground underline disabled:opacity-50">
                Choose a different photo
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:hidden">
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted text-center hover:border-primary/40 hover:bg-accent/40">
                  <Camera className="size-6 text-muted-foreground" />
                  <span className="text-2xs font-medium text-foreground">Take Photo</span>
                </button>
                <button type="button" onClick={() => libraryInputRef.current?.click()} className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted text-center hover:border-primary/40 hover:bg-accent/40">
                  <ImageOff className="size-6 text-muted-foreground" />
                  <span className="text-2xs font-medium text-foreground">Choose from Library</span>
                </button>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => libraryInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    libraryInputRef.current?.click()
                  }
                }}
                onDragOver={(event) => { event.preventDefault(); setIsDragActive(true) }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragActive(false)
                  void openFile(event.dataTransfer.files?.[0])
                }}
                className={`hidden aspect-[4/5] w-full max-w-[220px] mx-auto cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 text-center transition sm:flex ${isDragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted hover:border-primary/40 hover:bg-accent/40'}`}
              >
                {isDragActive ? <UploadCloud className="size-6 text-primary" /> : <ImageOff className="size-6 text-muted-foreground" />}
                <p className="text-2xs font-medium text-foreground">Drag & drop a photo</p>
                <p className="text-2xs text-muted-foreground">4:5 crop · max {FINISH_PHOTO_MAX_BYTES / 1024} KB after compression</p>
              </div>
            </>
          )}

          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleInputChange} />
          <input ref={libraryInputRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
          {error && <p className="text-2xs text-destructive" role="alert">{error}</p>}
        </div>

        <canvas ref={exportCanvasRef} className="hidden" />
        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={uploading} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => { void handleConfirm() }} disabled={!sourceImage || uploading} className="rounded-full bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">
            {uploading ? 'Saving…' : 'Use this photo'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default OrderFinishPhotoDialog
