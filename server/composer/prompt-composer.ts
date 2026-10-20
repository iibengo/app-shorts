import { createHash } from 'node:crypto'

export class PromptComposer {
  keyframeFlux(prompt: string): string {
    return `Cinematic vertical 9:16 keyframe for a short video. ${prompt}. Single clear subject, natural lighting, photorealistic, no text, no watermark, no logo.`
  }

  keyframeKontext(prompt: string): string {
    return `Using the reference image as the visual anchor, create a cinematic vertical 9:16 keyframe for a short video. ${prompt}. Preserve the subject identity, clothing and color palette. No text, no watermark, no logo.`
  }

  videoPrompt(prompt: string): string {
    return `${prompt}. Vertical 9:16 short video, smooth natural motion, consistent subject, no text, no watermark, no logo.`
  }

  hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex')
  }
}
