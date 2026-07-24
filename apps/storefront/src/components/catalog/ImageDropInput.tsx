/**
 * @file ImageDropInput.tsx
 * @description Catalog image input with a required 1:1 crop/edit step.
 * The accepted result is an 800x800 JPEG compressed to at most 100 KB.
 */

import type { FC, ChangeEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Crop, ImageOff, Pencil, Trash2, UploadCloud } from 'lucide-react'
import {
  CATALOG_IMAGE_MAX_BYTES,
  CATALOG_IMAGE_SIZE_PX,
  drawCatalogImageCrop,
  exportCatalogImage,
  getDataUrlByteSize,
} from '../../domain/catalogImageDomain'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Slider } from '../ui/slider'

export interface ImageDropInputProps {
  value?: string
  onChange: (value: string | undefined) => void
  label?: string
}

const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read that file.'))
    reader.onerror = () => reject(new Error('Could not read that file, try again.'))
    reader.readAsDataURL(file)
  })

export const ImageDropInput: FC<ImageDropInputProps> = ({
  value,
  onChange,
  label = 'Product photo',
}) => {
  const [isDragActive, setIsDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [processing, setProcessing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const exportCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!sourceUrl) {
      setSourceImage(null)
      return
    }
    const image = new Image()
    image.onload = () => setSourceImage(image)
    image.onerror = () => setError('Could not open that image.')
    image.src = sourceUrl
  }, [sourceUrl])

  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas || !sourceImage) return
    drawCatalogImageCrop(canvas, sourceImage, { zoom, offsetX, offsetY })
  }, [sourceImage, zoom, offsetX, offsetY])

  const resetEditor = () => {
    setZoom(1)
    setOffsetX(0)
    setOffsetY(0)
    setSourceImage(null)
    setSourceUrl(null)
  }

  const openFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setError('Source image is too large (max 10 MB).')
      return
    }

    try {
      const nextSource = await readFileAsDataUrl(file)
      setZoom(1)
      setOffsetX(0)
      setOffsetY(0)
      setSourceUrl(nextSource)
      setEditorOpen(true)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not read that file.')
    }
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void openFile(event.target.files?.[0])
    event.target.value = ''
  }

  const applyCrop = () => {
    if (!sourceImage || !exportCanvasRef.current) return
    setProcessing(true)
    setError(null)
    try {
      drawCatalogImageCrop(exportCanvasRef.current, sourceImage, { zoom, offsetX, offsetY })
      const result = exportCatalogImage(exportCanvasRef.current)
      onChange(result)
      setEditorOpen(false)
      resetEditor()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not process that image.')
    } finally {
      setProcessing(false)
    }
  }

  const sizeLabel = value && value.startsWith('data:image/jpeg')
    ? `${Math.ceil(getDataUrlByteSize(value) / 1024)} KB · ${CATALOG_IMAGE_SIZE_PX}×${CATALOG_IMAGE_SIZE_PX} JPEG`
    : null

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground/90">{label}</label>

      {value ? (
        <div className="space-y-1.5">
          <div className="relative aspect-square w-full max-w-[220px] overflow-hidden rounded-xl bg-muted ring-1 ring-border/70">
            <img src={value} alt={label} className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8">
              <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-full bg-card/95 px-[18px] text-sm font-medium text-foreground ring-1 ring-border/60 hover:bg-accent">
                <Pencil className="size-3" /> Replace
              </button>
              <button type="button" onClick={() => onChange(undefined)} className="inline-flex h-11 items-center gap-2 rounded-full bg-white/95 px-[18px] text-sm font-medium text-destructive shadow-ios-sm hover:bg-white">
                <Trash2 className="size-3" /> Remove
              </button>
            </div>
          </div>
          {sizeLabel && <p className="text-2xs text-muted-foreground">{sizeLabel}</p>}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(event) => { event.preventDefault(); setIsDragActive(true) }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragActive(false)
            void openFile(event.dataTransfer.files?.[0])
          }}
          className={`flex aspect-square w-full max-w-[220px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 text-center transition ${isDragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted hover:border-primary/40 hover:bg-accent/40'}`}
        >
          {isDragActive ? <UploadCloud className="size-6 text-primary" /> : <ImageOff className="size-6 text-muted-foreground" />}
          <p className="text-2xs font-medium text-foreground">Drag & drop an image</p>
          <p className="text-2xs text-muted-foreground">Crop to 1:1 before upload</p>
          <p className="text-2xs text-muted-foreground">800×800 JPEG · max 100 KB</p>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
      {error && <p className="text-2xs text-destructive" role="alert">{error}</p>}

      <Dialog open={editorOpen} onOpenChange={(open) => {
        setEditorOpen(open)
        if (!open) resetEditor()
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Crop className="size-4" /> Crop product image</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-xl bg-muted ring-1 ring-border">
              <canvas ref={previewCanvasRef} width={CATALOG_IMAGE_SIZE_PX} height={CATALOG_IMAGE_SIZE_PX} className="h-full w-full" aria-label="Square crop preview" />
            </div>

            <div className="space-y-3 rounded-xl bg-muted/50 p-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs"><span>Zoom</span><span>{zoom.toFixed(2)}×</span></div>
                <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={([next]) => setZoom(next)} aria-label="Image zoom" />
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
            <p className="text-xs text-muted-foreground">The saved image will be a square JPEG, 800×800 pixels, and no larger than {CATALOG_IMAGE_MAX_BYTES / 1024} KB.</p>
          </div>

          <canvas ref={exportCanvasRef} className="hidden" />
          <DialogFooter>
            <button type="button" onClick={() => setEditorOpen(false)} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium">Cancel</button>
            <button type="button" onClick={applyCrop} disabled={!sourceImage || processing} className="rounded-full bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">
              {processing ? 'Processing…' : 'Apply crop'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ImageDropInput
