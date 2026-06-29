import axios from 'axios'

interface MetaCAPIEvent {
  event_name: string
  event_time: number
  event_id: string
  action_source: string
  user_data: Record<string, unknown>
  custom_data?: Record<string, unknown>
}

interface MetaCAPIOptions {
  pixelId: string
  accessToken: string
  event: MetaCAPIEvent
}

export async function sendMetaCAPI({ pixelId, accessToken, event }: MetaCAPIOptions) {
  const url = `https://graph.facebook.com/v25.0/${pixelId}/events`

  const payload: Record<string, unknown> = {
    data: [event],
    access_token: accessToken,
  }

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE
  }

  const response = await axios.post(url, payload)
  return response.data
}
