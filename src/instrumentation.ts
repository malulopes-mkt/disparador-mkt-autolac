export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCampaignScheduler } = await import('./lib/campaign-scheduler')
    startCampaignScheduler()
    const { startHubspotListsSync } = await import('./lib/hubspot-lists')
    startHubspotListsSync()
  }
}
