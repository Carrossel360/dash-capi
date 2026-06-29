import { prisma } from '@/lib/db'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

// Save a base64 data URL to Neon and return a public URL served by /api/media/[id].
export async function uploadMedia(
  base64DataUrl: string,
  workspaceId: string,
  mimeType?: string,
): Promise<string> {
  const mime = mimeType ?? base64DataUrl.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream'

  const file = await prisma.mediaFile.create({
    data: { workspaceId, mimeType: mime, data: base64DataUrl },
  })

  return `${BASE_URL}/api/media/${file.id}`
}
