import { describe, expect, it } from 'vitest'
import { drawMirroredVideoFrame } from './selfieCapture'

describe('drawMirroredVideoFrame', () => {
  it('flips the frame horizontally so the saved selfie matches the mirrored preview', () => {
    const calls: string[] = []
    const context = {
      setTransform: (...args: number[]) => { calls.push(`setTransform(${args.join(',')})`) },
      translate: (x: number, y: number) => { calls.push(`translate(${x},${y})`) },
      scale: (x: number, y: number) => { calls.push(`scale(${x},${y})`) },
      drawImage: () => { calls.push('drawImage') },
    }
    drawMirroredVideoFrame(context as never, {} as CanvasImageSource, 640)
    expect(calls).toEqual(['setTransform(1,0,0,1,0,0)', 'translate(640,0)', 'scale(-1,1)', 'drawImage', 'setTransform(1,0,0,1,0,0)'])
  })
})
