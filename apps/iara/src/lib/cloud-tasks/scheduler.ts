/**
 * Cloud Tasks integration for scheduled social media publishing.
 *
 * Uses the Cloud Tasks REST API directly (no SDK) to avoid Turbopack
 * bundling issues with the @google-cloud/tasks gRPC-based SDK.
 *
 * Authentication via google-auth-library (ADC), which is already
 * available as a transitive dependency of firebase-admin.
 *
 * @see https://cloud.google.com/tasks/docs/reference/rest/v2/projects.locations.queues.tasks
 */

import { GoogleAuth } from 'google-auth-library'

import { log } from '@/lib/logger'

function getConfig() {
  return {
    enabled: process.env.CLOUD_TASKS_ENABLED !== 'false',
    project: process.env.GCP_PROJECT_ID || 'pptnc-stage',
    location: process.env.GCP_LOCATION || 'us-east1',
    queue: process.env.CLOUD_TASKS_QUEUE || 'social-publish',
    appUrl: process.env.NEXTAUTH_URL || process.env.APP_URL || '',
  }
}

const CLOUD_TASKS_API = 'https://cloudtasks.googleapis.com/v2'

/**
 * Gets an authenticated access token via ADC.
 */
async function getAccessToken(): Promise<string> {
  const { project } = getConfig()
  const auth = new GoogleAuth({
    projectId: project,
    scopes: ['https://www.googleapis.com/auth/cloud-tasks'],
  })
  const client = await auth.getClient()
  const tokenResponse = await client.getAccessToken()
  if (!tokenResponse.token) {
    throw new Error('Failed to get access token for Cloud Tasks API')
  }
  return tokenResponse.token
}

/**
 * Creates a Cloud Task to execute a scheduled post at the specified time.
 *
 * @param scheduledPostId - The Firestore document ID
 * @param scheduledAt - ISO 8601 datetime for execution
 * @returns The full task name (GCP resource path) for cancellation
 */
export async function createPublishTask(
  scheduledPostId: string,
  scheduledAt: string
): Promise<string> {
  const config = getConfig()

  if (!config.enabled) {
    log('INFO', 'Cloud Tasks disabled — skipping task creation (dev mode)', {
      scheduledPostId,
      scheduledAt,
    })
    return `dev-task-${scheduledPostId}`
  }

  const parent = `projects/${config.project}/locations/${config.location}/queues/${config.queue}`
  const token = await getAccessToken()

  const scheduleDate = new Date(scheduledAt)

  const body = {
    task: {
      scheduleTime: scheduleDate.toISOString(),
      httpRequest: {
        httpMethod: 'POST',
        url: `${config.appUrl}/api/social/execute`,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify({ scheduledPostId })).toString('base64'),
      },
    },
  }

  const response = await fetch(`${CLOUD_TASKS_API}/${parent}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    log('ERROR', 'Cloud Tasks API create failed', {
      status: response.status,
      error: errorBody,
      parent,
    })
    throw new Error(`Cloud Tasks create failed: ${response.status} ${JSON.stringify(errorBody)}`)
  }

  const data = await response.json()
  const taskName = data.name || ''

  log('INFO', 'Cloud Task created', {
    scheduledPostId,
    scheduledAt,
    taskName,
  })

  return taskName
}

/**
 * Cancels (deletes) a Cloud Task.
 *
 * Silently ignores if the task doesn't exist (already executed).
 *
 * @param taskName - Full GCP resource path of the task
 */
export async function cancelPublishTask(taskName: string): Promise<void> {
  const config = getConfig()

  if (!config.enabled || taskName.startsWith('dev-task-')) {
    log('INFO', 'Cloud Tasks disabled — skipping task cancellation (dev mode)', { taskName })
    return
  }

  const token = await getAccessToken()

  const response = await fetch(`${CLOUD_TASKS_API}/${taskName}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (response.ok || response.status === 204) {
    log('INFO', 'Cloud Task cancelled', { taskName })
    return
  }

  // 404 = task already executed or doesn't exist — safe to ignore
  if (response.status === 404) {
    log('INFO', 'Cloud Task not found (already executed)', { taskName })
    return
  }

  const errorBody = await response.json().catch(() => ({}))
  log('ERROR', 'Failed to cancel Cloud Task', {
    taskName,
    status: response.status,
    error: errorBody,
  })
  throw new Error(`Cloud Tasks delete failed: ${response.status}`)
}
