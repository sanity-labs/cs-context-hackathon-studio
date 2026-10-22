/** Setup writes these to apps/studio/.env. The Studio only sees variables that start with SANITY_STUDIO_. */
export const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'missing-project-id'
export const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
export const organizationId = process.env.SANITY_STUDIO_ORGANIZATION_ID || ''
export const apiVersion = '2026-09-01'

export function organizationUrl(path = ''): string {
  return `https://www.sanity.io/@${organizationId}/${path}`
}
